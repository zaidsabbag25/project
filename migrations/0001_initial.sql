CREATE TABLE users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'buyer' CHECK(role IN ('buyer','seller','admin')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE seller_profiles (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), store_name TEXT NOT NULL
);
CREATE TABLE sessions (
 id TEXT PRIMARY KEY NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
 csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expires ON sessions(expires_at);
CREATE TABLE password_resets (
 token_hash TEXT PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL
);
CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
CREATE TABLE products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 category_id INTEGER NOT NULL REFERENCES categories(id), seller_id INTEGER NOT NULL REFERENCES users(id),
 images TEXT NOT NULL CHECK(json_valid(images)), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX products_category ON products(category_id);
CREATE INDEX products_seller ON products(seller_id);
CREATE TABLE cart_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, owner_key TEXT NOT NULL,
 product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 UNIQUE(owner_key, product_id)
);
CREATE TABLE wishlists (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL REFERENCES products(id), UNIQUE(user_id, product_id)
);
CREATE TABLE addresses (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, line1 TEXT NOT NULL, line2 TEXT NOT NULL DEFAULT '', city TEXT NOT NULL,
 postal_code TEXT NOT NULL, country TEXT NOT NULL
);
CREATE INDEX addresses_user ON addresses(user_id);
CREATE TABLE orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN('processing','shipped','delivered')),
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), shipping INTEGER NOT NULL CHECK(shipping >= 0),
 tax INTEGER NOT NULL CHECK(tax >= 0), total INTEGER NOT NULL CHECK(total = subtotal + shipping + tax),
 address TEXT NOT NULL CHECK(json_valid(address)), shipping_method TEXT NOT NULL CHECK(shipping_method IN('standard','express')),
 payment_mode TEXT NOT NULL DEFAULT 'demo' CHECK(payment_mode = 'demo'),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(user_id, idempotency_key)
);
CREATE INDEX orders_user ON orders(user_id);
CREATE TABLE order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
 product_id INTEGER NOT NULL REFERENCES products(id), seller_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0), quantity INTEGER NOT NULL CHECK(quantity > 0), image TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN('processing','shipped','delivered'))
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE INDEX order_items_seller ON order_items(seller_id);
CREATE TABLE reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), user_id INTEGER NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL,
 verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN(0,1)), approved INTEGER NOT NULL DEFAULT 1 CHECK(approved IN(0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(product_id, user_id)
);
CREATE TABLE contacts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
 resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN(0,1)), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE subscribers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
