import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

type Client = {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  user?: { id: number; role: string };
};
const address = {
  name: 'Security Test Buyer',
  line1: '42 Example Lane',
  line2: '',
  city: 'Portland',
  postalCode: '97201',
  country: 'US',
};

function fixture(t: TestContext) {
  const folder = mkdtempSync(join(tmpdir(), '3legant-security-'));
  const runtime = createApp({
    databasePath: join(folder, 'security.sqlite'),
    seed: true,
    outboxPath: join(folder, 'outbox'),
    uploadsPath: join(folder, 'uploads'),
    production: false,
  });
  t.after(() => {
    runtime.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const client = (): Client => ({ agent: request.agent(runtime.app), csrf: '' });
  return { ...runtime, client };
}
async function session(c: Client) {
  const response = await c.agent.get('/api/auth/session').expect(200);
  c.csrf = response.body.csrfToken;
  return response.body;
}
async function change(
  c: Client,
  method: 'post' | 'patch' | 'delete',
  path: string,
  body: unknown = {},
  status = 200,
) {
  const response = await c.agent[method]('/api' + path)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
  assert.equal(
    response.status,
    status,
    `${method.toUpperCase()} ${path}: ${JSON.stringify(response.body)}`,
  );
  if (response.body.csrfToken) c.csrf = response.body.csrfToken;
  if (response.body.user) c.user = response.body.user;
  return response.body;
}
async function login(c: Client, email: string) {
  await session(c);
  return change(c, 'post', '/auth/login', { email, password: 'DemoPass123!' });
}
async function registerBuyer(c: Client, email = 'other-buyer@example.test') {
  await session(c);
  return change(
    c,
    'post',
    '/auth/register',
    { name: 'Second Buyer', email, password: 'StrongPassword123!' },
    201,
  );
}
async function allProducts(c: Client): Promise<any[]> {
  return (await c.agent.get('/api/products?limit=100').expect(200)).body.products;
}
async function add(c: Client, productId: number, quantity = 1) {
  return change(c, 'post', '/cart', { productId, quantity });
}
async function buy(c: Client, key: string, status = 201) {
  return change(
    c,
    'post',
    '/orders',
    { address, shippingMethod: 'standard', idempotencyKey: key },
    status,
  );
}

// These tests assert observable security and order invariants, not implementation details.
test('registration rejects forged administrator roles and cannot access administration', async (t) => {
  const f = fixture(t);
  const attacker = f.client();
  await session(attacker);
  await change(
    attacker,
    'post',
    '/auth/register',
    {
      name: 'Forged Administrator',
      email: 'attacker@example.test',
      password: 'StrongPassword123!',
      role: 'admin',
    },
    400,
  );
  assert.equal((await attacker.agent.get('/api/auth/session')).body.user, null);
  const signup = await change(
    attacker,
    'post',
    '/auth/register',
    {
      name: 'Regular Customer',
      email: 'attacker@example.test',
      password: 'StrongPassword123!',
      role: 'buyer',
      active: true,
      userId: 1,
    },
    201,
  );
  assert.equal(signup.user.role, 'buyer');
  assert.notEqual(signup.user.id, 1);
  await attacker.agent.get('/api/admin/dashboard').expect(403);
  await change(attacker, 'patch', '/admin/users/' + signup.user.id, { role: 'admin' }, 403);
});

test('deactivating a user invalidates existing sessions and denies subsequent login', async (t) => {
  const f = fixture(t);
  const buyer = f.client(),
    admin = f.client();
  await login(buyer, 'buyer@3legant.demo');
  await login(admin, 'admin@3legant.demo');
  await buyer.agent.get('/api/orders').expect(200);
  await change(admin, 'patch', '/admin/users/' + buyer.user!.id, { active: false });
  await buyer.agent.get('/api/orders').expect(401);
  const current = await session(buyer);
  assert.equal(current.user, null);
  await change(
    buyer,
    'post',
    '/auth/login',
    { email: 'buyer@3legant.demo', password: 'DemoPass123!' },
    401,
  );
  const record = f.store.sqlite
    .prepare('SELECT active FROM users WHERE id = ?')
    .get(buyer.user!.id) as { active: number };
  assert.equal(record.active, 0);
});

test('buyers cannot read another buyer order or use, change, or delete their address', async (t) => {
  const f = fixture(t);
  const owner = f.client(),
    outsider = f.client();
  await login(owner, 'buyer@3legant.demo');
  await registerBuyer(outsider);
  const saved = (await change(owner, 'post', '/addresses', address, 201)).address;
  const product = (await allProducts(owner)).find((p) => p.stock >= 2);
  await add(owner, product.id);
  const order = (await buy(owner, 'private-order-security-01')).order;
  assert.equal((await outsider.agent.get('/api/addresses').expect(200)).body.addresses.length, 0);
  await change(
    outsider,
    'patch',
    '/addresses/' + saved.id,
    { ...address, name: 'Address Hijacker' },
    404,
  );
  await change(outsider, 'delete', '/addresses/' + saved.id, {}, 404);
  await outsider.agent.get('/api/orders/' + order.id).expect(404);
  assert.equal((await outsider.agent.get('/api/orders').expect(200)).body.orders.length, 0);
  await add(outsider, product.id);
  await change(
    outsider,
    'post',
    '/orders',
    { addressId: saved.id, shippingMethod: 'standard', idempotencyKey: 'foreign-address-security' },
    404,
  );
  assert.equal(
    (await outsider.agent.get('/api/cart')).body.items.length,
    1,
    'denied checkout keeps cart',
  );
  assert.equal((await owner.agent.get('/api/addresses')).body.addresses[0].name, address.name);
});

test('competing buyers for the last unit produce one order, no negative stock, and retain the losing cart', async (t) => {
  const f = fixture(t);
  const first = f.client(),
    second = f.client(),
    seller = f.client();
  await login(first, 'buyer@3legant.demo');
  await registerBuyer(second);
  await login(seller, 'seller@3legant.demo');
  const owned = (await seller.agent.get('/api/seller/dashboard')).body.products.find(
    (p: any) => p.stock > 0,
  );
  await change(seller, 'patch', '/seller/products/' + owned.id, { stock: 1 });
  await Promise.all([add(first, owned.id), add(second, owned.id)]);
  const attempts = await Promise.all([
    first.agent
      .post('/api/orders')
      .set('X-CSRF-Token', first.csrf)
      .send({ address, shippingMethod: 'standard', idempotencyKey: 'competing-first-buyer' }),
    second.agent
      .post('/api/orders')
      .set('X-CSRF-Token', second.csrf)
      .send({ address, shippingMethod: 'standard', idempotencyKey: 'competing-second-buyer' }),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
  const winning = attempts[0].status === 201 ? first : second;
  const losing = winning === first ? second : first;
  assert.equal((await winning.agent.get('/api/cart')).body.items.length, 0);
  assert.equal((await losing.agent.get('/api/cart')).body.items[0].quantity, 1);
  assert.equal((await first.agent.get('/api/products/' + owned.slug)).body.product.stock, 0);
  const orders = f.store.sqlite.prepare('SELECT count(*) n FROM orders').get() as { n: number };
  const lines = f.store.sqlite.prepare('SELECT count(*) n FROM order_items').get() as { n: number };
  assert.equal(orders.n, 1);
  assert.equal(lines.n, 1);
});

test('a stale item aborts the entire multi-product checkout without stock loss or partial orders', async (t) => {
  const f = fixture(t);
  const buyer = f.client(),
    seller = f.client();
  await login(buyer, 'buyer@3legant.demo');
  await login(seller, 'seller@3legant.demo');
  const products = (await seller.agent.get('/api/seller/dashboard')).body.products
    .filter((p: any) => p.stock >= 2)
    .slice(0, 2);
  assert.equal(products.length, 2);
  await add(buyer, products[0].id);
  await add(buyer, products[1].id);
  await change(seller, 'patch', '/seller/products/' + products[1].id, { stock: 0 });
  await buy(buyer, 'atomic-multi-item-abort', 409);
  const preserved = (await buyer.agent.get('/api/products/' + products[0].slug)).body.product;
  assert.equal(preserved.stock, products[0].stock);
  assert.equal((await buyer.agent.get('/api/orders')).body.orders.length, 0);
  assert.equal((await buyer.agent.get('/api/cart')).body.items.length, 2);
  assert.equal(
    (f.store.sqlite.prepare('SELECT count(*) n FROM order_items').get() as { n: number }).n,
    0,
  );
});

test('mixed-seller orders expose only owned lines and enforce independent forward fulfillment', async (t) => {
  const f = fixture(t);
  const buyer = f.client(),
    seller = f.client(),
    studio = f.client();
  await login(buyer, 'buyer@3legant.demo');
  await login(seller, 'seller@3legant.demo');
  await login(studio, 'studio@3legant.demo');
  const a = (await seller.agent.get('/api/seller/dashboard')).body.products.find(
    (p: any) => p.stock > 1,
  );
  const b = (await studio.agent.get('/api/seller/dashboard')).body.products.find(
    (p: any) => p.stock > 1,
  );
  await add(buyer, a.id);
  await add(buyer, b.id);
  const order = (await buy(buyer, 'mixed-seller-security-01')).order;
  assert.equal(order.items.length, 2);
  for (const [client, own, other] of [
    [seller, a, b],
    [studio, b, a],
  ] as const) {
    const response = (await client.agent.get('/api/seller/dashboard')).body.orders.find(
      (o: any) => o.id === order.id,
    );
    assert.equal(response.items.length, 1);
    assert.equal(response.items[0].productId, own.id);
    assert.ok(response.items.every((i: any) => i.sellerId === client.user!.id));
    assert.equal(response.subtotal, own.price);
    assert.notEqual(response.subtotal, order.subtotal);
    assert.ok(!response.items.some((i: any) => i.productId === other.id));
  }
  await change(seller, 'patch', '/seller/orders/' + order.id, { status: 'delivered' }, 409);
  await change(seller, 'patch', '/seller/orders/' + order.id, { status: 'shipped' });
  await change(seller, 'patch', '/seller/orders/' + order.id, { status: 'delivered' });
  let full = (await buyer.agent.get('/api/orders/' + order.id)).body.order;
  assert.equal(full.status, 'processing');
  assert.equal(full.items.find((i: any) => i.productId === b.id).status, 'processing');
  await change(studio, 'patch', '/seller/orders/' + order.id, { status: 'shipped' });
  await change(studio, 'patch', '/seller/orders/' + order.id, { status: 'delivered' });
  full = (await buyer.agent.get('/api/orders/' + order.id)).body.order;
  assert.equal(full.status, 'delivered');
  await change(seller, 'patch', '/seller/orders/' + order.id, { status: 'shipped' }, 409);
});

test('completed orders retain purchased names, prices, images and addresses after catalog/account edits', async (t) => {
  const f = fixture(t);
  const buyer = f.client(),
    seller = f.client();
  await login(buyer, 'buyer@3legant.demo');
  await login(seller, 'seller@3legant.demo');
  const product = (await seller.agent.get('/api/seller/dashboard')).body.products.find(
    (p: any) => p.stock > 0,
  );
  const saved = (await change(buyer, 'post', '/addresses', address, 201)).address;
  await add(buyer, product.id);
  const original = (
    await change(
      buyer,
      'post',
      '/orders',
      {
        addressId: saved.id,
        shippingMethod: 'standard',
        idempotencyKey: 'immutable-order-security',
      },
      201,
    )
  ).order;
  await change(seller, 'patch', '/seller/products/' + product.id, {
    name: 'Changed catalog product',
    price: product.price + 20000,
    images: ['/images/vase.svg'],
  });
  await change(buyer, 'patch', '/addresses/' + saved.id, {
    ...address,
    line1: '99 Changed Address',
  });
  const persisted = (await buyer.agent.get('/api/orders/' + original.id)).body.order;
  assert.deepEqual(persisted.items, original.items);
  assert.deepEqual(persisted.address, original.address);
  assert.equal(persisted.total, original.total);
  assert.equal(persisted.items[0].name, product.name);
  assert.equal(persisted.items[0].price, product.price);
});

test('guest sign-in merges quantities up to stock without duplicating unavailable items', async (t) => {
  const f = fixture(t);
  const buyer = f.client(),
    guest = f.client(),
    seller = f.client();
  await login(buyer, 'buyer@3legant.demo');
  await session(guest);
  await login(seller, 'seller@3legant.demo');
  const product = (await seller.agent.get('/api/seller/dashboard')).body.products.find(
    (p: any) => p.stock >= 4,
  );
  await change(seller, 'patch', '/seller/products/' + product.id, { stock: 4 });
  await add(buyer, product.id, 3);
  await add(guest, product.id, 3);
  await login(guest, 'buyer@3legant.demo');
  const merged = (await guest.agent.get('/api/cart')).body;
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].product.id, product.id);
  assert.equal(merged.items[0].quantity, 4);
  const oldSessionCount = (
    f.store.sqlite
      .prepare("SELECT count(*) n FROM cart_items WHERE owner_key LIKE 'guest:%'")
      .get() as { n: number }
  ).n;
  assert.equal(oldSessionCount, 0, 'merged guest cart has no orphan lines');
});

test('invalid CSRF tokens fail with 403 instead of causing unhandled server errors', async (t) => {
  const f = fixture(t);
  const client = f.client();
  await session(client);
  for (const csrf of ['x', 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(64), 'é'.repeat(64)]) {
    const result = await client.agent
      .post('/api/newsletter')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'csrf@example.test' });
    assert.equal(result.status, 403);
    assert.equal(typeof result.body.error, 'string');
  }
  await change(client, 'post', '/newsletter', { email: 'csrf@example.test' }, 201);
});

