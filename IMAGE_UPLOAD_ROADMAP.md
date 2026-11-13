# Tokki Shop Backend — Image Upload Roadmap

> **Status: SHIPPED AND SUPERSEDED (2026-11-13).** The multi-image product gallery went to production with **v0.10.0**: an ordered gallery of up to 5 images per product with add (`POST /api/products/:product_id/images`), remove-by-URL (`DELETE /api/products/:product_id/images?url=`), and reorder (`PUT /api/products/:product_id/images/order`) endpoints, backed by the `tokki_shop.product_images` table and the migration `src/schema/migrations/2026-11-13-product-gallery.sql`. The single-image pipeline documented below was the stepping stone; the current contracts live in [`API_CONTRACT.md`](API_CONTRACT.md) §1.6–§1.9 (§1.9 covers the legacy cover endpoints kept for compat). This roadmap is preserved as history — do not extend it; new work goes to [`ROADMAP.md`](ROADMAP.md).

Feature backlog for product image uploads. One step per iteration; every step follows **TDD** (red → green → refactor, per `CONTEXT.md`). Statuses: `[ ]` todo, `[x]` done.

---

## Current state

### [x] 0. Scaffolding (commit `2d0be96`)
Done:
- Deps installed: `sharp`, `multer`, `file-type`.
- `src/utils/storage.js`: `saveProductImage` (sharp → WebP q82, max width 1600, no enlargement, UUID keys `products/<uuid>.webp`), `deleteProductImage` (key-pattern guard against path traversal, idempotent), `toPublicImageUrl` (`PUBLIC_BASE_URL` + `/images/<key>`), `resolveUploadDir`.
- `tests/storage.test.js` — 13 unit tests, green.
- Schema: `products.product_image text` + idempotent migration in `tokki_schema.sql`.
- `.env.example` / `.gitignore`: `UPLOAD_DIR=./uploads`, `PUBLIC_BASE_URL`, `uploads/` ignored.

### [x] 1. Static serving
Done: `/images` mounted on `express.static(resolveUploadDir(), { maxAge: '7d', immutable: true })` in `src/app.js`, **before** `clerkMiddleware()` so image requests skip auth overhead. Keys are content-immutable UUIDs, so aggressive caching is safe.

---

## Shipped steps (all done)

### [x] 2. Upload middleware (`src/middleware/upload.js`)
Done: `uploadImage` wraps multer `.single('image')` — memory storage, `MAX_IMAGE_BYTES` = 5 MB, declared-mime allowlist in `fileFilter`, then magic-byte sniff (`fileTypeFromBuffer`) before calling `next()`. All failure paths answer a 400 envelope directly; `translateUploadError` maps multer codes to friendly messages. 15 tests in `tests/upload.test.js`, driven via fake multipart request streams (no HTTP server).

### [x] 3. Endpoint: `POST /api/products/:product_id/image` (admin)
Done: route chain `requireAdmin` → `uploadImage` → `setProductImage` (`src/routes/products.js`, `src/controllers/c_products.js`). Orchestration extracted as dependency-injected `applyProductImage` (exported, unit-tested with fakes): load state → 404 missing/archived (same contract as §1.4) → save file → transactional `UPDATE ... WHERE is_archived = false` (`BEGIN`/`COMMIT`/`ROLLBACK` per DB rules; 0 rows = archived mid-flight → cleanup + 404). Persist throw → best-effort delete of the new key, error forwarded to `next()`. Old key deleted only after successful commit. Responds `200 { success, data: { product_id, product_image_url } }`. 7 tests in `tests/product-image.test.js`; also added `endPool()` teardown to `db.js` so Jest workers exit cleanly.

### [x] 4. Read-side exposure of `product_image_url`
Done: pure mapper `attachImageUrls` in `src/utils/storage.js` — strips the raw `product_image` key from payloads and composes `product_image_url` via `toPublicImageUrl` (null when unset; accepts array or single row, never mutates input). Wired into all four product responses: `getAllProducts`, `getProduct`, `createProduct` (`row`), `updateProductDetails` (`updated_row`) — `product_image` added to each SELECT/RETURNING list. 4 tests appended to `tests/storage.test.js`.

### [x] 5. Lifecycle cleanup
Done: pure helper `cleanupProductImages(keys, removeFile)` in `src/utils/storage.js` — accepts a single key or array, skips falsy entries, dedupes, swallows per-key errors, resolves the count of successful removals. Wired into `deleteProduct`: after the archive COMMIT (and before the 200), the snapshotted `rows[0].product_image` is passed through it with `deleteProductImage`, so archived products leave no stray files under `uploads/products/`; unlink failures never affect the response (log-and-continue). Note for the future restore flow (#11): archived images are gone by design and cannot be restored. 6 tests in `tests/image-cleanup.test.js`.

### [x] 6. Docs & contract sync
Done: `API_CONTRACT.md` gained the §1.6 endpoint section (multipart, field `image`, constraints, 400/404 cases), `product_image_url` added to all four product response examples. `PROJECT_SUMMARY_AND_PLAN.md`: §3.C lists `product_image`, §4 gained the image feature block, §6 test-coverage bullet updated. `README.md`: endpoint table + admin-only split mention the upload route; env vars documented in `CONTEXT.md`. `CONTEXT.md`: new "Images" convention section (keys not URLs, magic-byte sniffing, delete-after-commit discipline) + map/env-table refresh.

### [x] 7. Multi-image gallery (superseding step, shipped 2026-11-13)
Done: gallery table `tokki_shop.product_images` (`image_key` + `sort_order` 0–4, `CHECK` on range, `UNIQUE (product_id, sort_order)` — sort_order 0 is the cover) per `src/schema/migrations/2026-11-13-product-gallery.sql` (STEP 1 + STEP 1b pre-deploy backfill of legacy covers, STEP 2 drops `products.product_image` post-deploy). Endpoints in `src/routes/products.js` / `src/controllers/c_products.js`: `POST /:product_id/images` appends one image (409 at 5 — pre-checked and re-enforced by the DB CHECK + unique constraint against concurrent races), `DELETE /:product_id/images?url=` removes by URL and reindexes (file deleted only after commit), `PUT /:product_id/images/order` reorders from a `{ urls }` body (exact-set match required; first URL = cover). The legacy single-image endpoints stay as compat: `POST /:product_id/image` replaces the cover, `DELETE /:product_id/image` clears it. All product reads now return `product_image_urls` (ordered, max 5) with `product_image_url` kept as the `urls[0] ?? null` alias. Covered by `tests/product-image.test.js` (add / remove-by-URL / replace-cover / clear-cover / reorder orchestrators).

---

**Feature complete — all steps shipped.**

---

## Cross-cutting notes

- **Envelope & codes:** all responses use `{ success, data?, message? }`; uploads are mutations → 401 without session, 403 without `owner`/`tech` role, 400 for bad payloads, 404 for missing/archived products.
- **No SQL interpolation:** the `UPDATE ... SET product_image = $n` stays fully parametrized; key comes from our own UUID generator, but still binds via `$n`.
- **Windows paths:** everything goes through `path.join(resolveUploadDir(), key)` — no string concatenation of separators.
- **Out of scope (later):** S3/object-storage backend behind the same `storage.js` interface. ~~Multiple images per product~~ and ~~an image-deletion endpoint without replacement~~ shipped 2026-11-13 — see step 7 above.
