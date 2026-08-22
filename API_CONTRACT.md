# Tokki Shop Backend API Contract

**Version:** 1.2.0  
**Base URL:** `http://localhost:3000/api`  
**Content-Type:** `application/json`
**Auth:** Clerk session tokens. Admin endpoints require `Authorization: Bearer <token>` (token from the frontend's `useAuth().getToken()`), and the Clerk user must have `publicMetadata.role` of `owner` or `tech`. Public endpoints: product GETs + `POST /api/orders`. Missing/invalid token on protected routes → `401`; authenticated but not admin → `403`, both in the standard envelope:

```json
{ "success": false, "message": "Authentication required." }
```

---

## 📋 General Response Format

All API responses follow a standardized JSON envelope structure.

### Success Response Format
```json
{
  "success": true,
  "data": { ... }, // Object or Array of items
  "message": "Optional descriptive success message"
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Detailed explanation of the error"
}
```

### Standard HTTP Status Codes
* `200 OK`: Request succeeded (GET, PATCH, DELETE).
* `201 Created`: Resource successfully created (POST).
* `400 Bad Request`: Validation failure or missing required body fields.
* `404 Not Found`: Resource ID does not exist in database or is archived.
* `500 Internal Server Error`: Unhandled server/database error.

---

## 📦 1. Products API (`/api/products`)

### 1.1 List All Active Products
Retrieves all non-archived products available in the store catalog.

* **Method:** `GET`
* **Path:** `/api/products`
* **Headers:** `Accept: application/json`
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "product_id": 1,
      "product_name": "Tokki Hoodie",
      "product_price": "49.99",
      "product_description": "Comfortable oversized cotton hoodie",
      "qty_available": 25,
      "in_stock": true
    }
  ]
}
```

---

### 1.2 Get Single Product Details
Retrieves details for a specific active product by its ID.

* **Method:** `GET`
* **Path:** `/api/products/:product_id`
* **URL Params:** `product_id` (integer, required)
* **Headers:** `Accept: application/json`
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "product_id": 1,
    "product_name": "Tokki Hoodie",
    "product_price": "49.99",
    "product_description": "Comfortable oversized cotton hoodie",
    "qty_available": 25,
    "in_stock": true
  }
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Product was not found."
}
```

---

### 1.3 Create Product
Adds a new product to the catalog. Automatically calculates `in_stock = true` if `qty_available > 0`.

* **Method:** `POST`
* **Path:** `/api/products`
* **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "product_name": "Tokki T-Shirt",
  "product_price": 24.99,
  "product_description": "100% organic cotton graphic tee",
  "qty_available": 50
}
```

#### Response `201 Created`
```json
{
  "success": true,
  "row": {
    "product_id": 2,
    "product_name": "Tokki T-Shirt",
    "product_price": "24.99",
    "product_description": "100% organic cotton graphic tee",
    "qty_available": 50,
    "in_stock": true,
    "is_archived": false
  }
}
```

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "All product fields are required!"
}
```

---

### 1.4 Update Product Details (Partial Update)
Updates specific details of an existing product. If `qty_available` is modified, `in_stock` is recalculated automatically.

* **Method:** `PATCH`
* **Path:** `/api/products/:product_id`
* **URL Params:** `product_id` (integer, required)
* **Headers:** `Content-Type: application/json`

#### Request Body (All fields optional, at least one required)
```json
{
  "product_price": 19.99,
  "qty_available": 10
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "updated_row": {
    "product_id": 2,
    "product_name": "Tokki T-Shirt",
    "product_price": "19.99",
    "product_description": "100% organic cotton graphic tee",
    "qty_available": 10,
    "in_stock": true
  }
}
```

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "At least 1 product field needs to be updated."
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Product ID is not valid"
}
```

---

### 1.5 Soft-Delete Product
Archives a product by setting `is_archived = true`, `qty_available = 0`, and `in_stock = false`.

* **Method:** `DELETE`
* **Path:** `/api/products/:product_id`
* **URL Params:** `product_id` (integer, required)
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Product successfully archived"
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Product ID is not valid."
}
```

---

## 🛒 2. Orders API (`/api/orders`)

### 2.1 Create Order (Checkout)

Processes a full checkout: finds/creates the client, validates & deducts product stock, inserts the order header and line items inside a **single transaction** (`BEGIN` -> `COMMIT` / `ROLLBACK`).

* **Method:** `POST`
* **Path:** `/api/orders`
* **Headers:** `Content-Type: application/json`

#### Request Body
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

