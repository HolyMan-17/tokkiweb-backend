# Tokki Shop Backend: Architecture, Progress & Implementation Plan

This document summarizes all architectural decisions, database schemas, completed features, and the detailed implementation plan for the Tokki Shop backend API.

---

## 🏗️ 1. Technology Stack & Architecture

* **Stack:** PERN (PostgreSQL, Express.js, React, Node.js)
* **Module System:** ES Modules (`"type": "module"`)
* **Architecture Pattern:** **Level 2 Architecture** (Router ➡️ Controller + Direct Queries)
  - `src/config/db.js`: PostgreSQL connection pool adapter with query execution logging and 5-second connection leak diagnostics.
  - `src/routes/`: Route declarations mapping URL endpoints to controllers.
  - `src/controllers/`: Express handlers reading HTTP requests, performing validation, executing direct SQL queries via database client transactions, and returning standardized JSON. SQL strings are always fully literal — no `${}` interpolation into queries, ever; dynamic behavior means separate complete queries per branch and all values bind via `$n` params.
  - `src/utils/validate.js`: Shared validation helpers (currently `normalizeAndValidatePhone`) reused across controllers.
  - `src/schema/tokki_schema.sql`: Authoritative PostgreSQL schema file for the `tokki_shop` schema.

---

## 🔐 2. Authentication Strategy (Clerk — wired)

* **Provider:** [Clerk](https://clerk.com) (`@clerk/express` v2)
* **Decision:** Replaced custom user authentication & password hashing with Clerk.
* **Benefits:**
  - Zero password or crypto management on the server.
  - Built-in multi-factor auth, session rotation, and security rate-limiting.
  - Pre-built React components (`<SignIn />`, `<UserButton />`) for frontend UI.
* **How it's wired (v2 pattern — no `requireAuth()`):**
  - Requires both `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` in env — the SDK needs the publishable key server-side to build auth context (it's public info; same value the frontend holds).
  - `clerkMiddleware()` runs globally in `src/app.js`; CORS is restricted to `FRONTEND_ORIGINS` (default `http://localhost:5173`).
  - Protected routes chain the custom `requireAdmin` middleware (`src/middleware/auth.js`): missing session → JSON `401`; then it loads the Clerk user via Backend API and requires `publicMetadata.role ∈ {'owner','tech'}` → else `403`; on success stashes `req.adminUser`.
  - Role mapping to DB: `owner`→`shop_owner`, `tech`→`tech_admin`. Cancel/approve lazily upsert the acting admin into `tokki_shop.users` and write their id into `orders.processed_by`.
* **Public endpoints:** product GETs + `POST /api/orders` (guest checkout) + `GET /api/orders/receipt/:order_token` (secure order receipt). Everything else needs an admin token.
* **Database Role:** The `tokki_shop.users` table maps `clerk_user_id` to internal roles.

---

## 🗄️ 3. PostgreSQL Database Schema (`tokki_shop` schema)

### A. `clients` Table (Buyer Identity / Guest Checkout)
Stores buyer identity. Customers are uniquely identified across the store by their national ID (`cedula`).
* `client_id` (SERIAL PRIMARY KEY)
* `name` (VARCHAR(100) NOT NULL)
* `last_name` (VARCHAR(100) NOT NULL)
* `cedula` (VARCHAR(12) UNIQUE NOT NULL) -- Primary client identifier, canonical "V-12345678"
* `created_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)
* `updated_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)

### B. `clients_p_number` Table (Normalized Client Phone Numbers)
Stores and tracks multiple contact phone numbers associated with each client.
* `phone_id` (SERIAL PRIMARY KEY)
* `client_id` (INTEGER NOT NULL FK -> `clients.client_id` ON DELETE CASCADE)
* `tlf_num` (VARCHAR(20) NOT NULL) -- Normalized E.164 format (+58...)
* `is_primary` (BOOLEAN NOT NULL DEFAULT FALSE)
* `last_used_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)
* `created_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)
* Composite unique constraint: `UNIQUE (client_id, tlf_num)`

