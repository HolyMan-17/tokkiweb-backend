# CONTEXT.md — Project Context for Agents & Contributors

Read this before changing code. It captures the non-obvious decisions and patterns that aren't visible from any single file.

**Repo boundaries:** You may only check or add context from another repo (e.g. `tokkiweb-frontend`) if the user asks you to; otherwise focus exclusively on the present directory.

**Related docs:** [`README.md`](README.md) (setup) · [`API_CONTRACT.md`](API_CONTRACT.md) (endpoint contracts) · [`PROJECT_SUMMARY_AND_PLAN.md`](PROJECT_SUMMARY_AND_PLAN.md) (architecture & schema) · [`ROADMAP.md`](ROADMAP.md) (backlog)

---

## What this is

Backend API for the **Tokki Shop** storefront: a product catalog with guest checkout, stock management, product images, and an order-approval workflow for shop owners. The React frontend lives in a separate repo. Admin auth is Clerk and **fully wired** (`requireAdmin` guards everything except catalog GETs and guest checkout).

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required — server refuses to start without a reachable DB) |
| `PORT` | HTTP port (default 3000) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_...`) — required for `clerkMiddleware()`; admin endpoints reject everything without it |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...`) — also required by `clerkMiddleware()` server-side (SDK builds auth context from it); safe to expose, same value the frontend holds |
| `FRONTEND_ORIGINS` | Comma-separated CORS allowlist (default `http://localhost:5173`) |
| `UPLOAD_DIR` | Root folder for stored product images (default `./uploads`; served at `/images`, gitignored) |
| `PUBLIC_BASE_URL` | Base URL used to compose absolute `product_image_url`s (e.g. `http://localhost:3000`); empty → relative URLs |

Setup: `pnpm install` → create `.env` → `psql "$DATABASE_URL" -f src/schema/tokki_schema.sql` → `pnpm dev`.

Commands: `pnpm dev` (watch), `pnpm test` (Jest, ESM via `--experimental-vm-modules`), `pnpm start`.

Business context: Venezuelan phone numbers are the primary customer identifier (+58); phones are stored E.164 specifically so the owner can follow up via WhatsApp. The Venezuelan ID (`cedula`) is a secondary, optional client field.

---

## Conventions you must follow

### Response envelope
Every JSON response: `{ success: boolean, data?, message?, row?/updated_row? }`. Success is `2xx`; validation failures `400`; missing/archived resources `404`; unexpected DB errors go to `next(err)` and are finalized by the global error handler in `src/app.js` (maps PG codes `22P02`→400, `23505`→409, `23503`→400; everything else 500). Controllers still own their `ROLLBACK` before calling `next(err)` — the handler never touches transactions.

