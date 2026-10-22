# Marketplace implementation contract

All API paths start `/api`. JSON errors: `{error:string}` with appropriate HTTP status. All money is integer USD cents. Product IDs, user IDs and order IDs are numeric. JSON fields use camelCase. Responses use wrappers below. Session cookies HttpOnly SameSite=Lax. Every mutation requires `X-CSRF-Token` from GET /auth/session (except test configuration where still fetch it). Same-origin dev via Vite /api proxy to port 3001. UI port 5173.

Types:

- User: {id,name,email,role:'buyer'|'seller'|'admin',active:boolean}
- Category: {id,name,slug}
- Product: {id,slug,name,description,price,stock,categoryId,category:string,categorySlug:string,sellerId,sellerName,images:string[],archived:boolean,createdAt:string,rating:number,reviewCount:number}
- Address: {id?,name,line1,line2?,city,postalCode,country}
- Review: {id,productId,userName,rating,body,verified:boolean,approved:boolean,createdAt}
- Cart: {items:[{product:Product,quantity:number}],subtotal,shipping,tax,total}
- Order: {id,userId?,buyerName?,createdAt,status,subtotal,shipping,tax,total,address:Address,shippingMethod,paymentMode:'demo',items:[{id,productId,sellerId,name,price,quantity,image,status}]}

Public and auth:

- GET /health -> {status:'ok',database:'ok'}
- GET /auth/session -> {user:User|null,csrfToken:string}
- POST /auth/register {name,email,password,role?:'buyer'|'seller'} -> {user,csrfToken}
- POST /auth/login {email,password} -> {user,csrfToken}
- POST /auth/logout -> {user:null,csrfToken}
- POST /auth/forgot-password {email} -> {message}; development outbox is disk-only, not publicly exposed
- POST /auth/reset-password {token,password} -> {message}
- GET /categories -> {categories:Category[]}
- GET /products?q=&category=slug&minPrice=cents&maxPrice=cents&sort=newest|price-asc|price-desc|name&page=1&limit=12 -> {products:Product[],total,page,pages}
- GET /products/:slug -> {product:Product,reviews:Review[]}
- POST /products/:id/reviews {rating,body} -> {review} (buyer who purchased product)
- POST /contact {name,email,subject,message} -> {message}
- POST /newsletter {email} -> {message}

Account and shopping:

- PATCH /account {name,email} -> {user}
- POST /account/password {currentPassword,password} -> {message}
- GET /addresses -> {addresses:Address[]}
- POST /addresses {name,line1,line2?,city,postalCode,country} -> {address}
- PATCH /addresses/:id same body -> {address}; DELETE /addresses/:id -> {ok:true}
- GET /cart -> Cart (anonymous session allowed, persistent DB cart merged into user cart on login, quantities capped to available stock)
- POST /cart {productId,quantity} -> Cart (add quantity)
- PATCH /cart/:productId {quantity} -> Cart; DELETE /cart/:productId -> Cart
- GET /wishlist -> {products:Product[]}; POST /wishlist/:productId -> {ok:true}; DELETE /wishlist/:productId -> {ok:true}
- GET /orders -> {orders:Order[]}; GET /orders/:id -> {order:Order} (buyer owner or admin)
- POST /orders {addressId?:number,address?:Address,shippingMethod:'standard'|'express',idempotencyKey:string} -> {order:Order}; no submitted prices accepted. Standard $8/free >=$150, express $18, tax 8% of subtotal (demo US rule). Whole transaction validates stock, snapshots line prices, decrements stock, clears cart, idempotent per buyer/key. Demo payment only, never real cards.

Seller (role seller or admin; scope by authenticated owner even admin when using seller routes):

- GET /seller/dashboard -> {stats:{products,orders,revenue},products:Product[],orders:Order[],categories:Category[]}; orders expose only this seller's items, seller-specific totals, no other sellers' data
- POST /seller/images {data:base64,filename?:string} -> {image:string,path:string} (201; aliases); seller/admin only, CSRF protected; PNG/JPEG/WebP signature validation, maximum decoded size 3 MB; files persist in UPLOADS_PATH or data/uploads and are served at /images/uploads/{sha256}.{png|jpg|webp}. Product images accept existing bundled /images/* or uploaded paths, not external URLs.
- POST /seller/products {name,description,price,stock,categoryId,images:string[]} -> {product}
- PATCH /seller/products/:id same fields, partial allowed incl archived -> {product}
- DELETE /seller/products/:id -> {ok:true} (archive only)
- PATCH /seller/orders/:id {status:'processing'|'shipped'|'delivered'} -> {ok:true}; transitions processing -> shipped -> delivered, only own items

Admin:

- GET /admin/dashboard -> {stats:{users,products,orders,revenue},users:User[],products:Product[],categories:Category[],orders:Order[],reviews:Review[],contacts:[{id,name,email,subject,message,resolved,createdAt}],subscribers:[{id,email,createdAt}]}
- PATCH /admin/users/:id {role?,active?} -> {user}; protect last active admin and own deactivation/demotion
- PATCH /admin/products/:id {archived?,...productFields} -> {product}
- POST /admin/categories {name} -> {category}; PATCH /admin/categories/:id {name} -> {category}; DELETE /admin/categories/:id -> {ok:true} (reject if products reference category)
- PATCH /admin/reviews/:id {approved:boolean} -> {ok:true}
- PATCH /admin/contacts/:id {resolved:boolean} -> {ok:true}
- PATCH /admin/orders/:id {status:'processing'|'shipped'|'delivered'} -> {ok:true}; valid forward transitions, propagate remaining items

Seed: >=24 furnishings across Living Room, Bedroom, Kitchen, Lighting, Accessories; two sellers, buyer, admin. Explicit demo accounts. Images all local /images/*.svg or .jpg; maintain ASSETS.md with sources/license. No real reviews seeded as verified. Build `npm run build`, `npm run typecheck`, `npm test`, `npm run test:e2e`. Backend exports createApp(dbPath?) and closeable DB where practical for isolated tests. `DATABASE_PATH` default data/marketplace.sqlite. Server listens configurable PORT=3001, production serves dist and SPA fallback, legacy .html redirects map to React routes.