### C. `users` Table (Clerk Admin Mapping)
Maps Clerk authenticated user IDs to internal administrative accounts.
* `clerk_user_id` (VARCHAR(255) PRIMARY KEY)
* `email` (VARCHAR(255) NOT NULL)
* `user_type` (VARCHAR(50) NOT NULL DEFAULT 'shop_owner')
* `created_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)

### D. `products` Table (Inventory Catalog)
* `product_id` (SERIAL PRIMARY KEY)
* `product_name` (VARCHAR NOT NULL)
* `product_price` (NUMERIC(9, 2) NOT NULL)
* `product_description` (TEXT NOT NULL)
* `category` (VARCHAR(100) NOT NULL DEFAULT `'Otros'`) -- display name; values mirror the frontend `CATEGORIES` constant
* `product_image` (TEXT, nullable) -- storage key shaped `products/<uuid>.webp`; public URLs are composed at response time, never stored
* `qty_available` (INTEGER NOT NULL DEFAULT 0)
* `in_stock` (BOOLEAN NOT NULL DEFAULT FALSE)
* `is_archived` (BOOLEAN NOT NULL DEFAULT FALSE) -- Soft-delete flag

### E. `orders` Table (Store Purchase Headers)
* `order_id` (SERIAL PRIMARY KEY)
* `order_token` (UUID NOT NULL DEFAULT `gen_random_uuid()` UNIQUE) -- Unguessable capability token for public guest receipt access
* `client_id` (INTEGER NOT NULL FK -> `clients.client_id`)
* `contact_phone` (VARCHAR(20) NOT NULL) -- Contact phone snapshot for this specific order
* `delivery_type` (VARCHAR NOT NULL, CHECK IN `('envio_nacional', 'delivery', 'retiro_tienda')`) -- enforced slugs; labels live in the frontend
* `total_amount` (NUMERIC(9, 2) NOT NULL)
* `payment_method` (VARCHAR NOT NULL)
* `processed_by` (VARCHAR(255) FK -> `users.clerk_user_id` ON DELETE SET NULL)
* `status` (VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK IN `('approved', 'pending', 'canceled')`) -- Order lifecycle state
* `created_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)

### F. `order_items` Table (Order Line Items)
Preserves historical item names and prices at time of purchase.
* `order_item_id` (SERIAL PRIMARY KEY)
* `order_id` (INTEGER FK -> `orders.order_id` ON DELETE CASCADE)
* `product_id` (INTEGER FK -> `products.product_id` ON DELETE SET NULL)
* `product_name` (VARCHAR(100) NOT NULL)
* `product_qty` (INTEGER NOT NULL)
* `product_price` (DECIMAL(9, 2) NOT NULL)


---

## 📦 4. Completed & Verified Features: Products API (`/api/products`)

* **`GET /api/products`**: Returns all non-archived products. Optional `?category=` filter (exact display-name match).
* **`GET /api/products/:product_id`**: Returns single product details (404 if archived or missing).
* **`POST /api/products`**: Inserts a new product inside a transaction; requires `category` (non-empty string ≤100 chars). Auto-calculates `in_stock = (qty_available > 0)`.
* **`PATCH /api/products/:product_id`**: Partial update using Merge Pattern (`!== undefined`). Auto-recalculates `in_stock` when quantity changes.
* **`DELETE /api/products/:product_id`**: Soft-deletes product by setting `is_archived = true`, `qty_available = 0`, `in_stock = false`.

**Category convention:** stored as the exact display name the frontend renders and matches on (`p.category === CATEGORIES[i].name`); the allowed set lives in the frontend's `src/constants/index.ts`. Pre-category rows default to `'Otros'` via an idempotent `ALTER TABLE` at the bottom of `tokki_schema.sql`.

**Product images:** every product response carries `product_image_url`, composed at response time by `attachImageUrls`/`toPublicImageUrl` — raw keys never leave the API.
* **`POST /api/products/:product_id/image`** *(admin)*: multipart upload gated by `uploadImage` (memory storage, 5 MB cap, declared-mime allowlist + magic-byte sniff), normalized to WebP (≤1600px, q82) by `saveProductImage`, key persisted transactionally with an `is_archived = false` guard; replaced files are deleted only after commit, failed updates clean up the new file (`applyProductImage` orchestrates the save → persist → cleanup sequence).
* **`DELETE /api/products/:product_id/image`** *(admin)*: nulls the key transactionally (`clearProductImage`), deletes the file after commit; idempotent no-op when no image is set.
* Archiving a product deletes its stored file post-commit (`cleanupProductImages`, best-effort).
* Stored images are served statically at `/images/<key>` with 7-day immutable caching.

