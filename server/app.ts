import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { openDatabase, type Store } from './db.js';
import { users } from './schema.js';
import { seedDatabase } from './seed.js';

type Row = Record<string, any>;
type Session = { id: string; csrf: string; user: Row | null };
type ContextRequest = Request & { context: Session };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
const candidateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = existsSync(path.join(candidateRoot, 'package.json'))
  ? candidateRoot
  : path.resolve(candidateRoot, '..');
const now = () => new Date().toISOString();
const token = () => randomBytes(32).toString('hex');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const hashPassword = (value: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
};
const passwordMatches = (value: string, encoded: string) => {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(value, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  line1: z.string().trim().min(3).max(150),
  line2: z.string().trim().max(150).optional().default(''),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(80),
});
const productSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(5000),
  price: z.number().int().min(1).max(100000000),
  stock: z.number().int().min(0).max(100000),
  categoryId: z.number().int().positive(),
  images: z
    .array(
      z
        .string()
        .regex(
          /^\/images\/(?:[a-zA-Z0-9_-]+\.(?:svg|png|jpe?g|webp)|uploads\/[a-f0-9]{64}\.(?:png|jpg|webp))$/,
        ),
    )
    .min(1)
    .max(8),
  archived: z.boolean().optional(),
});
const positiveId = (value: unknown) => z.coerce.number().int().positive().parse(value);
const publicUser = (user: Row) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: Boolean(user.active),
});
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';

