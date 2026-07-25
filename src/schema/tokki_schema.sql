-- 1. Create the schema first (outside the transaction)
CREATE SCHEMA IF NOT EXISTS tokki_shop;

BEGIN;

-- 2. CLIENTS
CREATE TABLE IF NOT EXISTS tokki_shop.clients
(
    client_id serial NOT NULL,
    name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    tlf_num character varying(20) UNIQUE NOT NULL,
    PRIMARY KEY (client_id)
);

-- 3. USERS 
CREATE TABLE IF NOT EXISTS tokki_shop.users
(
    user_id serial NOT NULL,
    client_id integer,
    email text NOT NULL,
    password text NOT NULL,
    user_type character varying NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp with time zone,
    PRIMARY KEY (user_id),
    UNIQUE (client_id),
    FOREIGN KEY (client_id) REFERENCES tokki_shop.clients(client_id) ON DELETE SET NULL
);

-- 4. ORDERS
CREATE TABLE IF NOT EXISTS tokki_shop.orders
(
    order_id serial NOT NULL,
    client_id integer NOT NULL,
    delivery_type character varying NOT NULL,
    total_amount numeric(9, 2) NOT NULL,
    payment_method character varying NOT NULL,
    PRIMARY KEY (order_id),
    FOREIGN KEY (client_id) REFERENCES tokki_shop.clients(client_id) ON DELETE RESTRICT
);

-- 5. PRODUCTS
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

-- 6. ORDER ITEMS
CREATE TABLE IF NOT EXISTS tokki_shop.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES tokki_shop.orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES tokki_shop.products(product_id) ON DELETE SET NULL,
    product_name VARCHAR(100) NOT NULL,
    product_qty INTEGER NOT NULL,
    product_price DECIMAL(9, 2) NOT NULL
);

COMMIT;