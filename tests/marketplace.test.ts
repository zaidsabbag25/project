import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

test('marketplace security, persistence and purchase workflow', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), '3legant-test-'));
  const runtime = createApp({
    databasePath: join(folder, 'test.sqlite'),
    seed: true,
    outboxPath: join(folder, 'outbox'),
  });
  t.after(() => {
    runtime.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const client = () => ({ agent: request.agent(runtime.app), csrf: '' });
  type Client = ReturnType<typeof client>;
  async function init(c: Client) {
    const r = await c.agent.get('/api/auth/session').expect(200);
    c.csrf = r.body.csrfToken;
    assert.ok(c.csrf);
    return r.body;
  }
  async function mutate(
    c: Client,
    method: 'post' | 'patch' | 'delete',
    path: string,
    body: unknown = {},
    status = 200,
  ) {
    const r = await c.agent[method]('/api' + path)
      .set('X-CSRF-Token', c.csrf)
      .send(body);
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.body)}`);
    if (r.body.csrfToken) c.csrf = r.body.csrfToken;
    return r.body;
  }
  async function login(c: Client, email: string) {
    await init(c);
    const r = await mutate(c, 'post', '/auth/login', { email, password: 'DemoPass123!' });
    assert.equal(r.user.email, email);
    return r.user;
  }
  const buyer = client(),
    seller = client(),
    studio = client(),
    admin = client(),
    guest = client();
  await t.test('health, catalog filters and server-side CSRF', async () => {
    await buyer.agent.get('/api/health').expect(200);
    const { body: catalog } = await buyer.agent.get('/api/products?limit=3').expect(200);
    assert.equal(catalog.products.length, 3);
    assert.ok(catalog.total >= 24);
    assert.ok(catalog.pages >= 8);
    const { body: filtered } = await buyer.agent
      .get('/api/products?minPrice=1000&maxPrice=50000&sort=price-asc&limit=100')
      .expect(200);
    assert.ok(filtered.products.length > 0);
    assert.ok(filtered.products.every((p: any) => p.price >= 1000 && p.price <= 50000));
    assert.deepEqual(
      filtered.products.map((p: any) => p.price),
      filtered.products.map((p: any) => p.price).sort((a: number, b: number) => a - b),
    );
    await init(guest);
    await guest.agent
      .post('/api/cart')
      .send({ productId: catalog.products[0].id, quantity: 1 })
      .expect(403);
    await guest.agent.get('/api/admin/dashboard').expect(401);
    await guest.agent.get('/api/seller/dashboard').expect(401);
  });
  await t.test('registration, logout and protected role boundaries', async () => {
    const fresh = client();
    await init(fresh);
    const r = await mutate(
      fresh,
      'post',
      '/auth/register',
      {
        name: 'Test Customer',
        email: 'fresh@example.test',
        password: 'StrongPassword123!',
        role: 'buyer',
      },
      201,
    );
    assert.equal(r.user.role, 'buyer');
    await fresh.agent.get('/api/admin/dashboard').expect(403);
    await mutate(fresh, 'post', '/auth/logout');
    await fresh.agent.get('/api/orders').expect(401);
    await login(buyer, 'buyer@3legant.demo');
    await login(seller, 'seller@3legant.demo');
    await login(studio, 'studio@3legant.demo');
    await login(admin, 'admin@3legant.demo');
    await buyer.agent.get('/api/seller/dashboard').expect(403);
    await seller.agent.get('/api/admin/dashboard').expect(403);
  });
  let product: any, address: any, order: any;
  await t.test('guest cart merges on login and addresses enforce ownership', async () => {
    const { body } = await guest.agent.get('/api/products?limit=100');
    product = body.products.find((p: any) => p.stock >= 3 && !p.archived);
    assert.ok(product);
    await mutate(guest, 'post', '/cart', { productId: product.id, quantity: 2 });
    await login(guest, 'buyer@3legant.demo');
    const { body: cart } = await guest.agent.get('/api/cart').expect(200);
    assert.equal(cart.items.find((i: any) => i.product.id === product.id).quantity, 2);
    address = (
      await mutate(
        buyer,
        'post',
        '/addresses',
        {
          name: 'Test Buyer',
          line1: '123 Test Lane',
          line2: '',
          city: 'Portland',
          postalCode: '97201',
          country: 'US',
        },
        201,
      )
    ).address;
    await mutate(seller, 'delete', '/addresses/' + address.id, {}, 404);
    await mutate(buyer, 'patch', '/addresses/' + address.id, {
      name: 'Test Buyer',
      line1: '124 Test Lane',
      line2: '',
      city: 'Portland',
      postalCode: '97201',
      country: 'US',
    });
  });
  await t.test('stock checks, atomic server-priced checkout and idempotency', async () => {
    const { body: before } = await buyer.agent.get('/api/products/' + product.slug);
    const stockBefore = before.product.stock;
    await mutate(buyer, 'patch', '/cart/' + product.id, { quantity: stockBefore + 1 }, 409);
    const key = 'integration-purchase-0001';
    const result = await mutate(
      buyer,
      'post',
      '/orders',
      { addressId: address.id, shippingMethod: 'standard', idempotencyKey: key, total: 1 },
      201,
    );
    order = result.order;
    assert.equal(order.paymentMode, 'demo');
    assert.equal(order.subtotal, product.price * 2);
    assert.equal(order.tax, Math.round(order.subtotal * 0.08));
    assert.equal(order.shipping, order.subtotal >= 15000 ? 0 : 800);
    assert.equal(order.total, order.subtotal + order.tax + order.shipping);
    const repeated = await mutate(
      buyer,
      'post',
      '/orders',
      { addressId: address.id, shippingMethod: 'standard', idempotencyKey: key },
      200,
    );
    assert.equal(repeated.order.id, order.id);
    const { body: after } = await buyer.agent.get('/api/products/' + product.slug);
    assert.equal(after.product.stock, stockBefore - 2);
    const { body: cart } = await buyer.agent.get('/api/cart');
    assert.equal(cart.items.length, 0);
    await seller.agent.get('/api/orders/' + order.id).expect(404);
    await buyer.agent.get('/api/orders/' + order.id).expect(200);
  });
  await t.test('wishlists and verified-purchase reviews persist', async () => {
    await mutate(buyer, 'post', '/wishlist/' + product.id);
    const { body: w } = await buyer.agent.get('/api/wishlist');
    assert.ok(w.products.some((p: any) => p.id === product.id));
    await mutate(buyer, 'delete', '/wishlist/' + product.id);
    const { review } = await mutate(
      buyer,
      'post',
      '/products/' + product.id + '/reviews',
      { rating: 5, body: 'A well made item, exactly as described. Very happy with it.' },
      201,
    );
    assert.equal(review.verified, true);
    await mutate(
      seller,
      'post',
      '/products/' + product.id + '/reviews',
      { rating: 5, body: 'I did not purchase this product.' },
      403,
    );
  });
  await t.test(
    'seller ownership, product editing, archive and fulfillment transitions',
    async () => {
      const { body: dash } = await seller.agent.get('/api/seller/dashboard').expect(200);
      const own = dash.products[0];
      assert.ok(own);
      await mutate(studio, 'patch', '/seller/products/' + own.id, { stock: 7 }, 404);
      const created = (
        await mutate(
          seller,
          'post',
          '/seller/products',
          {
            name: 'Integration oak stool',
            description: 'A solid oak stool made for this integration test.',
            price: 12000,
            stock: 4,
            categoryId: own.categoryId,
            images: ['/images/chair.svg'],
          },
          201,
        )
      ).product;
      await mutate(seller, 'patch', '/seller/products/' + created.id, { price: 12500, stock: 3 });
      await mutate(seller, 'delete', '/seller/products/' + created.id);
      const { body: publicResult } = await seller.agent.get(
        '/api/products?q=Integration%20oak%20stool',
      );
      assert.equal(publicResult.total, 0);
      const owner = product.sellerId === dash.products[0].sellerId ? seller : studio;
      await mutate(owner, 'patch', '/seller/orders/' + order.id, { status: 'delivered' }, 409);
      await mutate(owner, 'patch', '/seller/orders/' + order.id, { status: 'shipped' });
      await mutate(owner, 'patch', '/seller/orders/' + order.id, { status: 'delivered' });
    },
  );
  await t.test('contact, newsletter and administration use persisted data', async () => {
    await mutate(
      buyer,
      'post',
      '/contact',
      {
        name: 'Buyer Test',
        email: 'buyer@example.test',
        subject: 'Order question',
        message: 'Please let me know more about the local delivery options.',
      },
      201,
    );
    await mutate(buyer, 'post', '/newsletter', { email: 'subscriber@example.test' }, 201);
    await mutate(buyer, 'post', '/newsletter', { email: 'subscriber@example.test' }, 200);
    const { body: dash } = await admin.agent.get('/api/admin/dashboard').expect(200);
    assert.ok(dash.stats.orders >= 1);
    assert.ok(dash.stats.revenue >= order.total);
    assert.ok(dash.contacts.length >= 1);
    assert.equal(
      dash.subscribers.filter((s: any) => s.email === 'subscriber@example.test').length,
      1,
    );
    const adminUser = dash.users.find((u: any) => u.role === 'admin');
    await mutate(admin, 'patch', '/admin/users/' + adminUser.id, { role: 'buyer' }, 409);
    const { category } = await mutate(
      admin,
      'post',
      '/admin/categories',
      { name: 'Test Category' },
      201,
    );
    await mutate(admin, 'patch', '/admin/categories/' + category.id, { name: 'Renamed Category' });
    await mutate(admin, 'delete', '/admin/categories/' + category.id);
    await mutate(admin, 'delete', '/admin/categories/' + product.categoryId, {}, 409);
    const contact = dash.contacts.find((c: any) => c.email === 'buyer@example.test');
    await mutate(admin, 'patch', '/admin/contacts/' + contact.id, { resolved: true });
  });
  await t.test('password recovery uses private local outbox and one-time tokens', async () => {
    await mutate(buyer, 'post', '/auth/forgot-password', { email: 'buyer@3legant.demo' });
    const files = readdirSync(join(folder, 'outbox'));
    assert.ok(files.length > 0);
    const text = files.map((f) => readFileSync(join(folder, 'outbox', f), 'utf8')).join('\n');
    const match = text.match(/(?:token=|"token"\s*:\s*")([a-f0-9]{32,})/i);
    assert.ok(match, 'outbox includes recovery token link');
    await mutate(buyer, 'post', '/auth/reset-password', {
      token: match[1],
      password: 'ReplacementPass123!',
    });
    await mutate(
      buyer,
      'post',
      '/auth/reset-password',
      { token: match[1], password: 'AnotherPass123!' },
      400,
    );
  });
});

test('orders survive closing and reopening the SQLite database', async () => {
  const folder = mkdtempSync(join(tmpdir(), '3legant-durable-'));
  const path = join(folder, 'db.sqlite');
  let runtime = createApp({ databasePath: path, seed: true, outboxPath: join(folder, 'outbox') });
  try {
    let agent = request.agent(runtime.app);
    let token = (await agent.get('/api/auth/session')).body.csrfToken;
    const login = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'buyer@3legant.demo', password: 'DemoPass123!' });
    assert.equal(login.status, 200);
    token = login.body.csrfToken;
    const products = (await agent.get('/api/products')).body.products;
    const product = products.find((p: any) => p.stock > 0);
    await agent
      .post('/api/cart')
      .set('X-CSRF-Token', token)
      .send({ productId: product.id, quantity: 1 })
      .expect(200);
    const response = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', token)
      .send({
        address: {
          name: 'Persistent Buyer',
          line1: '18 Market St',
          city: 'Portland',
          postalCode: '97201',
          country: 'US',
        },
        shippingMethod: 'standard',
        idempotencyKey: 'durable-test-purchase',
      });
    assert.equal(response.status, 201);
    const id = response.body.order.id;
    runtime.close();
    runtime = createApp({ databasePath: path, seed: true, outboxPath: join(folder, 'outbox') });
    agent = request.agent(runtime.app);
    token = (await agent.get('/api/auth/session')).body.csrfToken;
    const relogin = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'buyer@3legant.demo', password: 'DemoPass123!' })
      .expect(200);
    const result = await agent.get('/api/orders/' + id).expect(200);
    assert.equal(result.body.order.id, id);
    assert.equal(result.body.order.items[0].name, product.name);
    const catalog = (await agent.get('/api/products?limit=100')).body;
    assert.equal(catalog.total, 24, 'reseed does not duplicate products');
    assert.ok(relogin.body.user);
  } finally {
    runtime.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