export type AppOptions = {
  databasePath?: string;
  seed?: boolean;
  outboxPath?: string;
  production?: boolean;
  uploadsPath?: string;
};
export function createApp(options: AppOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  if (production && options.seed && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Production demo seeding requires explicit ALLOW_DEMO_SEED=true.');
  }
  const store = openDatabase(options.databasePath);
  if (options.seed) seedDatabase(store);
  const sql = store.sqlite;
  sql.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
  sql.prepare('DELETE FROM password_resets WHERE expires_at<=?').run(now());
  const app = express();
  const outboxPath = path.resolve(options.outboxPath ?? process.env.OUTBOX_PATH ?? 'data/outbox');
  const uploadsPath = path.resolve(
    options.uploadsPath ?? process.env.UPLOADS_PATH ?? 'data/uploads',
  );
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              fontSrc: ["'self'"],
              connectSrc: ["'self'"],
              upgradeInsecureRequests: null,
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: false,
    }),
  );
  app.use('/api/seller/images', express.json({ limit: '4500kb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  const get = (query: string, ...params: any[]) =>
    sql.prepare(query).get(...params) as Row | undefined;
  const all = (query: string, ...params: any[]) => sql.prepare(query).all(...params) as Row[];
  const run = (query: string, ...params: any[]) => sql.prepare(query).run(...params);
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
  const createSession = (res: Response, userId: number | null = null) => {
    const raw = token();
    const id = digest(raw);
    const csrf = token();
    run(
      'INSERT INTO sessions (id,user_id,csrf_token,expires_at) VALUES (?,?,?,?)',
      id,
      userId,
      csrf,
      new Date(Date.now() + cookieOptions.maxAge).toISOString(),
    );
    res.cookie('legant_session', raw, cookieOptions);
    return { id, csrf, user: userId ? get('SELECT * FROM users WHERE id=?', userId)! : null };
  };
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const raw = req.cookies.legant_session;
    const session =
      typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw)
        ? get('SELECT * FROM sessions WHERE id=? AND expires_at>?', digest(raw), now())
        : undefined;
    let context: Session;
    if (!session) context = createSession(res);
    else {
      const user = session.user_id
        ? (get('SELECT * FROM users WHERE id=? AND active=1', session.user_id) ?? null)
        : null;
      if (session.user_id && !user) {
        run('DELETE FROM sessions WHERE id=?', session.id);
        context = createSession(res);
      } else context = { id: session.id, csrf: session.csrf_token, user };
    }
    (req as ContextRequest).context = context;
    next();
  });
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.get('X-CSRF-Token');
      const expected = (req as ContextRequest).context.csrf;
      if (
        !csrf ||
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))
      )
        return next(new HttpError(403, 'Your session expired. Refresh the page and try again.'));
      if (!req.is('application/json'))
        return next(new HttpError(415, 'Use application/json for API requests.'));
    }
    next();
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  const submissionLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many submissions. Please try again later.' },
  });
  app.use('/api/contact', submissionLimiter);
  app.use('/api/newsletter', submissionLimiter);
  const ctx = (req: Request) => (req as ContextRequest).context;
  const auth = (req: Request) => ctx(req).user ?? fail(401, 'Please sign in to continue.');
  const seller = (req: Request) => {
    const user = auth(req);
    if (!['seller', 'admin'].includes(user.role)) fail(403, 'Seller access required.');
    return user;
  };
  const admin = (req: Request) => {
    const user = auth(req);
    if (user.role !== 'admin') fail(403, 'Administrator access required.');
    return user;
  };
  const ownerKey = (req: Request) =>
    ctx(req).user ? `user:${ctx(req).user!.id}` : `guest:${ctx(req).id}`;
  const productSelect = `SELECT p.*,c.name category,c.slug category_slug,u.name seller_name,COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.product_id=p.id AND r.approved=1),0) rating,(SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.approved=1) review_count FROM products p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.seller_id`;
  const productView = (p: Row) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    stock: p.stock,
    categoryId: p.category_id,
    category: p.category,
    categorySlug: p.category_slug,
    sellerId: p.seller_id,
    sellerName: p.seller_name,
    images: JSON.parse(p.images),
    archived: Boolean(p.archived),
    createdAt: p.created_at,
    rating: Number(Number(p.rating).toFixed(1)),
    reviewCount: p.review_count,
  });
  const productById = (id: number) => {
    const p = get(`${productSelect} WHERE p.id=?`, id);
    return p ? productView(p) : fail(404, 'Product not found.');
  };
  const categories = () => all('SELECT id,name,slug FROM categories ORDER BY name');
  const reviewView = (r: Row) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    userName: r.user_name,
    rating: r.rating,
    body: r.body,
    verified: Boolean(r.verified),
    approved: Boolean(r.approved),
    createdAt: r.created_at,
  });
  const addressView = (a: Row) => ({
    id: a.id,
    name: a.name,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postalCode: a.postal_code,
    country: a.country,
  });
  const pricing = (subtotal: number, method = 'standard') => {
    const shipping = subtotal === 0 ? 0 : method === 'express' ? 1800 : subtotal >= 15000 ? 0 : 800;
    const tax = Math.round(subtotal * 0.08);
    return { subtotal, shipping, tax, total: subtotal + shipping + tax };
  };
  const cart = (owner: string) => {
    const items = all(
      `${productSelect.replace('SELECT p.*,', 'SELECT p.*,ci.quantity,')} JOIN cart_items ci ON ci.product_id=p.id WHERE ci.owner_key=? ORDER BY ci.id`,
      owner,
    ).map((p) => ({ product: productView(p), quantity: p.quantity }));
    return {
      items,
      ...pricing(items.reduce((total, item) => total + item.product.price * item.quantity, 0)),
    };
  };
  const mergeAndRotate = (req: Request, res: Response, userId: number) => {
    const old = ctx(req);
    const guest = `guest:${old.id}`;
    const owner = `user:${userId}`;
    sql.transaction(() => {
      for (const item of all(
        'SELECT ci.*,p.stock,p.archived FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.owner_key=?',
        guest,
      )) {
        if (item.archived || item.stock < 1) continue;
        const current =
          get(
            'SELECT quantity FROM cart_items WHERE owner_key=? AND product_id=?',
            owner,
            item.product_id,
          )?.quantity ?? 0;
        run(
          'INSERT INTO cart_items (owner_key,product_id,quantity) VALUES (?,?,?) ON CONFLICT(owner_key,product_id) DO UPDATE SET quantity=excluded.quantity',
          owner,
          item.product_id,
          Math.min(99, item.stock, current + item.quantity),
        );
      }
      run('DELETE FROM cart_items WHERE owner_key=?', guest);
      run('DELETE FROM sessions WHERE id=?', old.id);
    })();
    const fresh = createSession(res, userId);
    (req as ContextRequest).context = fresh;
    return { user: publicUser(fresh.user!), csrfToken: fresh.csrf };
  };
  const orderView = (o: Row, sellerId?: number) => {
    const rows = all(
      `SELECT * FROM order_items WHERE order_id=?${sellerId ? ' AND seller_id=?' : ''} ORDER BY id`,
      o.id,
      ...(sellerId ? [sellerId] : []),
    );
    const items = rows.map((i) => ({
      id: i.id,
      productId: i.product_id,
      sellerId: i.seller_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      image: i.image,
      status: i.status,
    }));
    const scopeSubtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const scoped = sellerId
      ? {
          subtotal: scopeSubtotal,
          shipping: 0,
          tax: Math.round(scopeSubtotal * 0.08),
          total: scopeSubtotal + Math.round(scopeSubtotal * 0.08),
        }
      : { subtotal: o.subtotal, shipping: o.shipping, tax: o.tax, total: o.total };
    const status =
      items.length && items.every((i) => i.status === 'delivered')
        ? 'delivered'
        : items.length && items.every((i) => i.status !== 'processing')
          ? 'shipped'
          : 'processing';
    return {
      id: o.id,
      userId: o.user_id,
      buyerName: get('SELECT name FROM users WHERE id=?', o.user_id)?.name ?? 'Customer',
      createdAt: o.created_at,
      status,
      ...scoped,
      address: JSON.parse(o.address),
      shippingMethod: o.shipping_method,
      paymentMode: o.payment_mode,
      items,
    };
  };
  const updateAggregateStatus = (id: number) => {
    const statuses = all('SELECT status FROM order_items WHERE order_id=?', id).map(
      (r) => r.status,
    );
    const status = statuses.every((s) => s === 'delivered')
      ? 'delivered'
      : statuses.every((s) => s !== 'processing')
        ? 'shipped'
        : 'processing';
    run('UPDATE orders SET status=? WHERE id=?', status, id);
  };
  const transitionOrder = (id: number, next: string, sellerId?: number) => {
    const rows = all(
      `SELECT * FROM order_items WHERE order_id=?${sellerId ? ' AND seller_id=?' : ''}`,
      id,
      ...(sellerId ? [sellerId] : []),
    );
    if (!rows.length) fail(404, 'Order not found.');
    const rank = ['processing', 'shipped', 'delivered'];
    if (next === 'processing') {
      if (rows.some((i) => i.status !== 'processing'))
        fail(409, 'An order cannot return to processing.');
      return;
    }
    const pending = rows.filter((i) => rank.indexOf(i.status) < rank.indexOf(next));
    if (pending.some((i) => rank.indexOf(next) !== rank.indexOf(i.status) + 1))
      fail(409, 'Ship the order before marking it delivered.');
    if (!pending.length) {
      if (rows.some((i) => rank.indexOf(i.status) > rank.indexOf(next)))
        fail(409, 'Order status cannot move backwards.');
      return;
    }
    sql.transaction(() => {
      for (const item of pending) run('UPDATE order_items SET status=? WHERE id=?', next, item.id);
      updateAggregateStatus(id);
    })();
  };

  app.get('/api/health', (_req, res) => {
    sql.prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'ok' });
  });
  app.get('/api/auth/session', (req, res) =>
    res.json({ user: ctx(req).user ? publicUser(ctx(req).user!) : null, csrfToken: ctx(req).csrf }),
  );
  app.post('/api/auth/register', (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: emailSchema,
        password: passwordSchema,
        role: z.enum(['buyer', 'seller']).default('buyer'),
      })
      .parse(req.body);
    if (get('SELECT id FROM users WHERE email=?', input.email))
      fail(409, 'An account already exists with that email.');
    const id = sql.transaction(() => {
      const result = run(
        'INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',
        input.name,
        input.email,
        hashPassword(input.password),
        input.role,
      );
      const id = Number(result.lastInsertRowid);
      if (input.role === 'seller')
        run(
          'INSERT INTO seller_profiles (user_id,store_name) VALUES (?,?)',
          id,
          `${input.name} Studio`,
        );
      return id;
    })();
    res.status(201).json(mergeAndRotate(req, res, id));
  });
  app.post('/api/auth/login', (req, res) => {
    const input = z
      .object({ email: emailSchema, password: z.string().min(1).max(128) })
      .parse(req.body);
    const user = get('SELECT * FROM users WHERE email=?', input.email);
    const encoded = user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    if (!passwordMatches(input.password, encoded) || !user || !user.active)
      fail(401, 'Email or password is incorrect.');
    res.json(mergeAndRotate(req, res, user.id));
  });
  app.post('/api/auth/logout', (req, res) => {
    run('DELETE FROM sessions WHERE id=?', ctx(req).id);
    const fresh = createSession(res);
    (req as ContextRequest).context = fresh;
    res.json({ user: null, csrfToken: fresh.csrf });
  });
  app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const user = get('SELECT * FROM users WHERE email=? AND active=1', email);
    if (user) {
      const raw = token();
      sql.transaction(() => {
        run('DELETE FROM password_resets WHERE user_id=?', user.id);
        run(
          'INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)',
          digest(raw),
          user.id,
          new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        );
      })();
      mkdirSync(outboxPath, { recursive: true, mode: 0o700 });
      appendFileSync(
        path.join(outboxPath, 'password-reset.jsonl'),
        JSON.stringify({
          to: email,
          subject: 'Reset your 3legant password',
          resetUrl: `/reset-password?token=${raw}`,
          createdAt: now(),
          expiresInMinutes: 30,
        }) + '\n',
        { mode: 0o600 },
      );
    }
    res.json({
      message:
        'If that account exists, a password reset message is available in the local development outbox.',
    });
  });
  app.post('/api/auth/reset-password', (req, res) => {
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
      .parse(req.body);
    const reset = get(
      'SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?',
      digest(input.token),
      now(),
    );
    if (!reset) fail(400, 'This reset link is invalid or has expired.');
    sql.transaction(() => {
      run(
        'UPDATE users SET password_hash=? WHERE id=?',
        hashPassword(input.password),
        reset.user_id,
      );
      run('DELETE FROM sessions WHERE user_id=?', reset.user_id);
      run('DELETE FROM password_resets WHERE user_id=?', reset.user_id);
    })();
    const fresh = createSession(res);
    (req as ContextRequest).context = fresh;
    res.json({
      message: 'Password reset. Sign in with your new password.',
      user: null,
      csrfToken: fresh.csrf,
    });
  });
  app.patch('/api/account', (req, res) => {
    const user = auth(req);
    const input = z
      .object({ name: z.string().trim().min(2).max(100), email: emailSchema })
      .parse(req.body);
    if (get('SELECT id FROM users WHERE email=? AND id!=?', input.email, user.id))
      fail(409, 'That email is already in use.');
    store.orm
      .update(users)
      .set({ name: input.name, email: input.email })
      .where(eq(users.id, user.id))
      .run();
    res.json({ user: publicUser(get('SELECT * FROM users WHERE id=?', user.id)!) });
  });
  app.post('/api/account/password', (req, res) => {
    const user = auth(req);
    const input = z
      .object({ currentPassword: z.string().min(1).max(128), password: passwordSchema })
      .parse(req.body);
    if (!passwordMatches(input.currentPassword, user.password_hash))
      fail(400, 'Current password is incorrect.');
    sql.transaction(() => {
      run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(input.password), user.id);
      run('DELETE FROM sessions WHERE user_id=? AND id!=?', user.id, ctx(req).id);
      run('DELETE FROM password_resets WHERE user_id=?', user.id);
    })();
    res.json({ message: 'Password updated. Other sessions have been signed out.' });
  });
  app.get('/api/categories', (_req, res) => res.json({ categories: categories() }));
  app.get('/api/products', (req, res) => {
    const input = z
      .object({
        q: z.string().max(200).optional(),
        category: z.string().max(100).optional(),
        minPrice: z.coerce.number().int().min(0).optional(),
        maxPrice: z.coerce.number().int().min(0).optional(),
        sort: z.enum(['newest', 'price-asc', 'price-desc', 'name']).default('newest'),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(12),
      })
      .parse(req.query);
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    )
      fail(400, 'Minimum price must not exceed maximum price.');
    const clauses = ['p.archived=0', 'u.active=1'];
    const params: any[] = [];
    if (input.q) {
      clauses.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
      const escaped = input.q.replace(/[\\%_]/g, '\\$&');
      params.push(`%${escaped}%`, `%${escaped}%`);
    }
    if (input.category) {
      clauses.push('c.slug=?');
      params.push(input.category);
    }
    if (input.minPrice !== undefined) {
      clauses.push('p.price>=?');
      params.push(input.minPrice);
    }
    if (input.maxPrice !== undefined) {
      clauses.push('p.price<=?');
      params.push(input.maxPrice);
    }
    const where = ` WHERE ${clauses.join(' AND ')}`;
    const total = get(
      `SELECT COUNT(*) count FROM products p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.seller_id${where}`,
      ...params,
    )!.count;
    const sort = {
      newest: 'p.created_at DESC,p.id DESC',
      'price-asc': 'p.price ASC,p.id ASC',
      'price-desc': 'p.price DESC,p.id DESC',
      name: 'p.name COLLATE NOCASE ASC,p.id ASC',
    }[input.sort];
    const products = all(
      `${productSelect}${where} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      ...params,
      input.limit,
      (input.page - 1) * input.limit,
    ).map(productView);
    res.json({
      products,
      total,
      page: input.page,
      pages: Math.max(1, Math.ceil(total / input.limit)),
    });
  });
  app.get('/api/products/:slug', (req, res) => {
    const p = get(
      `${productSelect} WHERE (p.slug=? OR p.id=?) AND p.archived=0 AND u.active=1`,
      req.params.slug,
      /^\d+$/.test(String(req.params.slug)) ? Number(req.params.slug) : -1,
    );
    if (!p) fail(404, 'Product not found.');
    const reviews = all(
      'SELECT r.*,u.name user_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? AND r.approved=1 ORDER BY r.created_at DESC',
      p.id,
    ).map(reviewView);
    res.json({ product: productView(p), reviews });
  });
  app.post('/api/products/:id/reviews', (req, res) => {
    const user = auth(req);
    const id = positiveId(req.params.id);
    productById(id);
    const input = z
      .object({ rating: z.number().int().min(1).max(5), body: z.string().trim().min(10).max(2000) })
      .parse(req.body);
    if (
      !get(
        'SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND oi.product_id=?',
        user.id,
        id,
      )
    )
      fail(403, 'Reviews are available after purchasing this product.');
    if (get('SELECT id FROM reviews WHERE product_id=? AND user_id=?', id, user.id))
      fail(409, 'You have already reviewed this product.');
    const result = run(
      'INSERT INTO reviews (product_id,user_id,rating,body,verified,approved) VALUES (?,?,?,?,1,1)',
      id,
      user.id,
      input.rating,
      input.body,
    );
    res.status(201).json({
      review: reviewView(
        get(
          'SELECT r.*,u.name user_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.id=?',
          result.lastInsertRowid,
        )!,
      ),
    });
  });
  app.post('/api/contact', (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: emailSchema,
        subject: z.string().trim().min(3).max(150),
        message: z.string().trim().min(10).max(5000),
      })
      .parse(req.body);
    run(
      'INSERT INTO contacts (name,email,subject,message) VALUES (?,?,?,?)',
      input.name,
      input.email,
      input.subject,
      input.message,
    );
    res.status(201).json({ message: 'Your message has been saved for the marketplace team.' });
  });
  app.post('/api/newsletter', (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const result = run(
      'INSERT INTO subscribers (email) VALUES (?) ON CONFLICT(email) DO NOTHING',
      email,
    );
    res.status(result.changes ? 201 : 200).json({
      message: result.changes
        ? 'You are subscribed. Your preference has been saved.'
        : 'You are already subscribed.',
    });
  });
  app.get('/api/addresses', (req, res) => {
    const user = auth(req);
    res.json({
      addresses: all('SELECT * FROM addresses WHERE user_id=? ORDER BY id', user.id).map(
        addressView,
      ),
    });
  });
  app.post('/api/addresses', (req, res) => {
    const user = auth(req);
    const a = addressSchema.parse(req.body);
    const result = run(
      'INSERT INTO addresses (user_id,name,line1,line2,city,postal_code,country) VALUES (?,?,?,?,?,?,?)',
      user.id,
      a.name,
      a.line1,
      a.line2,
      a.city,
      a.postalCode,
      a.country,
    );
    res.status(201).json({
      address: addressView(get('SELECT * FROM addresses WHERE id=?', result.lastInsertRowid)!),
    });
  });
  app.patch('/api/addresses/:id', (req, res) => {
    const user = auth(req);
    const id = positiveId(req.params.id);
    if (!get('SELECT id FROM addresses WHERE id=? AND user_id=?', id, user.id))
      fail(404, 'Address not found.');
    const a = addressSchema.parse(req.body);
    run(
      'UPDATE addresses SET name=?,line1=?,line2=?,city=?,postal_code=?,country=? WHERE id=?',
      a.name,
      a.line1,
      a.line2,
      a.city,
      a.postalCode,
      a.country,
      id,
    );
    res.json({ address: addressView(get('SELECT * FROM addresses WHERE id=?', id)!) });
  });
  app.delete('/api/addresses/:id', (req, res) => {
    const user = auth(req);
    const result = run(
      'DELETE FROM addresses WHERE id=? AND user_id=?',
      positiveId(req.params.id),
      user.id,
    );
    if (!result.changes) fail(404, 'Address not found.');
    res.json({ ok: true });
  });
  app.get('/api/cart', (req, res) => res.json(cart(ownerKey(req))));
  app.post('/api/cart', (req, res) => {
    const { productId, quantity } = z
      .object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99) })
      .parse(req.body);
    const p = productById(productId);
    if (p.archived || !get('SELECT id FROM users WHERE id=? AND active=1', p.sellerId))
      fail(409, 'This product is unavailable.');
    const owner = ownerKey(req);
    const current =
      get('SELECT quantity FROM cart_items WHERE owner_key=? AND product_id=?', owner, productId)
        ?.quantity ?? 0;
    if (current + quantity > Math.min(99, p.stock))
      fail(409, `Only ${p.stock} available. Update your quantity.`);
    run(
      'INSERT INTO cart_items (owner_key,product_id,quantity) VALUES (?,?,?) ON CONFLICT(owner_key,product_id) DO UPDATE SET quantity=excluded.quantity',
      owner,
      productId,
      current + quantity,
    );
    res.json(cart(owner));
  });
  app.patch('/api/cart/:productId', (req, res) => {
    const id = positiveId(req.params.productId);
    const { quantity } = z.object({ quantity: z.number().int().min(1).max(99) }).parse(req.body);
    const owner = ownerKey(req);
    const p = productById(id);
    if (p.archived || quantity > p.stock) fail(409, 'The requested quantity is unavailable.');
    const result = run(
      'UPDATE cart_items SET quantity=? WHERE owner_key=? AND product_id=?',
      quantity,
      owner,
      id,
    );
    if (!result.changes) fail(404, 'Cart item not found.');
    res.json(cart(owner));
  });
  app.delete('/api/cart/:productId', (req, res) => {
    run(
      'DELETE FROM cart_items WHERE owner_key=? AND product_id=?',
      ownerKey(req),
      positiveId(req.params.productId),
    );
    res.json(cart(ownerKey(req)));
  });
  app.get('/api/wishlist', (req, res) => {
    const user = auth(req);
    res.json({
      products: all(
        `${productSelect} JOIN wishlists w ON w.product_id=p.id WHERE w.user_id=? AND p.archived=0 AND u.active=1 ORDER BY w.rowid DESC`,
        user.id,
      ).map(productView),
    });
  });
  app.post('/api/wishlist/:productId', (req, res) => {
    const user = auth(req);
    const p = productById(positiveId(req.params.productId));
    if (p.archived) fail(404, 'Product not found.');
    run(
      'INSERT INTO wishlists (user_id,product_id) VALUES (?,?) ON CONFLICT(user_id,product_id) DO NOTHING',
      user.id,
      p.id,
    );
    res.json({ ok: true });
  });
  app.delete('/api/wishlist/:productId', (req, res) => {
    const user = auth(req);
    run(
      'DELETE FROM wishlists WHERE user_id=? AND product_id=?',
      user.id,
      positiveId(req.params.productId),
    );
    res.json({ ok: true });
  });
  app.get('/api/orders', (req, res) => {
    const user = auth(req);
    res.json({
      orders: all('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC', user.id).map((o) =>
        orderView(o),
      ),
    });
  });
  app.get('/api/orders/:id', (req, res) => {
    const user = auth(req);
    const order = get('SELECT * FROM orders WHERE id=?', positiveId(req.params.id));
    if (!order || (order.user_id !== user.id && user.role !== 'admin'))
      fail(404, 'Order not found.');
    res.json({ order: orderView(order) });
  });
  app.post('/api/orders', (req, res) => {
    const user = auth(req);
    const input = z
      .object({
        addressId: z.number().int().positive().optional(),
        address: addressSchema.optional(),
        shippingMethod: z.enum(['standard', 'express']),
        idempotencyKey: z.string().min(16).max(100),
      })
      .parse(req.body);
    let repeated = false;
    const order = sql
      .transaction(() => {
        const existing = get(
          'SELECT * FROM orders WHERE user_id=? AND idempotency_key=?',
          user.id,
          input.idempotencyKey,
        );
        if (existing) {
          repeated = true;
          return orderView(existing);
        }
        let address: Row | undefined = input.address;
        if (input.addressId) {
          const saved = get(
            'SELECT * FROM addresses WHERE id=? AND user_id=?',
            input.addressId,
            user.id,
          );
          if (!saved) fail(404, 'Address not found.');
          address = addressView(saved);
        }
        if (!address) fail(400, 'Enter or choose a shipping address.');
        const current = cart(ownerKey(req));
        if (!current.items.length) fail(400, 'Your cart is empty.');
        for (const item of current.items) {
          if (
            item.product.archived ||
            item.product.stock < item.quantity ||
            !get('SELECT id FROM users WHERE id=? AND active=1', item.product.sellerId)
          )
            fail(
              409,
              `${item.product.name} is unavailable in the requested quantity. Update your cart.`,
            );
        }
        const totals = pricing(current.subtotal, input.shippingMethod);
        const result = run(
          "INSERT INTO orders (user_id,idempotency_key,status,subtotal,shipping,tax,total,address,shipping_method,payment_mode) VALUES (?,?,'processing',?,?,?,?,?,?,'demo')",
          user.id,
          input.idempotencyKey,
          totals.subtotal,
          totals.shipping,
          totals.tax,
          totals.total,
          JSON.stringify(address),
          input.shippingMethod,
        );
        const id = Number(result.lastInsertRowid);
        for (const { product: p, quantity } of current.items) {
          const updated = run(
            'UPDATE products SET stock=stock-? WHERE id=? AND stock>=? AND archived=0',
            quantity,
            p.id,
            quantity,
          );
          if (!updated.changes) fail(409, 'Stock changed. Please update your cart.');
          run(
            "INSERT INTO order_items (order_id,product_id,seller_id,name,price,quantity,image,status) VALUES (?,?,?,?,?,?,?,'processing')",
            id,
            p.id,
            p.sellerId,
            p.name,
            p.price,
            quantity,
            p.images[0],
          );
        }
        run('DELETE FROM cart_items WHERE owner_key=?', ownerKey(req));
        return orderView(get('SELECT * FROM orders WHERE id=?', id)!);
      })
      .immediate();
    res.status(repeated ? 200 : 201).json({ order });
  });
  const validateImages = (images: string[]) => {
    for (const image of images) {
      const location = image.startsWith('/images/uploads/')
        ? path.join(uploadsPath, path.basename(image))
        : path.join(repositoryRoot, 'public', image);
      if (!existsSync(location))
        fail(
          400,
          'One or more product images do not exist. Upload an image or choose an existing local illustration.',
        );
    }
  };
  app.post('/api/seller/images', (req, res) => {
    seller(req);
    const input = z
      .object({ data: z.string().min(4).max(4200000), filename: z.string().max(255).optional() })
      .parse(req.body);
    const encoded = input.data.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
      fail(400, 'Image data must be valid base64.');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > 3 * 1024 * 1024) fail(413, 'Images must be 3 MB or smaller.');
    if (bytes.toString('base64') !== encoded) fail(400, 'Image data must be valid base64.');
    let extension: 'png' | 'jpg' | 'webp';
    if (
      bytes.length >= 33 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0
    )
      extension = 'png';
    else if (
      bytes.length >= 12 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes[bytes.length - 2] === 255 &&
      bytes[bytes.length - 1] === 217
    )
      extension = 'jpg';
    else if (
      bytes.length >= 20 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP' &&
      bytes.readUInt32LE(4) + 8 === bytes.length
    )
      extension = 'webp';
    else return fail(400, 'Only PNG, JPEG, and WebP image files are accepted.');
    const basename = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    mkdirSync(uploadsPath, { recursive: true, mode: 0o700 });
    try {
      writeFileSync(path.join(uploadsPath, basename), bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    res
      .status(201)
      .json({ image: `/images/uploads/${basename}`, path: `/images/uploads/${basename}` });
  });
  const writeProduct = (input: z.infer<typeof productSchema>, owner: number) => {
    if (!get('SELECT id FROM categories WHERE id=?', input.categoryId))
      fail(400, 'Choose an existing category.');
    validateImages(input.images);
    let slug = slugify(input.name);
    let suffix = 1;
    while (get('SELECT id FROM products WHERE slug=?', slug))
      slug = `${slugify(input.name)}-${++suffix}`;
    const result = run(
      'INSERT INTO products (slug,name,description,price,stock,category_id,seller_id,images,archived) VALUES (?,?,?,?,?,?,?,?,?)',
      slug,
      input.name,
      input.description,
      input.price,
      input.stock,
      input.categoryId,
      owner,
      JSON.stringify(input.images),
      input.archived ? 1 : 0,
    );
    return productById(Number(result.lastInsertRowid));
  };
  const patchProduct = (id: number, input: Partial<z.infer<typeof productSchema>>) => {
    const p = get('SELECT * FROM products WHERE id=?', id);
    if (!p) fail(404, 'Product not found.');
    if (
      input.categoryId !== undefined &&
      !get('SELECT id FROM categories WHERE id=?', input.categoryId)
    )
      fail(400, 'Choose an existing category.');
    if (input.images) validateImages(input.images);
    const columns: Record<string, string> = {
      name: 'name',
      description: 'description',
      price: 'price',
      stock: 'stock',
      categoryId: 'category_id',
      images: 'images',
      archived: 'archived',
    };
    const entries = Object.entries(input).filter(([k, v]) => columns[k] && v !== undefined);
    if (!entries.length) fail(400, 'No product changes supplied.');
    run(
      `UPDATE products SET ${entries.map(([k]) => `${columns[k]}=?`).join(',')} WHERE id=?`,
      ...entries.map(([k, v]) =>
        k === 'images' ? JSON.stringify(v) : k === 'archived' ? (v ? 1 : 0) : v,
      ),
      id,
    );
    return productById(id);
  };
  app.get('/api/seller/dashboard', (req, res) => {
    const user = seller(req);
    const products = all(`${productSelect} WHERE p.seller_id=? ORDER BY p.id DESC`, user.id).map(
      productView,
    );
    const orders = all(
      'SELECT DISTINCT o.* FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE oi.seller_id=? ORDER BY o.id DESC',
      user.id,
    ).map((o) => orderView(o, user.id));
    res.json({
      stats: {
        products: products.filter((p) => !p.archived).length,
        orders: orders.length,
        revenue: orders.reduce((total, o) => total + o.subtotal, 0),
      },
      products,
      orders,
      categories: categories(),
    });
  });
  app.post('/api/seller/products', (req, res) => {
    const user = seller(req);
    res.status(201).json({ product: writeProduct(productSchema.parse(req.body), user.id) });
  });
  app.patch('/api/seller/products/:id', (req, res) => {
    const user = seller(req);
    const id = positiveId(req.params.id);
    if (!get('SELECT id FROM products WHERE id=? AND seller_id=?', id, user.id))
      fail(404, 'Product not found.');
    res.json({ product: patchProduct(id, productSchema.partial().parse(req.body)) });
  });
  app.delete('/api/seller/products/:id', (req, res) => {
    const user = seller(req);
    const result = run(
      'UPDATE products SET archived=1 WHERE id=? AND seller_id=?',
      positiveId(req.params.id),
      user.id,
    );
    if (!result.changes) fail(404, 'Product not found.');
    res.json({ ok: true });
  });
  app.patch('/api/seller/orders/:id', (req, res) => {
    const user = seller(req);
    const { status } = z
      .object({ status: z.enum(['processing', 'shipped', 'delivered']) })
      .parse(req.body);
    transitionOrder(positiveId(req.params.id), status, user.id);
    res.json({ ok: true });
  });
  app.get('/api/admin/dashboard', (req, res) => {
    admin(req);
    const orders = all('SELECT * FROM orders ORDER BY id DESC').map((o) => orderView(o));
    const products = all(`${productSelect} ORDER BY p.id DESC`).map(productView);
    const userList = all('SELECT * FROM users ORDER BY id').map(publicUser);
    res.json({
      stats: {
        users: userList.length,
        products: products.filter((p) => !p.archived).length,
        orders: orders.length,
        revenue: orders.reduce((total, o) => total + o.total, 0),
      },
      users: userList,
      products,
      categories: categories(),
      orders,
      reviews: all(
        'SELECT r.*,u.name user_name,p.name product_name FROM reviews r JOIN users u ON u.id=r.user_id JOIN products p ON p.id=r.product_id ORDER BY r.id DESC',
      ).map(reviewView),
      contacts: all('SELECT * FROM contacts ORDER BY id DESC').map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        subject: c.subject,
        message: c.message,
        resolved: Boolean(c.resolved),
        createdAt: c.created_at,
      })),
      subscribers: all('SELECT * FROM subscribers ORDER BY id DESC').map((s) => ({
        id: s.id,
        email: s.email,
        createdAt: s.created_at,
      })),
    });
  });
  app.patch('/api/admin/users/:id', (req, res) => {
    const current = admin(req);
    const id = positiveId(req.params.id);
    const input = z
      .object({
        role: z.enum(['buyer', 'seller', 'admin']).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const target = get('SELECT * FROM users WHERE id=?', id);
    if (!target) fail(404, 'User not found.');
    if (id === current.id && (input.active === false || (input.role && input.role !== 'admin')))
      fail(409, 'You cannot deactivate or demote your own administrator account.');
    if (
      target.role === 'admin' &&
      target.active &&
      (input.active === false || (input.role && input.role !== 'admin')) &&
      get("SELECT COUNT(*) count FROM users WHERE role='admin' AND active=1")!.count <= 1
    )
      fail(409, 'The marketplace must retain an active administrator.');
    sql.transaction(() => {
      run(
        'UPDATE users SET role=?,active=? WHERE id=?',
        input.role ?? target.role,
        input.active === undefined ? target.active : Number(input.active),
        id,
      );
      if (input.role === 'seller')
        run(
          'INSERT INTO seller_profiles (user_id,store_name) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING',
          id,
          `${target.name} Studio`,
        );
      if (input.active === false) run('DELETE FROM sessions WHERE user_id=?', id);
    })();
    res.json({ user: publicUser(get('SELECT * FROM users WHERE id=?', id)!) });
  });
  app.patch('/api/admin/products/:id', (req, res) => {
    admin(req);
    res.json({
      product: patchProduct(positiveId(req.params.id), productSchema.partial().parse(req.body)),
    });
  });
  app.post('/api/admin/categories', (req, res) => {
    admin(req);
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const slug = slugify(name);
    if (get('SELECT id FROM categories WHERE slug=?', slug))
      fail(409, 'That category already exists.');
    const result = run('INSERT INTO categories (name,slug) VALUES (?,?)', name, slug);
    res.status(201).json({
      category: get('SELECT id,name,slug FROM categories WHERE id=?', result.lastInsertRowid),
    });
  });
  app.patch('/api/admin/categories/:id', (req, res) => {
    admin(req);
    const id = positiveId(req.params.id);
    if (!get('SELECT id FROM categories WHERE id=?', id)) fail(404, 'Category not found.');
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const slug = slugify(name);
    if (get('SELECT id FROM categories WHERE slug=? AND id!=?', slug, id))
      fail(409, 'That category already exists.');
    run('UPDATE categories SET name=?,slug=? WHERE id=?', name, slug, id);
    res.json({ category: get('SELECT id,name,slug FROM categories WHERE id=?', id) });
  });
  app.delete('/api/admin/categories/:id', (req, res) => {
    admin(req);
    const id = positiveId(req.params.id);
    if (get('SELECT id FROM products WHERE category_id=?', id))
      fail(409, 'Reassign all products before deleting this category.');
    if (!run('DELETE FROM categories WHERE id=?', id).changes) fail(404, 'Category not found.');
    res.json({ ok: true });
  });
  app.patch('/api/admin/reviews/:id', (req, res) => {
    admin(req);
    const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
    if (
      !run('UPDATE reviews SET approved=? WHERE id=?', Number(approved), positiveId(req.params.id))
        .changes
    )
      fail(404, 'Review not found.');
    res.json({ ok: true });
  });
  app.patch('/api/admin/contacts/:id', (req, res) => {
    admin(req);
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
    if (
      !run('UPDATE contacts SET resolved=? WHERE id=?', Number(resolved), positiveId(req.params.id))
        .changes
    )
      fail(404, 'Message not found.');
    res.json({ ok: true });
  });
  app.patch('/api/admin/orders/:id', (req, res) => {
    admin(req);
    const { status } = z
      .object({ status: z.enum(['processing', 'shipped', 'delivered']) })
      .parse(req.body);
    transitionOrder(positiveId(req.params.id), status);
    res.json({ ok: true });
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));
  app.get('/images/uploads/:filename', (req, res) => {
    const filename = String(req.params.filename);
    if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(filename)) return res.status(404).end();
    const target = path.join(uploadsPath, filename);
    if (!existsSync(target)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(
      filename.endsWith('.jpg')
        ? 'image/jpeg'
        : filename.endsWith('.png')
          ? 'image/png'
          : 'image/webp',
    );
    res.sendFile(target);
  });
  const legacy: Record<string, string> = {
    '/home-bage.html': '/',
    '/shop-page.html': '/shop',
    '/product.html': '/shop',
    '/cart.html': '/cart',
    '/contact-us.html': '/contact',
    '/blog.html': '/blog',
    '/article.html': '/blog',
    '/my-acount.html': '/account',
    '/nav-cart.html': '/cart',
    '/sign-in.html': '/sign-in',
    '/sigm-up.html': '/sign-up',
  };
  app.use((req, res, next) => {
    const redirect = legacy[req.path];
    if (redirect) return res.redirect(302, redirect);
    next();
  });
  const distPath = path.join(repositoryRoot, 'dist');
  if (production && existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res, next) => {
      if (path.extname(req.path)) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.use((_req, res) => res.status(404).json({ error: 'Page not found.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: error.issues.map((i) => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; '),
      });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError && 'body' in error)
      return res.status(400).json({ error: 'Request contains invalid JSON.' });
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      String(error.code).startsWith('SQLITE_CONSTRAINT')
    )
      return res.status(409).json({ error: 'This change conflicts with an existing record.' });
    console.error('Unhandled API error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return { app, store, close: () => store.close() };
}