test('seller image upload persists validated bytes and rejects unauthorized or disguised content', async (t) => {
  const f = fixture(t);
  const seller = f.client(),
    buyer = f.client();
  await login(seller, 'seller@3legant.demo');
  await login(buyer, 'buyer@3legant.demo');
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
  await change(buyer, 'post', '/seller/images', { data: png, filename: 'photo.png' }, 403);
  const upload = await change(
    seller,
    'post',
    '/seller/images',
    { data: png, filename: '../../unsafe-name.png' },
    201,
  );
  assert.match(upload.image, /^\/images\/uploads\/[a-f0-9]{64}\.png$/);
  const served = await seller.agent
    .get(upload.image)
    .expect(200)
    .expect('Content-Type', /image\/png/);
  assert.deepEqual(served.body, Buffer.from(png, 'base64'));
  const duplicate = await change(
    seller,
    'post',
    '/seller/images',
    { data: png, filename: 'photo.png' },
    201,
  );
  assert.equal(
    duplicate.image,
    upload.image,
    'identical image uploads retain the same content-addressed file',
  );
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  ).toString('base64');
  await change(seller, 'post', '/seller/images', { data: svg, filename: 'disguised.png' }, 400);
  await change(
    seller,
    'post',
    '/seller/images',
    { data: 'not base64!', filename: 'photo.png' },
    400,
  );
  const own = (await seller.agent.get('/api/seller/dashboard')).body.products[0];
  await change(
    seller,
    'patch',
    '/seller/products/' + own.id,
    { images: ['/images/uploads/' + '0'.repeat(64) + '.png'] },
    400,
  );
  await change(
    seller,
    'patch',
    '/seller/products/' + own.id,
    { images: ['/images/uploads/../../outside.png'] },
    400,
  );
  await change(seller, 'patch', '/seller/products/' + own.id, { images: [upload.image] });
  const product = (await seller.agent.get('/api/products/' + own.slug)).body.product;
  assert.deepEqual(product.images, [upload.image]);
});

test('production startup cannot silently seed known demo credentials', () => {
  const previous = process.env.ALLOW_DEMO_SEED;
  process.env.ALLOW_DEMO_SEED = 'false';
  try {
    assert.throws(
      () => createApp({ databasePath: ':memory:', production: true, seed: true }),
      /ALLOW_DEMO_SEED=true/,
    );
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DEMO_SEED;
    else process.env.ALLOW_DEMO_SEED = previous;
  }
});