---

## 🛒 5. Completed & Verified Features: Orders API (`/api/orders`)

### `POST /api/orders` — Order Creation & Checkout Flow
**Payload from Frontend / Body:**
```json
{
  "client_info": {
    "name": "Jane",
    "last_name": "Doe",
    "country_code": "+58",
    "tlf_num": "041469996703",
    "cedula": "V-12345678"
  },
  "delivery_type": "envio_nacional",
  "payment_method": "pago_movil",
  "items": [
    { "product_id": 1, "product_qty": 2 },
    { "product_id": 2, "product_qty": 1 }
  ]
}
```

**Cedula identification & phone validation:**
- `client_info.cedula` is **REQUIRED** (Venezuelan ID). Lenient input is normalized via `normalizeAndValidateCedula(cedula)` to canonical combined form `"V-12345678"`.
- `client_info.tlf_num` is validated and normalized via `normalizeAndValidatePhone(country_code, tlf_num)` to **E.164** (`+584146996703`).
- Output phone format is WhatsApp-compatible for shop owner order follow-ups.

**Validation performed (in order):**
1. Presence of `client_info`, `delivery_type`, `payment_method`, `items`.
2. Client `name`, `last_name`, `tlf_num`, and `cedula` present; `cedula` normalized & validated (`"Invalid cedula format."` on bad input).
3. Phone number is valid international format (`"Phone number must be a valid international format."`).
4. `delivery_type` / `payment_method` truthy; `items` is a non-empty array; `delivery_type` ∈ allowed slugs (`envio_nacional`, `delivery`, `retiro_tienda` — also enforced by a DB CHECK constraint); every item's `product_id`/`product_qty` is a positive integer (`validateOrderItems`) — all **before** any transaction or row locking.
5. Per item: product exists (404), stock sufficient (400).

**Transaction Sequence (single consolidated `BEGIN` -> `COMMIT` / `ROLLBACK`):**
1. **Find/Create Client (Keyed on Cédula):**
   - Query `tokki_shop.clients` WHERE `cedula = <normalized cedula>`.
   - If found: reuse existing `client_id`.
   - If not found: `INSERT INTO tokki_shop.clients(cedula, name, last_name) VALUES(...) RETURNING client_id`.
2. **Register/Update Phone in `clients_p_number`:**
   - Upsert normalized phone into `tokki_shop.clients_p_number` with composite key `(client_id, tlf_num)`:
     `INSERT INTO tokki_shop.clients_p_number(client_id, tlf_num, last_used_at) VALUES($1, $2, NOW()) ON CONFLICT (client_id, tlf_num) DO UPDATE SET last_used_at = NOW()`.
3. **Validate Products & Deduct Stock:**
   - Loop through `items`, `SELECT ... FOR UPDATE` each product row (locks against concurrent archive/stock updates — prevents overselling).
   - Reject if missing (404), `qty <= 0` (400), or `qty_available < product_qty` (400) — early failures `ROLLBACK` the whole order transaction.
   - Deduct `product_qty` from `qty_available`, recalculating `in_stock = (qty_available > 0)`.
   - Accumulate `total_amount += product_price * product_qty` (database is source of truth for prices).
4. **Insert Order Header:** `INSERT INTO tokki_shop.orders (client_id, contact_phone, delivery_type, total_amount, payment_method, processed_by, status, created_at) VALUES(...)` -> snapshots `contact_phone` and gets `order_id`. `status` is set to `'pending'`.
5. **Insert Order Items:** Loop through items and insert snapshotted `product_name`, `product_qty`, `product_price` into `tokki_shop.order_items`.
6. **Commit & Return:** `COMMIT` and return `201 Created` with order summary (`order_id`, `order_token`, `delivery_type`, `payment_method`, `total_amount`, `contact_phone`, `items`) in the standard `{ success, data, message }` envelope.