**Phone format (flexible, international):**
* Local form: `country_code` (`+58`) + `tlf_num` (`041469996703`) -> normalized & stored as E.164 (`+584146996703`).
* International form: `tlf_num` provided as a full E.164 number (`+584146996703`), in which case `country_code` may be omitted.
* Rejects: empty/whitespace, embedded formatting chars, wrong length, malformed or missing `country_code` when `tlf_num` is not international, invalid E.164 (8-15 digits after `+`, first digit 1-9).

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "order_id": 5,
    "total_amount": "99.98",
    "items": [
      { "id": 1, "name": "Tokki Hoodie", "ordered_qty": 2, "price": "49.99" }
    ]
  },
  "message": "Order has been successfully created."
}
```
**Note:** every new order is created with `status: 'pending'` by the database default.

#### Response `400 Bad Request`
Any of: missing `client_info`/`delivery_type`/`payment_method`/`items`; missing client name/last_name/tlf_num; invalid phone number; empty `items` or `items` not an array; `product_qty <= 0`; insufficient stock.
```json
{
  "success": false,
  "message": "Requested quantity is not available in the stock."
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Product was not found."
}
```

**Concurrency note:** product rows are locked with `SELECT ... FOR UPDATE` inside the transaction, so stock can never be oversold by parallel orders.

---

### 2.2 List All Orders (Dashboard)

Returns all orders with the buyer's info and a per-order distinct line-item count.

* **Method:** `GET`
* **Path:** `/api/orders`
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "order_id": 5,
      "name": "Jane",
      "last_name": "Doe",
      "tlf_num": "+584146996703",
      "total_amount": "99.98",
      "status": "pending",
      "item_count": 2,
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ]
}
```

#### Response `200 OK` (no orders yet)
```json
{
  "success": true,
  "message": "No orders have been placed."
}
```

---

### 2.3 Get Single Order (Full Details)

Returns the order header, client info, and the full list of line items (name, quantity, unit price, and computed line total).

* **Method:** `GET`
* **Path:** `/api/orders/:order_id`
* **URL Params:** `order_id` (integer, required)
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "order_id": 3,
    "status": "pending",
    "client": {
      "name": "Jane",
      "last_name": "Doe",
      "tlf_num": "+584146996703"
    },
    "total_amount": "74.98",
    "created_at": "2026-08-04T12:00:00.000Z",
    "items": [
      {
        "product_name": "Tokki Hoodie",
        "product_qty": 2,
        "product_price": "49.99",
        "product_total": "99.98"
      }
    ]
  },
  "message": "Order retrieved."
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Order doesn't exist."
}
```

**Note:** item names/prices come from the `order_items` snapshot (as paid at purchase time), not the live `products` table.

---

### 2.4 Cancel Order

Cancels an order and restores its reserved stock. Orders are never hard-deleted — the record stays for history/audit with `status = 'canceled'`.

* **Method:** `PATCH`
* **Path:** `/api/orders/:order_id/cancel`
* **URL Params:** `order_id` (integer, required)
* **Request Body:** None

**Behavior (inside a transaction):**
1. Locks the order row (`SELECT ... FOR UPDATE`); 404 if it doesn't exist.
2. Only proceeds if the current status is `'pending'`. An already-processed order (`'approved'` or `'canceled'`) is rejected with `400` — this prevents double-restoring stock.
3. Restores each line item's `product_qty` back to `products.qty_available`, recalculating `in_stock`.
4. Sets `status = 'canceled'`.

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Order was canceled."
}
```

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "Order can only be canceled while pending."
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Order doesn't exist."
}
```

---

### 2.5 Approve Order

Transitions an order from `'pending'` to `'approved'` once the shop owner confirms it. No stock changes — quantities were deducted at checkout.

* **Method:** `PATCH`
* **Path:** `/api/orders/:order_id/approve`
* **URL Params:** `order_id` (integer, required)
* **Request Body:** None

**Behavior (inside a transaction):**
1. Locks the order row; 404 if it doesn't exist.
2. Only proceeds if the current status is `'pending'`. Already-approved orders are rejected with `400` ("already processed"); canceled orders cannot be approved.

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Order was successfully approved",
  "data": {
    "order_id": 3,
    "status": "approved"
  }
}
```

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "Order has already been processed."
}
```

#### Response `404 Not Found`
```json
{
  "success": false,
  "message": "Requested order doesn't exist."
}
```

---

### 2.6 List Client Order History

Returns every order placed by a specific client (same shape as the dashboard list), newest-first.

* **Method:** `GET`
* **Path:** `/api/orders/client/:client_id`
* **URL Params:** `client_id` (integer, required)
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "order_id": 5,
      "name": "Jane",
      "last_name": "Doe",
      "tlf_num": "+584146996703",
      "total_amount": "99.98",
      "status": "pending",
      "item_count": 2,
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ]
}
```

> **Note:** a `client_id` that exists but has no orders returns the same empty-state shape as §2.2 (`"No orders have been placed by this client."`). A nonexistent `client_id` currently also returns `200` with that message rather than `404` — see ROADMAP.md.

---

## 🧭 3. Status Lifecycle Summary

```
            create                /cancel              /approve
  (none) ───────────► pending ────────► canceled
                          │
                          └────────────────► approved
```

* New orders are always created as `'pending'`.
* Transitions out of `'pending'`: → `'approved'` (§2.5) or → `'canceled'` (§2.4).
* Terminal states: `'approved'` and `'canceled'` — no transitions back to `'pending'`.
* Canceling restores stock; approving does not touch stock.
