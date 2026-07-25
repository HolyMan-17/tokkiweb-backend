# Tokki Shop Backend API Contract

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000/api`  
**Content-Type:** `application/json`

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
