# Tokki Shop Backend API Contract

> **Versioning policy:** versions stay in `0.x.y` (features/behavior changes bump `x`, fixes/docs bump `y`). The first production deployment went live **2026-11-13** at `0.10.0`; a version-policy decision (e.g. moving to `1.x`) is pending owner approval.

**Version:** 0.11.0 *(unreleased — adds `GET /api/analytics/top-products`; `0.10.0` in production since 2026-11-13)*  
**Base URL:** `http://localhost:3000/api`  
**Content-Type:** `application/json`
**Auth:** Clerk session tokens. Admin endpoints require `Authorization: Bearer <token>` (token from the frontend's `useAuth().getToken()`), and the Clerk user must have `publicMetadata.role` of `owner` or `tech`. Public endpoints: product GETs + `POST /api/orders` (guest checkout) + `GET /api/orders/receipt/:order_token` (secure order confirmation receipt). Missing/invalid token on protected routes → `401`; authenticated but not admin → `403`, both in the standard envelope:

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
      "product_image_urls": [
        "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp",
        "http://localhost:3000/images/products/b2d1f3a2-8c44-4f1e-9a7b-5f6e2d3c4b5a.webp"
      ],
      "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
    }
  ]
}
```

> **Gallery semantics (all product reads):** `product_image_urls` is the ordered gallery (max 5); index 0 is the **cover** (portada) shown on cards, grids, and Open Graph previews. `product_image_url` is kept as a convenience alias equal to `product_image_urls[0] ?? null`.

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
    "product_image_urls": [
      "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
    ],
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
    "product_image_urls": [],
    "product_image_url": null
  }
}
```