### `GET /api/orders/receipt/:order_token` — Order Confirmation Receipt (Public)
Public endpoint using an unguessable UUIDv4 `order_token` to return the order receipt (`order_id`, `order_token`, `status`, `delivery_type`, `payment_method`, `client`, `total_amount`, `created_at`, `items[]`). Allows buyers to load and refresh their confirmation screen securely without exposing sequential IDs or requiring authentication.

### `GET /api/orders` — List All Orders (Admin)
Returns every order with buyer info (`name`, `last_name`, `tlf_num` reflecting `contact_phone` snapshot, `cedula`), `delivery_type`, `payment_method`, `total_amount`, `status`, `item_count` (number of distinct line items via `COUNT(o_i.product_id)`), and `created_at`. Ordered newest-first. Empty set returns `{ success: true, message: "No orders have been placed." }`. Requires Clerk admin session.

### `GET /api/orders/:order_id` — Single Order Details (Admin)
Returns the order header + client info (including `order_token`, `status`, `delivery_type`, `payment_method`, and `tlf_num` reflecting the `contact_phone` snapshot), plus each line item (snapshot `product_name`, `product_qty`, `product_price`, and computed `product_total = qty * price`). Requires Clerk admin session. 404 if the order doesn't exist.

### `GET /api/orders/client/:client_id` — Client Order History (Admin)
Same shape as the dashboard list (`tlf_num` reflecting `contact_phone` snapshot, `delivery_type`, `payment_method`), filtered by `client_id`, newest-first. Empty result returns `"No orders have been placed by this client."`; a nonexistent `client_id` returns 404 (`"Client doesn't exist."`). Requires Clerk admin session.

### `PATCH /api/orders/:order_id/cancel` — Cancel Order (Admin)
The `orders` table carries a lifecycle `status`; records are never hard-deleted.

**Cancel logic (inside a transaction):**
1. `SELECT ... FOR UPDATE` the order row; 404 if missing.
2. **Guard:** only `'pending'` orders can be canceled. `'approved'`/`'canceled'` are rejected with 400 — prevents double-restoring stock.
3. Restore each line item's `product_qty` to `qty_available` (recalculating `in_stock`).
4. Set `status = 'canceled'`, `COMMIT`. Response is `{ success, message }` with no `data` payload.

> **Deviation from original plan:** the plan allowed canceling from `'approved'` too; implementation restricts cancel to `'pending'` only.

### `PATCH /api/orders/:order_id/approve` — Approve Order (Admin)
Transitions `'pending'` -> `'approved'` when the shop owner confirms an order. No stock changes — quantities were deducted at checkout.

**Approve logic (inside a transaction):**
1. `SELECT ... FOR UPDATE` the order row; 404 if missing ("Requested order doesn't exist.").
2. **Guard:** only `'pending'` can be approved. Anything else → 400 "Order has already been processed."
3. Set `status = 'approved'`, `COMMIT`. Returns the updated row as `data`.

**Invariants across both endpoints:**
- New orders are always created with `status = 'pending'` (set explicitly in `createOrder`).
- Both terminal states (`'approved'`, `'canceled'`) reject further transitions — no un-canceling or un-approving.

---

## 🚧 6. What's Next

All originally planned endpoints are now implemented. The forward-looking backlog lives in [`ROADMAP.md`](ROADMAP.md); agent-oriented project context lives in [`CONTEXT.md`](CONTEXT.md). Highlights of known gaps:

* **Auth wired:** `clerkMiddleware()` + `requireAdmin` protect product mutations and all order management endpoints (`GET /api/orders`, `GET /api/orders/:id`, `GET /api/orders/client/:id`, cancel, approve). Guest checkout (`POST /api/orders`) and receipt (`GET /api/orders/receipt/:order_token`) remain public.
* **Test coverage:** 116 unit tests across 10 suites — phone + cedula validation (`tests/validate.test.js`), field-type validation (`tests/product-validation.test.js`), image storage (`storage.test.js`), upload middleware (`upload.test.js`), image-upload + image-removal orchestration (`product-image.test.js`), archive cleanup (`image-cleanup.test.js`), params parsing (`params.test.js`), client & phone synchronization (`client-sync.test.js`), order creation validation (`orders.test.js`), and order receipt resolution (`order-receipt.test.js`). Controller/integration tests (supertest) are still pending (ROADMAP P2 #9).
