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

## 🛒 5. Next Feature Plan: Orders API (`/api/orders`)

### Order Creation & Checkout Flow (`POST /api/orders`)
**Payload from Frontend / Body:**
```json
{
  "buyer": {
    "name": "Jane",
    "last_name": "Doe",
    "tlf_num": "+12345678"
  },
  "delivery_type": "standard",
  "payment_method": "credit_card",
  "items": [
    { "product_id": 1, "product_qty": 2 },
    { "product_id": 2, "product_qty": 1 }
  ]
}
```

**Transaction Sequence (`BEGIN` -> `COMMIT` / `ROLLBACK`):**
1. **Find/Create Client (Upsert):**
   - Query `tokki_shop.clients` WHERE `tlf_num = buyer.tlf_num`.
   - If found: Use existing `client_id`.
   - If not found: `INSERT INTO tokki_shop.clients` ➡️ access generated `client_id` via `newClientResult.rows[0].client_id`.
2. **Validate Products & Calculate Total:**
   - Loop through `items`.
   - Query `tokki_shop.products` for current `product_name`, `product_price`, `qty_available`, `is_archived`. *(Database is source of truth for prices).*
   - Reject if `is_archived = true` or `qty_available < product_qty`.
   - Deduct `product_qty` from `qty_available` and update `in_stock = (qty_available > 0)`.
   - Accumulate `total_amount += product_price * product_qty`.
3. **Insert Order Header:**
   - `INSERT INTO tokki_shop.orders` (`client_id`, `delivery_type`, `total_amount`, `payment_method`, `processed_by`).
   - Get generated `order_id` via `RETURNING order_id`.
4. **Insert Order Items:**
   - Loop through items and `INSERT INTO tokki_shop.order_items` (`order_id`, `product_id`, `product_name`, `product_qty`, `product_price`).
5. **Commit & Return:**
   - `COMMIT` transaction and return `201 Created` with full order summary.

### Additional Planned Order Endpoints
* **`GET /api/orders`**: List all orders for administrative dashboard.
* **`GET /api/orders/:order_id`**: Get single order header + associated line items.
* **`GET /api/orders/client/:client_id`**: List order history for a specific client.
* **`DELETE /api/orders/:order_id`**: Cancel an order, restore product quantities to `tokki_shop.products`, set `in_stock = true`, and remove the order record inside a transaction.
