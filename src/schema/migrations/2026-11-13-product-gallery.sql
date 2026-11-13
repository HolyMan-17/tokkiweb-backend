-- ============================================================
-- Migration: product gallery (up to 5 images per product)
--
-- Run STEP 1 (+ STEP 1b) any time BEFORE deploying the new backend.
-- Run STEP 2 immediately AFTER the new backend is live.
--
-- Both steps are idempotent and safe to re-run.
--
-- Deploy runbook:
--   1. psql $DATABASE_URL -f src/schema/migrations/2026-11-13-product-gallery.sql  -- only up to STEP 1b
--   2. Deploy the new backend.
--   3. Re-run STEP 1b (picks up any image the old backend uploaded during the
--      deploy window), then run STEP 2.
--
-- WARNING: STEP 2 while the old backend is still live breaks every product
-- endpoint (its SELECTs name products.product_image explicitly).
-- ============================================================

-- STEP 1 — create gallery table (old backend ignores it; zero downtime)
BEGIN;

CREATE TABLE IF NOT EXISTS tokki_shop.product_images
(
    image_id serial NOT NULL PRIMARY KEY,
    product_id integer NOT NULL REFERENCES tokki_shop.products(product_id) ON DELETE CASCADE,
    image_key character varying(255) NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_images_sort_range_check CHECK (sort_order BETWEEN 0 AND 4),
    CONSTRAINT product_images_product_sort_unique UNIQUE (product_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON tokki_shop.product_images(product_id);

COMMIT;

-- STEP 1b — backfill covers into the gallery (sort_order 0 = portada).
-- Archived products are excluded: their image files were already deleted,
-- so their keys would 404. The NOT EXISTS guard makes re-runs safe.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'tokki_shop' AND table_name = 'products' AND column_name = 'product_image'
    ) THEN
        INSERT INTO tokki_shop.product_images (product_id, image_key, sort_order, created_at)
        SELECT p.product_id, p.product_image, 0, CURRENT_TIMESTAMP
        FROM tokki_shop.products p
        WHERE p.product_image IS NOT NULL
          AND p.is_archived = false
          AND NOT EXISTS (
              SELECT 1 FROM tokki_shop.product_images pi WHERE pi.product_id = p.product_id
          );
    END IF;
END $$;

-- STEP 2 — drop the legacy column.
-- ONLY after the new backend is deployed and serving traffic.
ALTER TABLE tokki_shop.products DROP COLUMN IF EXISTS product_image;
