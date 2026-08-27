# Tokki Shop Backend — Roadmap

Prioritized backlog derived from a full codebase review (Aug 2026). Each item lists the files involved. Statuses: `[ ]` todo, `[x]` done.

---

## P0 — Correctness & Safety (do first)

### [x] 1. Wire Clerk authentication
Done: `clerkMiddleware()` in `src/app.js`; `requireAdmin` middleware (`src/middleware/auth.js`) checks `publicMetadata.role` ∈ {`owner`,`tech`} against Clerk Backend API and stashes `req.adminUser`; products POST/PATCH/DELETE and all order endpoints except checkout are protected; cancel/approve upsert the acting admin into `tokki_shop.users` and populate `orders.processed_by`. Follow-ups:
- Optional: sync users via Clerk webhooks instead of lazy upsert.
- Optional: cache Clerk user lookups to trim one Backend API call per admin request.
- Frontend: pass `getToken` from `useAuth()` through `api/client.ts` on admin calls.

### [x] 2. Global JSON error handler
Controllers call `next(err)` on DB failures; `src/app.js` now defines a 4-arg error middleware that returns `{ success: false, message }` and maps PG error codes (`22P02` → 400, `23505` → 409, `23503` → 400). Remaining follow-ups:
- Map more codes where relevant (`23502` not_null, `08P01`/connection errors).
- Consider hiding stack logs from stdout in production (structured logging, ROADMAP P3 #15).

### [x] 3. Fix `success` string-literal bugs
Done: every response in `src/controllers/c_products.js` now uses boolean `success: true/false`.

### [x] 4. Replace wrong status code for archived-product update
Done: `updateProductDetails` returns **404** (`"Product is archived."`) instead of 401; `API_CONTRACT.md` §1.4 documents it.

---

## P1 — Robustness & Validation

### [x] 5. Harden input validation
Done via `src/utils/productValidation.js` (unit-tested, TDD): `validateProductCreate`/`validateProductPatch` enforce `product_price` positive finite number, `qty_available` non-negative **integer**, non-empty string fields, category rules; PATCH rejects invalid values instead of silently ignoring them. `validateOrderItems` checks each item's `product_id`/`product_qty` are positive integers in `createOrder` **before** any row locking (previously `product_qty <= 0` was only caught after taking the lock).

### [x] 6. Unknown client/product IDs should 404 consistently
Done via `parseIdParam` (`src/utils/params.js`, unit-tested): every `:product_id`/`:order_id`/`:client_id` handler rejects non-positive-integer params up front with 400 `"Invalid ID format."` instead of letting Postgres throw `22P02`. `GET /api/orders/client/:client_id` now checks client existence first → `404` `"Client doesn't exist."` (previously returned 200 with the empty-state message).

### [ ] 7. Constrain remaining enums at the DB level
~~`delivery_type`~~ done (controller allowlist + `orders_delivery_type_check`). `payment_method` is still free-form — add a CHECK constraint (or lookup table) once business confirms values (`pago_movil`, `bank_transfer`, `cash`, `zelle` per the frontend's `PAYMENT_METHODS`).

### [x] 8. Transaction hygiene in `createOrder`
Done: Folded client lookup/creation and phone registration into the single consolidated transaction alongside product stock locking and order/items insertion for complete atomicity and eliminating double-`BEGIN` overhead.

---

## P2 — Testing

### [ ] 9. Controller/integration tests
116 unit tests across 10 suites exist (validation ×2, storage, upload, product-image orchestration, image-cleanup, params, client-sync, orders validation, order-receipt) — but they exercise utils/middleware/pure orchestrators only. No test spins up HTTP routes against a real DB.
- Spin up a test database (separate `DATABASE_URL`), apply `tokki_schema.sql`, seed fixtures.
- Cover: products CRUD incl. archived behavior; order creation happy path; oversell rejection under stock contention; cancel restores stock exactly once; approve/cancel guards; 404s.
- Note: `jest.config.js` uses `node --experimental-vm-modules`; keep ESM-compatible patterns.

### [ ] 10. CI
Add a GitHub Actions workflow: install via pnpm, run lint/test against a Postgres service container.

---

## P3 — Features

### [ ] 11. Admin product archive listing / restore
Archived products are invisible to every endpoint. Add `GET /api/products?archived=true` (admin) and/or `POST /api/products/:id/restore`.

### [ ] 12. Pagination & filtering
`GET /api/orders` and `GET /api/products` return unbounded result sets. Add `?limit/&offset` (or keyset pagination for orders) and status filters for the dashboard.

### [ ] 13. Order fulfillment extras
- `delivered` / `shipped` statuses (requires widening the CHECK constraint).
- Order notes, delivery address fields.
- WhatsApp deep-link helper for owner follow-up (phone numbers are already stored E.164 for this purpose).

### [x] 14. Client identification improvements
Done: Implemented cédula-centric client model (`clients.cedula` UNIQUE NOT NULL) as the primary customer identifier across the store. Multiple contact numbers per client are normalized and tracked in `clients_p_number` with composite unique constraint `(client_id, tlf_num)` and `last_used_at` timestamps, while each order preserves a direct snapshot in `orders.contact_phone`.

### [x] 15. Ops niceties
- ~~`.env.example`~~ done (includes `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `UPLOAD_DIR`, `PUBLIC_BASE_URL`).
- ~~Dead deps~~ removed Aug 2026 (`argon2`, `bcrypt`, `cookie-parser`, `debug`, `http-errors`, `morgan`, `pug`); stray root `test` file deleted.
- Structured logging still pending (morgan was removed unused — wire `pino`/`winston` or keep minimal).
- Migrations strategy: schema file is `CREATE TABLE IF NOT EXISTS` — introduce numbered migrations before the next schema change (e.g., status constraint widening).

---

## P4 — Image pipeline follow-ups

The core image feature ships (upload/replace/remove, WebP normalization, immutable static serving). Deferred items:

### [ ] 16. nginx in front of Node (VPS)
Serve `/images/` directly from disk (sendfile, no Node round-trip) and proxy `/api` → Node. Also enables gzip/brotli for JSON.

### [ ] 17. Uploads-dir backup cron (VPS)
`UPLOAD_DIR` lives outside the repo — add a nightly `restic`/`rsync` of that directory to any remote target. Images are re-uploadable, so weekly is acceptable; nightly is cheap.

### [ ] 18. Storage-provider swap path
DB stores keys only and responses compose URLs from `PUBLIC_BASE_URL`, so moving to Cloudflare R2 later means rewriting `src/utils/storage.js` (~50 lines) + an rsync of existing files + env change. No DB migration needed.

### [ ] 19. Client-side pre-compression (frontend)
Backend already normalizes to WebP ≤1600px server-side; optional browser-side compression (`browser-image-compression`) would trim upload bandwidth on slow connections.
