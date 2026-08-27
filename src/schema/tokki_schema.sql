-- 1. Create the schema first (outside the transaction)
CREATE SCHEMA IF NOT EXISTS tokki_shop;

BEGIN;

-- 2. CLIENTS (Store buyer contact details for guest checkout)
CREATE TABLE IF NOT EXISTS tokki_shop.clients
(
    client_id serial NOT NULL PRIMARY KEY,
    name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    cedula character varying(12) UNIQUE NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. CLIENTS PHONE NUMBERS (Store normalized phone numbers per client)
CREATE TABLE IF NOT EXISTS tokki_shop.clients_p_number
(
    phone_id serial NOT NULL PRIMARY KEY,
    client_id integer NOT NULL REFERENCES tokki_shop.clients(client_id) ON DELETE CASCADE,
    tlf_num character varying(20) NOT NULL,
    is_primary boolean NOT NULL DEFAULT TRUE,
    last_used_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT clients_p_number_client_phone_unique UNIQUE (client_id, tlf_num)
);

-- 4. USERS (Maps Clerk User Accounts to internal system roles)
CREATE TABLE IF NOT EXISTS tokki_shop.users
(
    clerk_user_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    user_type character varying(50) NOT NULL DEFAULT 'shop_owner',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (clerk_user_id)
);

-- 5. ORDERS (Tracks store orders and optional processing admin)
CREATE TABLE IF NOT EXISTS tokki_shop.orders
(
    order_id serial NOT NULL,
    order_token uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT orders_order_token_unique UNIQUE,
    client_id integer NOT NULL,
    contact_phone character varying(20) NOT NULL,
    delivery_type character varying NOT NULL CONSTRAINT orders_delivery_type_check CHECK (delivery_type IN ('envio_nacional', 'delivery', 'retiro_tienda')),
    total_amount numeric(9, 2) NOT NULL,
    payment_method character varying NOT NULL,
    processed_by character varying(255),
    status character varying(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'canceled')),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id),
    FOREIGN KEY (client_id) REFERENCES tokki_shop.clients(client_id) ON DELETE RESTRICT,
    FOREIGN KEY (processed_by) REFERENCES tokki_shop.users(clerk_user_id) ON DELETE SET NULL
);

-- 6. PRODUCTS (Inventory catalog)
CREATE TABLE IF NOT EXISTS tokki_shop.products
(
    product_id serial NOT NULL,
    product_name character varying NOT NULL,
    product_price numeric(9, 2) NOT NULL,
    product_description text NOT NULL,
    category character varying(100) NOT NULL DEFAULT 'Otros',
    product_image text,
    qty_available integer NOT NULL DEFAULT 0,
    in_stock boolean NOT NULL DEFAULT FALSE,
    is_archived boolean NOT NULL DEFAULT FALSE,
    PRIMARY KEY (product_id)
);

-- 7. ORDER ITEMS (Historic line items for each order)
CREATE TABLE IF NOT EXISTS tokki_shop.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES tokki_shop.orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES tokki_shop.products(product_id) ON DELETE SET NULL,
    product_name VARCHAR(100) NOT NULL,
    product_qty INTEGER NOT NULL,
    product_price DECIMAL(9, 2) NOT NULL
);

COMMIT;

-- 8. Migrations for pre-existing databases (idempotent)
ALTER TABLE tokki_shop.products ADD COLUMN IF NOT EXISTS category character varying(100) NOT NULL DEFAULT 'Otros';
ALTER TABLE tokki_shop.products ADD COLUMN IF NOT EXISTS product_image text;

ALTER TABLE tokki_shop.clients ADD COLUMN IF NOT EXISTS cedula character varying(12);
ALTER TABLE tokki_shop.clients ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tokki_shop.clients ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS tokki_shop.clients_p_number
(
    phone_id serial NOT NULL PRIMARY KEY,
    client_id integer NOT NULL REFERENCES tokki_shop.clients(client_id) ON DELETE CASCADE,
    tlf_num character varying(20) NOT NULL,
    is_primary boolean NOT NULL DEFAULT TRUE,
    last_used_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT clients_p_number_client_phone_unique UNIQUE (client_id, tlf_num)
);

CREATE INDEX IF NOT EXISTS idx_clients_p_number_client_id ON tokki_shop.clients_p_number(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_p_number_tlf_num ON tokki_shop.clients_p_number(tlf_num);

ALTER TABLE tokki_shop.orders ADD COLUMN IF NOT EXISTS contact_phone character varying(20);
ALTER TABLE tokki_shop.orders ADD COLUMN IF NOT EXISTS order_token uuid DEFAULT gen_random_uuid();

-- Normalize legacy delivery_type values in orders before updating rows or applying constraints
UPDATE tokki_shop.orders
SET delivery_type = CASE
    WHEN lower(trim(delivery_type)) IN ('delivery', '') OR delivery_type IS NULL THEN 'delivery'
    WHEN lower(trim(delivery_type)) IN ('envio nacional', 'envio_nacional', 'envío nacional') THEN 'envio_nacional'
    WHEN lower(trim(delivery_type)) IN ('retiro en tienda', 'retiro_tienda', 'pickup') THEN 'retiro_tienda'
    ELSE 'delivery'
END
WHERE delivery_type NOT IN ('envio_nacional', 'delivery', 'retiro_tienda') OR delivery_type IS NULL;

DO $$
BEGIN
    UPDATE tokki_shop.orders SET order_token = gen_random_uuid() WHERE order_token IS NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_token_unique') THEN
        ALTER TABLE tokki_shop.orders ADD CONSTRAINT orders_order_token_unique UNIQUE (order_token);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_order_token ON tokki_shop.orders(order_token);

-- Backfill orders.contact_phone and clients_p_number from clients.tlf_num if clients.tlf_num exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'tokki_shop' AND table_name = 'clients' AND column_name = 'tlf_num'
    ) THEN
        UPDATE tokki_shop.orders o
        SET contact_phone = c.tlf_num
        FROM tokki_shop.clients c
        WHERE o.client_id = c.client_id AND o.contact_phone IS NULL;

        INSERT INTO tokki_shop.clients_p_number (client_id, tlf_num, is_primary, last_used_at, created_at)
        SELECT client_id, tlf_num, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM tokki_shop.clients
        WHERE tlf_num IS NOT NULL
        ON CONFLICT (client_id, tlf_num) DO NOTHING;

        ALTER TABLE tokki_shop.clients DROP COLUMN IF EXISTS tlf_num CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_cedula_unique') THEN
        ALTER TABLE tokki_shop.clients
            ADD CONSTRAINT clients_cedula_unique
            UNIQUE (cedula);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_type_check') THEN
        ALTER TABLE tokki_shop.orders
            ADD CONSTRAINT orders_delivery_type_check
            CHECK (delivery_type IN ('envio_nacional', 'delivery', 'retiro_tienda'))
            NOT VALID;
    END IF;
END $$;