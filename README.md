# 3legant — a considered home

A React/TypeScript marketplace for independent home-furnishing sellers, rebuilt from the original eleven static HTML pages. Includes an Express API, persistent SQLite database, role-based workspaces, original local illustrations, and a clearly labeled **demo checkout**. No real money is collected and no goods are shipped.

## Requirements and quick start

Use Node.js **22.13+** (Node 24 is verified), npm, and a C++ toolchain if the SQLite native module requires compilation. Work from this repository root:

```sh
npm ci --cache /tmp/3legant-npm-cache
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on port **3001** and Vite on **5173**, both bound to `127.0.0.1`. Vite proxies `/api` to the backend. The frontend and API must both run. Existing checkouts are already isolated in Codex; another Git worktree is unnecessary.

Migrations run automatically when opening the database; the explicit migration command is also provided. Seeding is repeatable: it inserts missing sample records and preserves existing users, stock edits, passwords, products, orders, and uploads. Seeding is **not a database reset**.

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

`npm start` runs the compiled API in production-serving mode on port 3001 and serves the Vite `dist` output. Build first, and keep `migrations/`, `public/images/`, and the persistent `data/` directory alongside the application. Restarting does not reseed unless explicitly requested. This build mode remains a local demo; it is not a claim of production commerce readiness.

## Development accounts

The seed command creates these explicitly fictional accounts, all with password **`DemoPass123!`**:

| Role          | Email               | Workspace                            |
| ------------- | ------------------- | ------------------------------------ |
| Buyer         | buyer@3legant.demo  | Account, saved pieces, order history |
| Seller        | seller@3legant.demo | Seller studio: Oak & Linen           |
| Second seller | studio@3legant.demo | Seller studio: Form Studio           |
| Administrator | admin@3legant.demo  | Administration                       |

New accounts can register as buyer or seller. Admin access is never available through public registration. Demo users are created only by the explicit seed command or `AUTO_SEED=true`; do not enable sample accounts on a public deployment. Production-mode seeding is blocked unless `ALLOW_DEMO_SEED=true` is explicitly supplied for an isolated demo.

## Available workflows

- Catalog search, category/price filters, sorting and pagination compose through URL query parameters.
- Product galleries, availability, related pieces and verified-purchase reviews.
- Server-persisted guest shopping bags; signing in merges the guest bag with the account bag and caps quantities to stock.
- Registration, sign-in/out, profile/password editing, password recovery, address CRUD, wishlists and order history.
- Demo checkout with server-calculated totals, immutable order line snapshots, atomic stock updates and idempotent order submission.
- Sellers create/edit/archive their own products, upload PNG/JPEG/WebP images, inspect their own order items and advance fulfillment.
- Admins manage product visibility/details, users, roles, categories, orders, reviews, contact messages and subscriptions. Historical orders are preserved.
- Original editorial pages, privacy/terms explanations, persistent contact submissions and newsletter subscriptions.
- Legacy `.html` entry points redirect to React routes. The original HTML files remain intact in `legacy/` for reference; they are not the active application.

All product imagery and editorial content are sample material. [ASSETS.md](ASSETS.md) describes the original local illustrations. No external font/image CDN or API key is required.

## Checkout rules

All money is stored as integer **USD cents**. Standard shipping costs **$8**, free for product subtotals of **$150+**. Express costs **$18**. Illustrative tax is **8% of the product subtotal**. These are demo rules, not jurisdiction-aware tax or delivery integrations. The server validates prices and inventory regardless of values submitted by the browser.

Fulfillment advances from `processing` → `shipped` → `delivered`. Each seller sees and updates only their own order items; aggregate buyer order status reflects all sellers. Product names, prices and images are snapshotted in order items so later catalog edits do not rewrite purchase history.

No payment provider, bank account, card collection, real shipment, refund settlement, or external email delivery is configured. A future live payment integration needs server-side secrets, official sandbox validation, verified webhooks, idempotent processing, and separate production review. There is no claim that provider test payments were verified.

## Configuration and persistence

Optional overrides may be placed in `.env` (copy `.env.example`) or exported in the shell. Never commit real credentials.

| Variable        | Default                   | Purpose                                      |
| --------------- | ------------------------- | -------------------------------------------- |
| `PORT`          | `3001`                    | API / compiled application port              |
| `DATABASE_PATH` | `data/marketplace.sqlite` | Persistent SQLite database                   |
| `OUTBOX_PATH`   | `data/outbox`             | Private development password-recovery outbox |
| `UPLOADS_PATH`  | `data/uploads`            | Seller-uploaded image files                  |
| `COOKIE_SECURE` | unset                     | Set `true` when serving through HTTPS        |
| `AUTO_SEED`     | unset                     | Explicit opt-in to seed at API startup       |
| `API_TARGET`    | `http://127.0.0.1:3001`   | Vite development API proxy destination       |
| `CHROMIUM_PATH` | `/usr/bin/chromium`       | Browser executable for Playwright            |

Back up SQLite consistently using its backup API or stop the server before copying the database together with its WAL files. Back up uploads too. Password hashes, sessions, addresses, orders and messages are local development data; the ignored `data/` directory must never be committed.

Uploaded images are limited to **3 MiB**, checked by file signatures, named by content hash, and served from `/images/uploads/`. Only local image paths are accepted for product images; external hotlinks and uploaded SVG are intentionally rejected.

## Local password recovery

Submit an account email through **Forgot your password?**. The response does not reveal whether an account exists. For an existing account, the API appends a private record to `data/outbox/password-reset.jsonl` (or `OUTBOX_PATH`). Open that file locally and use its relative `resetUrl` in the running app within 30 minutes. Treat those links as credentials; do not paste them into chat or commit the outbox. Reset links are single-use, and resetting a password invalidates existing account sessions. This mechanism sends no external email.

## Architecture

- `src/pages/`: storefront, journal, authentication, buyer and management pages.
- `src/components/`: reusable layout, product cards, dialogs and feedback states.
- `src/lib/`: typed API client, shared types and session/cart state.
- `src/styles.css`: responsive design system with keyboard focus and reduced-motion support.
- `server/app.ts`: validated API routes, sessions, CSRF, authorization and transactional order logic.
- `server/schema.ts`, `server/db.ts`, `migrations/`: Drizzle models, SQLite initialization and versioned migrations.
- `server/seed.ts`: fictional accounts and a varied 24-product catalog.
- `tests/`: isolated integration tests and real Chromium end-to-end workflows.
- `API_CONTRACT.md`: request/response contract.
- `PROJECT_PROGRESS.md`: implementation decisions and verified progress.

Passwords use salted scrypt. Sessions use hashed opaque identifiers in SQLite and HttpOnly/SameSite cookies. CSRF tokens protect mutations. Server-side role/ownership checks protect management and buyer data, requests are validated, sensitive API responses are not cached, and public submissions/authentication are rate-limited. HTTPS, secure cookies, deployment topology, real email/payment/tax services, backups, monitoring, retention and legal policies still need production-specific work.

## Testing

`npm test` uses temporary isolated databases and checks security boundaries, pricing, inventory, idempotency, persistence and seller/admin workflows. It never resets the development database.

`npm run test:e2e` starts an isolated seeded API on port **3003** and Vite on **5175**, then runs browser workflows. These ports must be free. Install Chromium or set `CHROMIUM_PATH` to a compatible executable. Test artifacts are written to ignored `test-results/`; isolated databases/outboxes use temporary directories. Browser tests use sample information and never contact a payment service.

Use `npm run format` to format the new TypeScript/CSS/docs and `npm run format:check` to verify formatting. Original legacy HTML is excluded from formatting.