**Note:** new products start without images (`product_image_urls: []`, `product_image_url: null`); upload them via [§1.6](#16-add-a-gallery-image-max-5).

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
    "product_image_urls": [
      "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
    ],
    "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
  }
}
```

**Note:** this endpoint never changes images — uploads go through [§1.6](#16-add-a-gallery-image-max-5).

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "At least 1 product field needs to be updated."
}
```
Provided fields are type-validated before any DB access: `"product_name must be a non-empty string."`, `"product_description must be a non-empty string."`, `"product_price must be a positive number."`, `"Product quantity must be a whole number."`, `"Product quantity can't be negative."`, `"A valid product category is required."`. Invalid values are rejected — never silently ignored.

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
* **Path:** `/api/products/:product_id` *(admin — see [Auth](#-general-response-format))*
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

### 1.6 Add a Gallery Image (max 5)

Appends one image to the product's gallery. The image is normalized to WebP (max width 1600px, quality 82), written under `UPLOAD_DIR` with a content-immutable UUID key (`products/<uuid>.webp`), and the **key only** is persisted in `product_images` inside a transaction. Uploads are appended in order; the first image ever added becomes the **cover** (index 0).

* **Method:** `POST`
* **Path:** `/api/products/:product_id/images` *(admin — see [Auth](#-general-response-format))*
* **URL Params:** `product_id` (integer, required)
* **Headers:** `Content-Type: multipart/form-data`
* **Form field:** `image` (single file, required)
* **Rate limit:** 30 uploads / 15 min / IP

**Constraints (enforced by `uploadImage` middleware):**
* Declared type must be `image/jpeg`, `image/png`, or `image/webp` — anything else is rejected before parsing completes.
* Bytes are verified via magic-byte sniffing; spoofed uploads (e.g. an `.jpg` containing text) are rejected.
* Max size 5 MB per file.

**Behavior notes:**
* The uploaded file never touches disk unvalidated (memory storage).
* If the DB insert fails after saving, the just-saved file is removed (no orphans).
* A `409` is returned when the product already has 5 images (pre-checked and re-enforced by a DB CHECK + unique constraint against concurrent-upload races).
* Archiving a product (§1.5) deletes its gallery rows and all stored files after commit.
* Images are served publicly at `/images/<key>` (7-day immutable cache); returned URLs are absolute when `PUBLIC_BASE_URL` is set, relative otherwise.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "product_id": 2,
    "product_image_urls": [
      "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp",
      "http://localhost:3000/images/products/b2d1f3a2-8c44-4f1e-9a7b-5f6e2d3c4b5a.webp"
    ],
    "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
  }
}
```

#### Response `400 Bad Request`
Any of: no file part (`"No image file was uploaded."`); file under an unexpected field name (`"Unexpected upload field: <field>. Use the \"image\" field."`); size over 5 MB (`"Image exceeds the 5 MB size limit."`); disallowed declared type (`"Unsupported image type. Allowed: jpeg, png, webp."`); bytes that are not a supported image (`"File content is not a supported image (jpeg, png, webp)."`).

Every `400` above is logged server-side (`[upload] rejected: { reason, code?, field?, mimetype?, filename?, size?, message }`) for diagnosing client-side upload failures.

#### Response `404 Not Found`
Same as §1.4 — `"Product was not found."` (missing) or `"Product is archived."`.

#### Response `409 Conflict`
```json
{
  "success": false,
  "message": "This product already has the maximum of 5 images."
}
```

---

### 1.7 Remove a Gallery Image

Removes one image from the gallery by URL and reindexes the remaining rows so no sort gaps remain. If the cover is removed, the next image becomes the cover. The stored file is deleted **only after the commit succeeds**.

* **Method:** `DELETE`
* **Path:** `/api/products/:product_id/images` *(admin)*
* **URL Params:** `product_id` (integer, required)
* **Query Params:** `url` (string, required) — the full public or relative URL of the image to remove, exactly as returned in `product_image_urls` (e.g. `?url=/images/products/7c9e6679-....webp`). Only URLs matching the `products/<uuid>.webp` namespace are accepted.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "product_id": 2,
    "product_image_urls": [],
    "product_image_url": null
  }
}
```

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "Unknown image URL."
}
```

#### Response `404 Not Found`
`"Product was not found."` / `"Product is archived."` (§1.4 contract) or `"Image was not found."` when the URL does not belong to this product's gallery.

---

### 1.8 Reorder Gallery Images / Set Cover

Replaces the gallery order with the given URL list. To make an image the cover, put it first.

* **Method:** `PUT`
* **Path:** `/api/products/:product_id/images/order` *(admin)*
* **URL Params:** `product_id` (integer, required)
* **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "urls": [
    "http://localhost:3000/images/products/b2d1f3a2-8c44-4f1e-9a7b-5f6e2d3c4b5a.webp",
    "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
  ]
}
```

**Validation:** the list must contain **every** gallery image exactly once (same count, no duplicates, no unknown URLs) — otherwise `400`.

#### Response `200 OK`
Same shape as §1.6/§1.7 (`data.product_image_urls` reflects the new order).

#### Response `400 Bad Request`
`"Unknown image URL."` (a URL outside the `products/<uuid>.webp` namespace) or `"Invalid image order."` (set mismatch).

#### Response `404 Not Found`
Same as §1.4.

---

### 1.9 Legacy Single-Image Endpoints (compat)

Kept for already-deployed frontends; the current SPA should prefer §1.6–§1.8.

* **`POST /api/products/:product_id/image`** — multipart `image` field, same middleware constraints as §1.6. Semantics: **replace the cover** — the new file takes index 0 (inserted if the gallery is empty, overwriting the cover key otherwise); other gallery images keep their positions. The replaced cover file is deleted only after the commit succeeds. Rate-limited like §1.6.
* **`DELETE /api/products/:product_id/image`** — **remove the cover** (and delete its file after commit). Idempotent no-op when the gallery is empty. Reindexes the remaining images.

Both respond with the same `data` shape as §1.6–§1.8 (`product_id`, `product_image_urls`, `product_image_url`). Errors: `400` (multipart/type violations, as §1.6) and `404` (`"Product was not found."` / `"Product is archived."`). The legacy `POST` has **no 409 path** — cover replacement is an upsert (`ON CONFLICT DO UPDATE`) and is not subject to the 5-image cap check.

---

## 🛒 2. Orders API (`/api/orders`)

### 2.1 Create Order (Checkout)

Processes a full checkout: finds/creates the client keyed on cédula, registers/updates the phone number in `clients_p_number`, validates & deducts product stock, snapshots the contact phone into the order header, and inserts line items inside a **single consolidated transaction** (`BEGIN` -> `COMMIT` / `ROLLBACK`).

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

**Cedula rules (required):** `client_info.cedula` is **REQUIRED** (Venezuelan ID). Lenient input (`'v12345678'`, `'V 12345678'`, missing hyphen, stray spaces) is normalized to the canonical combined form `"V-12345678"`.
* Clients are keyed primarily on `cedula` (`clients.cedula` is `UNIQUE NOT NULL`).
* Missing or empty `cedula` → `400` `"All client info fields are required."`
* Malformed or invalid format → `400` `"Invalid cedula format."`
* When an order is placed, the backend checks for an existing client by `cedula`. If found, that client record is reused; otherwise a new client row is created.

**Phone numbers & `clients_p_number`:**
* `client_info.tlf_num` is required and normalized to E.164 format (`+584146996703`).
* Multiple phone numbers can be associated with a single client cédula over time. Every phone used during checkout is upserted into the `tokki_shop.clients_p_number` table (updating `last_used_at` on reuse).
* The specific phone number provided for this checkout is snapshotted directly into `orders.contact_phone` to ensure order-level contact history remains immutable.
* Local form: `country_code` (`+58`) + `tlf_num` (`041469996703`) -> normalized & stored as E.164 (`+584146996703`).
* International form: `tlf_num` provided as a full E.164 number (`+584146996703`), in which case `country_code` may be omitted.
* Rejects: empty/whitespace, embedded formatting chars, wrong length, malformed or missing `country_code` when `tlf_num` is not international, invalid E.164 (8-15 digits after `+`, first digit 1-9).

**Payment methods:** `payment_method` currently accepts any non-empty string server-side (no DB constraint yet — see ROADMAP #7), but the frontend only ever sends the slugs from its `PAYMENT_METHODS` constant: `pago_movil`, `binance`, `zelle`, `paypal`, `cash`. Use those in integrations.

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "order_id": 5,
    "order_token": "550e8400-e29b-41d4-a716-446655440000",
    "delivery_type": "envio_nacional",
    "payment_method": "pago_movil",
    "total_amount": "99.98",
    "contact_phone": "+584146996703",
    "items": [
      { "id": 1, "name": "Tokki Hoodie", "ordered_qty": 2, "price": "49.99" }
    ]
  },
  "message": "Order has been successfully created."
}
```
**Note:** every new order is created with `status: 'pending'` by the database default.

#### Response `400 Bad Request`
Any of: missing `client_info`/`delivery_type`/`payment_method`/`items` (`"All fields are required."`); missing client `name`/`last_name`/`tlf_num`/`cedula` (`"All client info fields are required."`); malformed cédula (`"Invalid cedula format."`); invalid phone number (`"Phone number must be a valid international format."`); `delivery_type` not one of the allowed slugs (`"delivery_type must be one of: envio_nacional, delivery, retiro_tienda."`); empty/malformed `items` (`"Each item needs a valid product_id and a positive whole product_qty."` — checked before any stock locking); insufficient stock.
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

Returns all orders with the buyer's info, contact phone snapshot, and a per-order distinct line-item count.

* **Method:** `GET`
* **Path:** `/api/orders` *(admin — see [Auth](#-general-response-format))*
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
      "delivery_type": "envio_nacional",
      "payment_method": "pago_movil",
      "total_amount": "99.98",
      "status": "pending",
      "item_count": 2,
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ]
}
```

