# Tokki Shop Backend API Contract

> **Versioning policy:** the backend has not shipped yet — versions stay in `0.x.y`. Features/behavior changes bump `x`, fixes/docs bump `y`. `1.0.0` is reserved for the first production deployment.

**Version:** 0.9.1 *(pre-deploy — see versioning policy below)*  
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
* `400 Bad Request`: Validation failure or missing required body fields. Malformed integer path params (`:product_id`, `:order_id`, `:client_id`) are rejected up front with `"Invalid ID format."`.
* `404 Not Found`: Resource ID does not exist in database or is archived. A nonexistent `client_id` on `/api/orders/client/:id` also returns 404 (`"Client doesn't exist."`).
* `500 Internal Server Error`: Unhandled server/database error.

---

## 📦 1. Products API (`/api/products`)

### 1.1 List All Active Products
Retrieves all non-archived products available in the store catalog.

* **Method:** `GET`
* **Path:** `/api/products`
* **Query Params (optional):** `category` — exact, case-sensitive match against the product's `category` display name (e.g. `?category=Maquillaje`). Values mirror the frontend's `CATEGORIES` constant.
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
      "category": "Ropa",
      "qty_available": 25,
      "in_stock": true,
      "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
    }
  ]
}
```

#### Response `200 OK` (empty catalog)
```json
{
  "success": true,
  "message": "There's no registered products."
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
    "category": "Ropa",
    "qty_available": 25,
    "in_stock": true,
    "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
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
* **Path:** `/api/products` *(admin — see [Auth](#-general-response-format))*
* **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`

#### Request Body
```json
{
  "product_name": "Tokki T-Shirt",
  "product_price": 24.99,
  "product_description": "100% organic cotton graphic tee",
  "category": "Ropa",
  "qty_available": 50
}
```

**Category rules:** required, non-empty string, max 100 chars. Stored as the display name exactly as sent (frontend matches `p.category === CATEGORIES[i].name`), so send values from the frontend's `CATEGORIES` list. Defaults to `'Otros'` at the DB level only for rows created outside this endpoint.

#### Response `201 Created`
```json
{
  "success": true,
  "row": {
    "product_id": 2,
    "product_name": "Tokki T-Shirt",
    "product_price": "24.99",
    "product_description": "100% organic cotton graphic tee",
    "category": "Ropa",
    "qty_available": 50,
    "in_stock": true,
    "is_archived": false,
    "product_image_url": null
  }
}
```

**Note:** new products start without an image (`product_image_url: null`); upload one via [§1.6](#16-upload--replace-product-image).

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "All product fields are required!"
}
```
Other messages: `"A valid product category is required."` (missing/empty/over-100-chars category), `"Product quantity must be a whole number."` (non-integer `qty_available`). Field types are enforced strictly: `product_price` must be a positive finite number, `qty_available` a non-negative integer, names/descriptions non-empty strings.

---

### 1.4 Update Product Details (Partial Update)
Updates specific details of an existing product. If `qty_available` is modified, `in_stock` is recalculated automatically.

* **Method:** `PATCH`
* **Path:** `/api/products/:product_id` *(admin)*
* **URL Params:** `product_id` (integer, required)
* **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`

#### Request Body (All fields optional, at least one required)
```json
{
  "product_price": 19.99,
  "category": "Ropa",
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
    "category": "Ropa",
    "qty_available": 10,
    "in_stock": true,
    "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
  }
}
```

**Note:** this endpoint never changes the image — uploads go through [§1.6](#16-upload--replace-product-image).
```

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "At least 1 product field needs to be updated."
}
```
Provided fields are type-validated before any DB access: `"product_price must be a positive number."`, `"Product quantity must be a whole number."`, `"Product quantity can't be negative."`, `"A valid product category is required."`. Invalid values are rejected — never silently ignored.

#### Response `404 Not Found`
Product does not exist:
```json
{
  "success": false,
  "message": "Product was not found."
}
```
Product exists but is archived (same status, distinct message):
```json
{
  "success": false,
  "message": "Product is archived."
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

### 1.6 Upload / Replace Product Image
Stores a product image: normalizes it to WebP (max width 1600px, quality 82), writes the file under `UPLOAD_DIR` with a content-immutable UUID key (`products/<uuid>.webp`), and persists **the key only** in `products.product_image` inside a transaction. Re-uploading generates a new key and deletes the replaced file only after the commit succeeds.

* **Method:** `POST`
* **Path:** `/api/products/:product_id/image` *(admin — see [Auth](#-general-response-format))*
* **URL Params:** `product_id` (integer, required)
* **Headers:** `Content-Type: multipart/form-data`
* **Form field:** `image` (single file, required)

**Constraints (enforced by `uploadImage` middleware):**
* Declared type must be `image/jpeg`, `image/png`, or `image/webp` — anything else is rejected before parsing completes.
* Bytes are verified via magic-byte sniffing; spoofed uploads (e.g. an `.jpg` containing text) are rejected.
* Max size 5 MB.

**Behavior notes:**
* The uploaded file never touches disk unvalidated (memory storage).
* If the DB update fails after saving, the just-saved file is removed (no orphans).
* Archiving a product (§1.5) deletes its stored image file after commit; archived/missing products reject uploads with the same `404` contract as §1.4.
* Images are served publicly at `/images/<key>` (7-day immutable cache); returned URLs are absolute when `PUBLIC_BASE_URL` is set, relative otherwise.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "product_id": 2,
    "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
  }
}
```

#### Response `400 Bad Request`
Any of: no file part (`"No image file was uploaded."`); file under an unexpected field name (`"Unexpected upload field: <field>. Use the \"image\" field."`); size over 5 MB (`"Image exceeds the 5 MB size limit."`); disallowed declared type (`"Unsupported image type. Allowed: jpeg, png, webp."`); bytes that are not a supported image (`"File content is not a supported image (jpeg, png, webp)."`).

#### Response `404 Not Found`
Same as §1.4 — `"Product was not found."` (missing) or `"Product is archived."`.

---

### 1.7 Remove Product Image

Clears a product's image: nulls `products.product_image` inside a transaction, then deletes the stored file **only after the commit succeeds**.

* **Method:** `DELETE`
* **Path:** `/api/products/:product_id/image` *(admin — see [Auth](#-general-response-format))*
* **URL Params:** `product_id` (integer, required)
* **Request Body:** None

**Behavior:**
1. Missing or archived products reject with the same `404` contract as §1.4/§1.6.
2. **Idempotent no-op:** if the product simply has no image, returns success anyway (`product_image_url: null`) — safe to call repeatedly.
3. If two admins race, the file deletion is best-effort; a missing file is not an error.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "product_id": 2,
    "product_image_url": null
  }
}
```

#### Response `404 Not Found`
Same as §1.6 — `"Product was not found."` or `"Product is archived."`.

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

**Delivery types (enforced):** `delivery_type` must be exactly one of the allowed slugs — `envio_nacional`, `delivery`, `retiro_tienda` — validated by the controller and by a DB CHECK constraint. Display labels ("Envío Nacional", "Delivery", "Retiro en Tienda") live in the frontend's `DELIVERY_TYPES` constant; the API only ever stores/returns slugs.

**Cedula rules:** `client_info.cedula` is optional (Venezuelan ID). Lenient input (`'v12345678'`, missing hyphen, stray spaces) is normalized to the canonical combined form `"V-12345678"` before storing; absent/null/empty stores `NULL` (legacy rows keep `NULL` too). Invalid values → `400` `"Invalid cedula format."`; a cedula already owned by another client → `409` `"Resource already exists."`. Stored on the `clients` row when the client is created (UNIQUE constraint); existing clients are never backfilled.

**Payment methods:** `payment_method` currently accepts any non-empty string server-side (no DB constraint yet — see ROADMAP #7), but the frontend only ever sends the slugs from its `PAYMENT_METHODS` constant: `pago_movil`, `binance`, `zelle`, `paypal`, `cash`. Use those in integrations.

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
    "delivery_type": "envio_nacional",
    "payment_method": "pago_movil",
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
Any of: missing `client_info`/`delivery_type`/`payment_method`/`items`; missing client name/last_name/tlf_num; invalid phone number; `delivery_type` not one of the allowed slugs (`"delivery_type must be one of: envio_nacional, delivery, retiro_tienda."`); empty/malformed `items` (`"Each item needs a valid product_id and a positive whole product_qty."` — checked before any stock locking); insufficient stock.
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
      "cedula": "V-12345678",
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
      "tlf_num": "+584146996703",
      "cedula": "V-12345678"
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
      "cedula": "V-12345678",
      "total_amount": "99.98",
      "status": "pending",
      "item_count": 2,
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ]
}
```

> **Note:** a `client_id` that exists but has no orders returns the empty-state message with 200. A nonexistent `client_id` returns **404** (`"Client doesn't exist."`).

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