### Database access (`src/config/db.js`)
- Single statements / reads: `db.query(text, params)` (pool).
- Multi-statement transactions: `const client = await db.getClient()` then explicit `BEGIN` / `COMMIT` / `ROLLBACK`, and **always** `client.release()` in a `finally` block. `getClient()` monkey-patches query tracking with a 5s leak alarm — keep using it rather than importing `pg` directly.
- **Never interpolate into SQL text** — not even constants or "trusted" values. Query strings must be fully literal; if behavior branches, write separate complete queries per branch (see `getAllProducts`'s `?category=` handling). All user-supplied values go through `$n` params. Rationale: any `${}` inside a query normalizes interpolation as a pattern and invites injection bugs on the next edit.

### Stock integrity rules
- Any read-modify-write on `products.qty_available` inside checkout/cancel uses `SELECT ... FOR UPDATE` to prevent overselling. Never remove these locks.
- `in_stock` is always derived: `(qty_available > 0)`. Recalculate it in every UPDATE that touches quantity.
- Cancel restores exactly the snapshotted `order_items.product_qty`, guarded by status checks so stock can't be restored twice.

### Order lifecycle
`pending` → (`approved` | `canceled`) only. Both terminal states reject further transitions. Orders are never deleted. Line items snapshot `product_name`/`product_price` at purchase time — historical data comes from `order_items`, never re-joined from live products.

### Soft delete for products
Archive sets `is_archived = true, qty_available = 0, in_stock = false`. All public product queries filter `is_archived = false`.

### Categories
`products.category` stores the **display name** exactly as the frontend renders it (`'Maquillaje'`, `'Skincare'`, … — the allowed set lives in the frontend's `src/constants/index.ts` `CATEGORIES`). The storefront filters with strict equality (`p.category === category.name`), so never store slugs or re-cased variants. `GET /api/products?category=` is an exact match. DB default `'Otros'` covers pre-category rows.

### Phones
Always pass user-supplied phones through `normalizeAndValidatePhone(country_code, tlf_num)` (`src/utils/validate.js`) → returns canonical E.164 or `null`. Accepts local (`0414...`) + country code, or full international. Store only the normalized value; `clients.tlf_num` is UNIQUE.

### Cedula
Optional client field (`clients.cedula VARCHAR(12) UNIQUE`, nullable). Always pass user-supplied values through `normalizeAndValidateCedula(raw)` → canonical `"V-12345678"` or `null` (absent/empty = NULL, not an error). Stored only when the client row is created — never backfilled on reuse. A cedula owned by another client surfaces as PG `23505` → global handler → `409`.

### Auth (Clerk — wired)
- `clerkMiddleware()` runs in `src/app.js`; protected routes chain `requireAdmin` (`src/middleware/auth.js`).
- `requireAdmin`: no session → `401`; Clerk user's `publicMetadata.role` must be `'owner'` or `'tech'` (same values the frontend sets in Clerk Dashboard) → else `403`; on success stashes `req.adminUser = { clerk_user_id, email, user_type }`.
- Role → DB mapping: `owner`→`shop_owner`, `tech`→`tech_admin`. Admin users are lazily upserted into `tokki_shop.users` when they cancel/approve orders, and that id lands in `orders.processed_by`.
- **Do NOT use `requireAuth()`** from `@clerk/express` v2 — it's deprecated and redirects browsers instead of returning JSON 401.
- Public endpoints: product GETs + `POST /api/orders` (guest checkout). Everything else requires an admin session token.

### Delivery types
`orders.delivery_type` is enforced at both layers: the controller rejects anything outside `['envio_nacional', 'delivery', 'retiro_tienda']` with 400, and a DB CHECK constraint (`orders_delivery_type_check`, added `NOT VALID` so legacy rows survive) backstops it. The API stores/returns **slugs only**; accented display labels ("Envío Nacional", "Delivery", "Retiro en Tienda") are a frontend concern (`DELIVERY_TYPES` in `src/constants/index.ts`). Keep the two lists in sync manually — same discipline as categories.

### Images
Product images live on disk under `UPLOAD_DIR`, one WebP per product: UUID keys shaped `products/<uuid>.webp` (sharp-normalized ≤1600px, q82). The DB stores **the key only** (`products.product_image`) — never store absolute URLs; responses compose `product_image_url` at response time via `toPublicImageUrl`/`attachImageUrls`. Uploads go through `uploadImage` (`src/middleware/upload.js`): memory storage, 5 MB cap, declared-mime allowlist **plus magic-byte sniff** (headers are spoofable). File lifecycle discipline: save file → transactional DB update → cleanup on failure; a replaced/archived image's file is deleted only after its commit succeeds (best-effort unlink, log-and-continue). Removing an image (`clearProductImage`, `DELETE /api/products/:id/image`) is idempotent — no image set → success no-op. Static serving: `/images` mounts `UPLOAD_DIR` in `src/app.js` with 7-day immutable cache — safe because keys are content-immutable UUIDs.

### Versioning
The backend is pre-deploy: versions live in `0.x.y` (features/behavior changes bump `x`, fixes/docs bump `y`). `1.0.0` = first production deployment — never jump to `1.x` before that. The version appears in `API_CONTRACT.md` and `package.json`; keep the two in sync on every bump.

### Code style
ES Modules everywhere (`import`/`export`). Controllers hold SQL inline as template literals with `$1` params — no ORM, no query builder by design (Level 2 architecture). No comments-heavy style; match existing naming (`c_orders.js`, `c_products.js`). No linter is configured yet.

### Testing — TDD is mandatory
All development follows a **test-driven approach**: for every change, write the failing test first, run it to see it fail, then implement just enough to make it pass (red → green → refactor). No production code ships without a test that exercises it — including bug fixes (the test reproduces the bug first).
Unit tests live in `tests/*.test.js` (Jest, ESM via `--experimental-vm-modules`). Run them with `pnpm test`. Pure helpers like `validate.js` are trivially testable; controllers currently hit Postgres directly, so cover what's testable without a DB (utils, middleware, pure logic) and track integration coverage under ROADMAP P2 #9 before assuming it exists.

---

## Gotchas & known quirks

1. **Docs drift fast** — this repo's docs were written alongside features; if code and contract disagree, check git history and fix the doc in the same PR.
2. Field types are validated up front by `src/utils/productValidation.js` — invalid `product_price`/`qty_available` reject with 400 instead of reaching SQL or being silently ignored.
3. Express-generator leftovers were removed from `package.json` (Aug 2026); `pnpm-workspace.yaml` no longer needs argon2/bcrypt build approvals.
4. `server.js` runs a startup DB ping before listening — if tests ever import it, they'll need a live DB. Import `src/app.js` for supertest instead.
5. `.gitignore` excludes `.agents/` and `plans/` — scratch/planning artifacts go there; tracked docs stay at root.
6. Schema changes: edit `src/schema/tokki_schema.sql` (it's `CREATE ... IF NOT EXISTS`, idempotent-ish but has no migration path — ROADMAP P3 #15). Keep `PROJECT_SUMMARY_AND_PLAN.md` §3 in sync when tables change.
7. `orders.processed_by` is populated on cancel/approve via lazy upsert of the acting admin (`src/middleware/auth.js`). Older orders keep NULL.

---

## Where things live (map)

```
server.js                  entrypoint: dotenv, DB ping, listen
src/app.js                 express app: cors, json parsing, clerkMiddleware, /api router, 404 + global error handler
src/config/db.js           pool adapter: query() / getClient()
src/middleware/auth.js     requireAdmin (Clerk role check) + users-table upsert helper
src/middleware/upload.js   product-image upload gate: multer memory + mime/magic-byte validation
src/routes/index.js        mounts /products, /orders
src/routes/products.js     product routes
src/routes/orders.js       order routes (incl. /client/:id, /:id/cancel, /:id/approve)
src/controllers/c_products.js   catalog CRUD + soft delete + image upload orchestration (applyProductImage)
src/controllers/c_orders.js     checkout transaction, listing, lifecycle transitions
src/utils/validate.js      phone (E.164) + cedula normalization
src/utils/productValidation.js  strict field-type validators (products create/patch, order items)
src/utils/storage.js       image storage: saveProductImage / deleteProductImage / cleanupProductImages / attachImageUrls / toPublicImageUrl
src/schema/tokki_schema.sql authoritative DDL (schema tokki_shop)
tests/                     unit tests: validate (phone+cedula), product-validation, storage, upload, product-image, image-cleanup
```
