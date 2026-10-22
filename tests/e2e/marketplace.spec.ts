import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.locator('main').getByLabel('Email address', { exact: true }).fill(email);
  await page.locator('main').getByLabel('Password', { exact: true }).fill('DemoPass123!');
  await page.locator('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();
}

test('storefront, composed catalog filters, local images and keyboard dialogs', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A little less/ })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(4);
  const broken = await page
    .locator('img')
    .evaluateAll((images) =>
      images.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
    );
  expect(broken).toEqual([]);
  const search = page.getByRole('button', { name: 'Search products', exact: true });
  await search.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.goto('/shop');
  await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(4);
  await page.getByLabel('Sort by').selectOption('price-asc');
  await page.getByRole('searchbox', { name: 'Search products', exact: true }).fill('Lamp');
  await page
    .locator('.catalog-search')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('60');
  await page.getByLabel('To', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Apply price' }).click();
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.getByRole('button', { name: /Clear all filters/ }).click();
  await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.product-card')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('buyer registers, saves products, purchases, reviews and signs out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: true }).fill('Browser Buyer');
  await page
    .locator('main')
    .getByLabel('Email address', { exact: true })
    .fill('browser-buyer@example.test');
  await page.getByLabel('Password', { exact: true }).fill('BrowserPass123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();
  await page.goto('/product/linen-lounge-chair');
  await expect(
    page.getByRole('heading', { name: 'Linen Lounge Chair', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View image 2', exact: true }).click();
  await expect(page.locator('.product-main-image img')).toHaveAttribute(
    'src',
    '/images/chair-detail.svg',
  );
  await page.getByRole('button', { name: 'Save to wishlist', exact: true }).click();
  await page.goto('/wishlist');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove Linen Lounge Chair from wishlist' }).click();
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.goto('/product/linen-lounge-chair');
  await page.getByRole('button', { name: 'Add to shopping bag', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Added to your shopping bag.' }),
  ).toBeVisible();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Increase Linen Lounge Chair quantity' }).click();
  await expect(page.getByLabel('Quantity 2')).toBeVisible();
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Browser Buyer');
  await page.getByLabel('Street address', { exact: true }).fill('22 Browser Lane');
  await page.getByLabel('City', { exact: true }).fill('Portland');
  await page.getByLabel('Postal code', { exact: true }).fill('97201');
  await page.getByLabel('Country', { exact: true }).fill('US');
  await page.getByLabel(/Express delivery/).check();
  await page.getByRole('button', { name: 'Place demo order' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+\?confirmed=1/);
  await expect(page.locator('main')).toContainText('No real money was charged.');
  const orderUrl = page.url();
  await page.reload();
  await expect(page.locator('main')).toContainText('Linen Lounge Chair');
  await page.goto('/orders');
  await expect(page.locator('main')).toContainText('Linen Lounge Chair');
  await page.goto(orderUrl);
  await expect(page.locator('main')).toContainText('$18.00');
  await page.goto('/product/linen-lounge-chair');
  await page
    .getByLabel('Your experience')
    .fill('Comfortable and well proportioned. The browser purchase worked smoothly.');
  await page.getByRole('button', { name: 'Share your review' }).click();
  await expect(page.locator('.review')).toContainText('Browser Buyer');
  await expect(page.locator('.review')).toContainText('Verified purchase');
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/orders');
  await expect(page.locator('main')).toContainText('Sign in to manage your account');
  expect(errors).toEqual([]);
});

test('seller creates, edits, archives a product and fulfills an order', async ({
  page,
  request,
}) => {
  let csrf = (await (await request.get('/api/auth/session')).json()).csrfToken;
  const buyerLogin = await request.post('/api/auth/login', {
    headers: { 'X-CSRF-Token': csrf },
    data: { email: 'buyer@3legant.demo', password: 'DemoPass123!' },
  });
  expect(buyerLogin.status()).toBe(200);
  csrf = (await buyerLogin.json()).csrfToken;
  const catalog = await (await request.get('/api/products?q=Linen%20Lounge%20Chair')).json();
  expect(
    (
      await request.post('/api/cart', {
        headers: { 'X-CSRF-Token': csrf },
        data: { productId: catalog.products[0].id, quantity: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post('/api/orders', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          address: {
            name: 'Fulfillment Buyer',
            line1: '12 Example Lane',
            city: 'Portland',
            postalCode: '97201',
            country: 'US',
          },
          shippingMethod: 'standard',
          idempotencyKey: 'browser-seller-fulfillment',
        },
      })
    ).status(),
  ).toBe(201);
  await signIn(page, 'seller@3legant.demo');
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Seller studio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  await page.getByLabel('Product name', { exact: true }).fill('Browser Studio Chair');
  await page
    .getByLabel('Description', { exact: true })
    .fill('A carefully designed local sample chair created through the seller workspace.');
  await page.getByLabel('Price (USD)', { exact: true }).fill('88.50');
  await page.getByLabel('Stock quantity', { exact: true }).fill('4');
  await page.getByLabel('Upload product image', { exact: true }).setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'Product image preview 2' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Product image preview 2' })).toHaveJSProperty(
    'naturalWidth',
    1,
  );
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  let row = page.getByRole('row').filter({ hasText: 'Browser Studio Chair' });
  await expect(row).toContainText('$88.50');
  await row.getByRole('button', { name: /Edit/ }).click();
  await page.getByLabel('Stock quantity', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(row).toContainText('7');
  page.on('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(row).toContainText('Archived');
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row).toContainText('Active');
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  const queue = page.locator('article').filter({ hasText: 'Linen Lounge Chair' }).first();
  await expect(queue).toBeVisible();
  await queue.getByRole('button', { name: 'Mark shipped', exact: true }).click();
  await expect(queue.getByRole('button', { name: 'Mark delivered' })).toBeVisible();
  await queue.getByRole('button', { name: 'Mark delivered' }).click();
  await expect(queue).toContainText('delivered');
});

test('administrator manages categories, users and saved contact submissions', async ({ page }) => {
  await page.goto('/contact');
  await page.locator('main').getByLabel('Your name', { exact: true }).fill('Browser Contact');
  await page
    .locator('main')
    .getByLabel('Email address', { exact: true })
    .fill('browser-contact@example.test');
  await page.getByLabel('Subject', { exact: true }).fill('Browser inquiry');
  await page
    .getByLabel('Your message', { exact: true })
    .fill('Please confirm that contact requests reach the administrator workspace.');
  await page.getByRole('button', { name: 'Send your message' }).click();
  await expect(page.locator('main')).toContainText('Your message has been saved');
  await signIn(page, 'admin@3legant.demo');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByLabel('Category name', { exact: true }).fill('Browser Collection');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Browser Collection' });
  await expect(row).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: /Delete/ }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  const buyerRow = page.getByRole('row').filter({ hasText: 'buyer@3legant.demo' });
  await expect(buyerRow).toBeVisible();
  await buyerRow.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(buyerRow).toContainText('Disabled');
  await buyerRow.getByRole('button', { name: 'Enable', exact: true }).click();
  await expect(buyerRow).toContainText('Active');
  await page.getByRole('button', { name: /^Messages/ }).click();
  const message = page.locator('article').filter({ hasText: 'Browser inquiry' });
  await expect(message).toBeVisible();
  await message.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(message).toContainText('Resolved');
});

test('mobile navigation, route refresh and legacy compatibility', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const path of [
    '/blog',
    '/blog/a-room-to-unwind',
    '/privacy',
    '/terms',
    '/contact',
    '/not-a-real-page',
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something needs a little attention');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      path + ' fits mobile',
    ).toBe(true);
  }
  await page.goto('/home-bage.html');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/shop-page.html');
  await expect(page).toHaveURL(/\/shop$/);
  await page.goto('/sign-in.html');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible();
});
