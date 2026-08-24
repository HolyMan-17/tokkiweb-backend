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

### [ ] 3. Fix `success` string-literal bugs
In `src/controllers/c_products.js`:
- Line ~14 (`getAllProducts` empty case): `{success:"true", ...}` — string `"true"` instead of boolean.
- Line ~33 (`getProduct` 404) and line ~84 (`updateProductDetails` 404): `success:"false"`.

### [ ] 4. Replace wrong status code for archived-product update
`updateProductDetails` returns **401 Unauthorized** when the product is archived; it should be **404** (or 409). Update `API_CONTRACT.md` accordingly once fixed.

---

## P1 — Robustness & Validation

### [ ] 5. Harden input validation
Currently trusts body types; malformed JSON types can reach SQL or produce NaN totals.
- Validate `product_price` is a positive number, `qty_available` is a non-negative integer (products).
- Validate each `items[].product_id` is an integer and `product_qty` is a positive integer before hitting the DB (`createOrder` checks `product_qty <= 0` only *after* locking the row — move it earlier).
- Consider `express-validator` or zod if validation grows.

### [ ] 6. Unknown client/product IDs should 404 consistently
- `GET /api/orders/client/:client_id` returns 200 + "No orders have been placed by this client." for nonexistent clients. Check client existence first and return 404.
- Non-integer `:order_id` / `:product_id` params fall through to Postgres errors → 500. Coerce/reject early with 400/404.

### [ ] 7. Constrain remaining enums at the DB level
~~`delivery_type`~~ done (controller allowlist + `orders_delivery_type_check`). `payment_method` is still free-form — add a CHECK constraint (or lookup table) once business confirms values (`pago_movil`, `bank_transfer`, `cash`, `zelle` per the frontend's `PAYMENT_METHODS`).

### [ ] 8. Transaction hygiene in `createOrder`
The find-or-create-client step commits its own mini-transaction before the main one starts (two transactions per request). Fold it into the single main transaction for atomicity. Also deduplicate the double `BEGIN` risk if code paths evolve.

---

## P2 — Testing

### [ ] 9. Controller/integration tests
Only `tests/validate.test.js` exists (15 passing unit tests). `supertest` is installed but unused.
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

### [ ] 14. Client identification improvements
Guest checkout keys clients on phone only; a repeat buyer who typos their name creates mismatched records. Consider letting authenticated users claim client records, or upsert name on reuse.

### [ ] 15. Ops niceties
- `.env.example` with `DATABASE_URL`, `PORT`, and (future) Clerk keys.
- Structured logging (morgan/debug are installed but unused); remove dead deps (`argon2`, `bcrypt`, `cookie-parser`, `http-errors`, `pug` are express-generator leftovers).
- Migrations strategy: schema file is `CREATE TABLE IF NOT EXISTS` — introduce numbered migrations before the next schema change (e.g., status constraint widening).
