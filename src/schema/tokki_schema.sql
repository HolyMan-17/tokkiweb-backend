-- 1. Create the schema first (outside the transaction)
CREATE SCHEMA IF NOT EXISTS tokki_shop;

BEGIN;

-- 2. CLIENTS (Store buyer contact details for guest checkout)
CREATE TABLE IF NOT EXISTS tokki_shop.clients
(
    client_id serial NOT NULL,
    name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    tlf_num character varying(20) UNIQUE NOT NULL,
    PRIMARY KEY (client_id)
);

-- 3. USERS (Maps Clerk User Accounts to internal system roles)
CREATE TABLE IF NOT EXISTS tokki_shop.users
(
    clerk_user_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    user_type character varying(50) NOT NULL DEFAULT 'shop_owner',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (clerk_user_id)
);

-- 4. ORDERS (Tracks store orders and optional processing admin)
CREATE TABLE IF NOT EXISTS tokki_shop.orders
(
    order_id serial NOT NULL,
    client_id integer NOT NULL,
    delivery_type character varying NOT NULL,
    total_amount numeric(9, 2) NOT NULL,
    payment_method character varying NOT NULL,
    processed_by character varying(255),
    status character varying(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'canceled')),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id),
    FOREIGN KEY (client_id) REFERENCES tokki_shop.clients(client_id) ON DELETE RESTRICT,
    FOREIGN KEY (processed_by) REFERENCES tokki_shop.users(clerk_user_id) ON DELETE SET NULL
);

-- 5. PRODUCTS (Inventory catalog)
CREATE TABLE IF NOT EXISTS tokki_shop.products
(
    product_id serial NOT NULL,
    product_name character varying NOT NULL,
    product_price numeric(9, 2) NOT NULL,
    product_description text NOT NULL,
    qty_available integer NOT NULL DEFAULT 0,
    in_stock boolean NOT NULL DEFAULT FALSE,
    is_archived boolean NOT NULL DEFAULT FALSE,
    PRIMARY KEY (product_id)
);

-- 6. ORDER ITEMS (Historic line items for each order)
CREATE TABLE IF NOT EXISTS tokki_shop.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES tokki_shop.orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES tokki_shop.products(product_id) ON DELETE SET NULL,
    product_name VARCHAR(100) NOT NULL,
    product_qty INTEGER NOT NULL,
    product_price DECIMAL(9, 2) NOT NULL
);

COMMIT;