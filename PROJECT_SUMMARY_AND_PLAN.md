# Tokki Shop Backend: Architecture, Progress & Implementation Plan

This document summarizes all architectural decisions, database schemas, completed features, and the detailed implementation plan for the Tokki Shop backend API.

---

## 🏗️ 1. Technology Stack & Architecture

* **Stack:** PERN (PostgreSQL, Express.js, React, Node.js)
* **Module System:** ES Modules (`"type": "module"`)
* **Architecture Pattern:** **Level 2 Architecture** (Router ➡️ Controller + Direct Queries)
  - `src/config/db.js`: PostgreSQL connection pool adapter with query execution logging and 5-second connection leak diagnostics.
  - `src/routes/`: Route declarations mapping URL endpoints to controllers.
  - `src/controllers/`: Express handlers reading HTTP requests, performing validation, executing direct SQL queries via database client transactions, and returning standardized JSON.
  - `src/utils/validate.js`: Shared validation helpers (currently `normalizeAndValidatePhone`) reused across controllers.
  - `src/schema/tokki_schema.sql`: Authoritative PostgreSQL schema file for the `tokki_shop` schema.

---

## 🔐 2. Authentication Strategy (Clerk)

* **Provider:** [Clerk](https://clerk.com) (`@clerk/express`)
* **Decision:** Replaced custom user authentication & password hashing with Clerk.
* **Benefits:**
  - Zero password or crypto management on the server.
  - Built-in multi-factor auth, session rotation, and security rate-limiting.
  - Pre-built React components (`<SignIn />`, `<UserButton />`) for frontend UI.
  - Express route protection via Clerk's `requireAuth()` middleware.
* **Database Role:** The `tokki_shop.users` table is simplified to map `clerk_user_id` to internal roles (`tech_admin`, `shop_owner`).

---

## 🗄️ 3. PostgreSQL Database Schema (`tokki_shop` schema)

### A. `clients` Table (Buyer Info / Guest Checkout)
Stores contact details for customers placing orders. Identified uniquely by phone number.
* `client_id` (SERIAL PRIMARY KEY)
* `name` (VARCHAR(100) NOT NULL)
* `last_name` (VARCHAR(100) NOT NULL)
* `tlf_num` (VARCHAR(20) UNIQUE NOT NULL)

### B. `users` Table (Clerk Admin Mapping)
Maps Clerk authenticated user IDs to internal administrative accounts.
* `clerk_user_id` (VARCHAR(255) PRIMARY KEY)
* `email` (VARCHAR(255) NOT NULL)
* `user_type` (VARCHAR(50) NOT NULL DEFAULT 'shop_owner')
* `created_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)

### C. `products` Table (Inventory Catalog)
* `product_id` (SERIAL PRIMARY KEY)
* `product_name` (VARCHAR NOT NULL)
* `product_price` (NUMERIC(9, 2) NOT NULL)
* `product_description` (TEXT NOT NULL)
* `qty_available` (INTEGER NOT NULL DEFAULT 0)
* `in_stock` (BOOLEAN NOT NULL DEFAULT FALSE)
* `is_archived` (BOOLEAN NOT NULL DEFAULT FALSE) -- Soft-delete flag

### D. `orders` Table (Store Purchase Headers)
* `order_id` (SERIAL PRIMARY KEY)
* `client_id` (INTEGER NOT NULL FK -> `clients.client_id`)
* `delivery_type` (VARCHAR NOT NULL)
* `total_amount` (NUMERIC(9, 2) NOT NULL)
* `payment_method` (VARCHAR NOT NULL)
* `processed_by` (VARCHAR(255) FK -> `users.clerk_user_id` ON DELETE SET NULL)
* `status` (VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK IN `('approved', 'pending', 'canceled')`) -- Order lifecycle state
* `created_at` (TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)

### E. `order_items` Table (Order Line Items)
Preserves historical item names and prices at time of purchase.
* `order_item_id` (SERIAL PRIMARY KEY)
* `order_id` (INTEGER FK -> `orders.order_id` ON DELETE CASCADE)
* `product_id` (INTEGER FK -> `products.product_id` ON DELETE SET NULL)
* `product_name` (VARCHAR(100) NOT NULL)
* `product_qty` (INTEGER NOT NULL)
* `product_price` (DECIMAL(9, 2) NOT NULL)

---

## 📦 4. Completed & Verified Features: Products API (`/api/products`)

* **`GET /api/products`**: Returns all non-archived products.
* **`GET /api/products/:product_id`**: Returns single product details (404 if archived or missing).
* **`POST /api/products`**: Inserts a new product inside a transaction. Auto-calculates `in_stock = (qty_available > 0)`.
* **`PATCH /api/products/:product_id`**: Partial update using Merge Pattern (`!== undefined`). Auto-recalculates `in_stock` when quantity changes.
* **`DELETE /api/products/:product_id`**: Soft-deletes product by setting `is_archived = true`, `qty_available = 0`, `in_stock = false`.

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
    "tlf_num": "041469996703"
  },
  "delivery_type": "standard",
  "payment_method": "credit_card",
  "items": [
    { "product_id": 1, "product_qty": 2 },
    { "product_id": 2, "product_qty": 1 }
  ]
}
```

**Phone validation:** `normalizeAndValidatePhone(country_code, tlf_num)` in `src/utils/validate.js`.
- Local form (`041469996703` + `country_code`) or full international (`+584146996703`) are both accepted.
- Output is always normalized & stored as **E.164** (`+584146996703`) — compatible with WhatsApp for the shop owner's follow-up flow.
- Rejects empty, malformed, or non-international numbers with `400`.

**Validation performed (in order):**
1. Presence of `client_info`, `delivery_type`, `payment_method`, `items`.
2. Client name/last_name/tlf_num present.
3. Phone number is valid international format.
4. `delivery_type` / `payment_method` truthy; `items` is a non-empty array.
5. Per item: product exists (404), `product_qty > 0` (400), stock sufficient (400).

**Transaction Sequence (single `BEGIN` -> `COMMIT` / `ROLLBACK`):**
1. **Find/Create Client (Upsert):**
   - Query `tokki_shop.clients` WHERE `tlf_num = <normalized phone>`.
   - If found: use existing `client_id`.
   - If not found: `INSERT INTO tokki_shop.clients` in a separate transaction and use generated `client_id`.
2. **Validate Products & Deduct Stock:**
   - Loop through `items`, `SELECT ... FOR UPDATE` each product row (locks against concurrent archive/stock updates — prevents overselling).
   - Reject if missing (404), `qty <= 0` (400), or `qty_available < product_qty` (400) — early failures `ROLLBACK` the whole order transaction.
   - Deduct `product_qty` from `qty_available`, recalculating `in_stock = (qty_available > 0)`.
   - Accumulate `total_amount += product_price * product_qty` (database is source of truth for prices).
3. **Insert Order Header:** `INSERT INTO tokki_shop.orders (...)` -> get `order_id` via `RETURNING order_id`. `processed_by` is `NULL` for now (Clerk not yet wired); `status` is set to `'pending'` explicitly.
4. **Insert Order Items:** Loop through items and insert snapshotted `product_name`, `product_qty`, `product_price` into `tokki_shop.order_items`.
5. **Commit & Return:** `COMMIT` and return `201 Created` with order summary (`order_id`, `total_amount`, `items`) in the standard `{ success, data, message }` envelope.

### `GET /api/orders` — List All Orders
Returns every order with buyer info (`name`, `last_name`, `tlf_num`), `total_amount`, `status`, `item_count` (number of distinct line items via `COUNT(o_i.product_id)`), and `created_at`. Ordered newest-first. Empty set returns `{ success: true, message: "No orders have been placed." }`.

### `GET /api/orders/:order_id` — Single Order Details
Returns the order header + client info (including `status`), plus each line item (snapshot `product_name`, `product_qty`, `product_price`, and computed `product_total = qty * price`). Controller folds the flat join rows into `{ header, client, items[] }`. 404 if the order doesn't exist.

---

## 🚧 6. Next Feature Plan: Remaining Orders Endpoints

### `GET /api/orders/client/:client_id`
List order history for a specific client.

### `PATCH /api/orders/:order_id/cancel` — Cancel Order
Rather than hard-deleting orders, the `orders` table carries a lifecycle `status` (`'approved'`, `'pending'`, `'canceled'`), defaulting to `'pending'` on creation. The record is always kept for history/audit.

**Cancel logic (inside a transaction):**
1. Read the order; 404 if it doesn't exist.
2. **Idempotency guard:** only proceed if the current status is `'pending'` or `'approved'`. If already `'canceled'`, return without touching stock (prevents double-restoring quantities).
3. `SELECT ... FOR UPDATE` the involved product rows (from `order_items`) — stock may have moved since checkout.
4. Restore `product_qty` to each `qty_available`, resetting `in_stock = (qty_available > 0)`.
5. Set the order `status = 'canceled'`.
6. `COMMIT`.

### `PATCH /api/orders/:order_id/approve` — Approve Order
Transitions an order from `'pending'` to `'approved'` once the shop owner confirms/handles it. No stock changes — quantities were already deducted at checkout.

**Approve logic (inside a transaction):**
1. Read the order; 404 if it doesn't exist.
2. **Transition guard:** only `'pending'` -> `'approved'` is allowed. If already `'approved'`, return as no-op (idempotent). If `'canceled'`, reject — a canceled order cannot be approved.
3. Set the order `status = 'approved'`.
4. `COMMIT`.

**Invariants across both endpoints:**
- New orders are always created with `status = 'pending'` (set explicitly in `createOrder`).
- Targets are only `'approved'` or `'canceled'` — "un-canceling" and "un-approving" are rejected.