> **Note on `tlf_num`:** `tlf_num` in the order list reflects the order's specific `contact_phone` snapshot (the phone provided at checkout for that specific order).

#### Response `200 OK` (no orders yet)
```json
{
  "success": true,
  "message": "No orders have been placed."
}
```

---

### 2.3 Get Single Order (Full Details — Admin)

Returns the order header, client info with order contact phone snapshot, and the full list of line items (name, quantity, unit price, and computed line total).

* **Method:** `GET`
* **Path:** `/api/orders/:order_id` *(admin — see [Auth](#-general-response-format))*
* **URL Params:** `order_id` (integer, required)
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "order_id": 3,
    "order_token": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "delivery_type": "delivery",
    "payment_method": "pago_movil",
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

> **Note on `client.tlf_num`:** `client.tlf_num` reflects the order's `contact_phone` snapshot captured at purchase time.

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
      "delivery_type": "envio_nacional",
      "payment_method": "pago_movil",
      "total_amount": "99.98",
      "status": "pending",
      "item_count": 2,
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ]
}
```

> **Note on `tlf_num`:** `tlf_num` reflects the order's specific `contact_phone` snapshot.
>
> **Note:** a `client_id` that exists but has no orders returns the empty-state message with 200. A nonexistent `client_id` returns **404** (`"Client doesn't exist."`).

---

### 2.7 Get Order Confirmation Receipt (Public Guest Access)

Returns the public order confirmation receipt for a given unguessable `order_token` (UUIDv4 generated at checkout). This allows guest customers to view and refresh their order confirmation screen without exposing sequential order IDs or requiring admin authentication.

* **Method:** `GET`
* **Path:** `/api/orders/receipt/:order_token` *(public)*
* **URL Params:** `order_token` (UUID string, required)
* **Headers:** `Accept: application/json`
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "order_id": 5,
    "order_token": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "delivery_type": "envio_nacional",
    "payment_method": "pago_movil",
    "client": {
      "name": "Jane",
      "last_name": "Doe",
      "tlf_num": "+584146996703",
      "cedula": "V-12345678"
    },
    "total_amount": "99.98",
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

#### Response `400 Bad Request`
```json
{
  "success": false,
  "message": "Invalid order token format."
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

## 📊 3. Analytics API (`/api/analytics`)

### 3.1 Top Products Ranking

Aggregates real units sold and historical revenue across **approved** orders (`orders.status = 'approved'`) for active catalog products (`products.is_archived = false`), keeping active out-of-stock bestsellers visible for restock visibility.

* **Method:** `GET`
* **Path:** `/api/analytics/top-products` *(admin — see [Auth](#-general-response-format))*
* **Query Params (all optional):**
  * `sort`: `units` *(default)* | `revenue` — rank by units sold or total historical revenue (`SUM(oi.product_qty * oi.product_price)`).
  * `period`: `all` *(default)* | `7d` | `30d` | `90d` — rolling lookback window over `orders.created_at`.
  * `limit`: whole number `1`–`20` *(default `5`)*.
* **Headers:** `Authorization: Bearer <token>`
* **Request Body:** None

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "product_id": 12,
      "product_name": "Bálsamo Labial Fresa",
      "category": "Maquillaje",
      "product_price": "5.00",
      "qty_available": 2,
      "in_stock": true,
      "product_image_urls": [
        "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
      ],
      "product_image_url": "http://localhost:3000/images/products/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp",
      "units_sold": 24,
      "orders_count": 14,
      "total_revenue": "120.00"
    }
  ]
}
```

When no approved orders match the selected period, returns `{ "success": true, "data": [] }`.

#### Response `400 Bad Request`
* `{ "success": false, "message": "sort must be one of: units, revenue." }`
* `{ "success": false, "message": "period must be one of: all, 7d, 30d, 90d." }`
* `{ "success": false, "message": "limit must be a whole number between 1 and 20." }`

#### Response `401 Unauthorized` / `403 Forbidden`
Standard Clerk admin auth errors when missing/invalid token (`401`) or missing `owner`/`tech` role (`403`).

---

## 🧭 4. Status Lifecycle Summary

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
