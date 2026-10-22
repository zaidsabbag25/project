import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['buyer', 'seller', 'admin'] })
      .notNull()
      .default('buyer'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check('users_role', sql`${t.role} IN ('buyer','seller','admin')`)],
);
export const sellerProfiles = sqliteTable('seller_profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id),
  storeName: text('store_name').notNull(),
});
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [index('sessions_user').on(t.userId), index('sessions_expires').on(t.expiresAt)],
);
export const passwordResets = sqliteTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
});
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    price: integer('price').notNull(),
    stock: integer('stock').notNull().default(0),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    sellerId: integer('seller_id')
      .notNull()
      .references(() => users.id),
    images: text('images', { mode: 'json' }).notNull().$type<string[]>(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check('products_price', sql`${t.price} >= 0`),
    check('products_stock', sql`${t.stock} >= 0`),
    index('products_category').on(t.categoryId),
    index('products_seller').on(t.sellerId),
  ],
);
export const cartItems = sqliteTable(
  'cart_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerKey: text('owner_key').notNull(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    uniqueIndex('cart_owner_product').on(t.ownerKey, t.productId),
    check('cart_quantity', sql`${t.quantity} > 0`),
  ],
);
export const wishlists = sqliteTable(
  'wishlists',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
  },
  (t) => [uniqueIndex('wishlist_user_product').on(t.userId, t.productId)],
);
export const addresses = sqliteTable(
  'addresses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2').notNull().default(''),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull(),
  },
  (t) => [index('addresses_user').on(t.userId)],
);
export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status', { enum: ['processing', 'shipped', 'delivered'] })
      .notNull()
      .default('processing'),
    subtotal: integer('subtotal').notNull(),
    shipping: integer('shipping').notNull(),
    tax: integer('tax').notNull(),
    total: integer('total').notNull(),
    address: text('address', { mode: 'json' }).notNull().$type<Record<string, string>>(),
    shippingMethod: text('shipping_method', { enum: ['standard', 'express'] }).notNull(),
    paymentMode: text('payment_mode').notNull().default('demo'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('orders_idempotency').on(t.userId, t.idempotencyKey),
    index('orders_user').on(t.userId),
  ],
);
export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    sellerId: integer('seller_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    price: integer('price').notNull(),
    quantity: integer('quantity').notNull(),
    image: text('image').notNull(),
    status: text('status', { enum: ['processing', 'shipped', 'delivered'] })
      .notNull()
      .default('processing'),
  },
  (t) => [index('order_items_order').on(t.orderId), index('order_items_seller').on(t.sellerId)],
);
export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    rating: integer('rating').notNull(),
    body: text('body').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    approved: integer('approved', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reviews_product_user').on(t.productId, t.userId),
    check('reviews_rating', sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});
export const subscribers = sqliteTable('subscribers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  createdAt: createdAt(),
});
