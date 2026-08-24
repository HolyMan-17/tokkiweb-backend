# CONTEXT.md — Project Context for Agents & Contributors

Read this before changing code. It captures the non-obvious decisions and patterns that aren't visible from any single file.

**Related docs:** [`README.md`](README.md) (setup) · [`API_CONTRACT.md`](API_CONTRACT.md) (endpoint contracts) · [`PROJECT_SUMMARY_AND_PLAN.md`](PROJECT_SUMMARY_AND_PLAN.md) (architecture & schema) · [`ROADMAP.md`](ROADMAP.md) (backlog)

---

## What this is

Backend API for the **Tokki Shop** storefront: a product catalog with guest checkout, stock management, and an order-approval workflow for shop owners. The React frontend lives in a separate repo. Admin auth will be Clerk; it is **installed but not wired yet** — do not assume any endpoint is protected.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required — server refuses to start without a reachable DB) |
| `PORT` | HTTP port (default 3000) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_...`) — required for `clerkMiddleware()`; admin endpoints reject everything without it |
| `FRONTEND_ORIGINS` | Comma-separated CORS allowlist (default `http://localhost:5173`) |

Setup: `pnpm install` → create `.env` → `psql "$DATABASE_URL" -f src/schema/tokki_schema.sql` → `pnpm dev`.

Commands: `pnpm dev` (watch), `pnpm test` (Jest, ESM via `--experimental-vm-modules`), `pnpm start`.

Business context: Venezuelan phone numbers are the primary customer identifier (+58); phones are stored E.164 specifically so the owner can follow up via WhatsApp.

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

### Auth (Clerk — wired)
- `clerkMiddleware()` runs in `src/app.js`; protected routes chain `requireAdmin` (`src/middleware/auth.js`).
- `requireAdmin`: no session → `401`; Clerk user's `publicMetadata.role` must be `'owner'` or `'tech'` (same values the frontend sets in Clerk Dashboard) → else `403`; on success stashes `req.adminUser = { clerk_user_id, email, user_type }`.
- Role → DB mapping: `owner`→`shop_owner`, `tech`→`tech_admin`. Admin users are lazily upserted into `tokki_shop.users` when they cancel/approve orders, and that id lands in `orders.processed_by`.
- **Do NOT use `requireAuth()`** from `@clerk/express` v2 — it's deprecated and redirects browsers instead of returning JSON 401.
- Public endpoints: product GETs + `POST /api/orders` (guest checkout). Everything else requires an admin session token.

### Code style
ES Modules everywhere (`import`/`export`). Controllers hold SQL inline as template literals with `$1` params — no ORM, no query builder by design (Level 2 architecture). No comments-heavy style; match existing naming (`c_orders.js`, `c_products.js`). No linter is configured yet.

### Testing
Unit tests live in `tests/*.test.js` (Jest). Pure helpers like `validate.js` are trivially testable; controllers currently have no tests because they hit Postgres directly — see ROADMAP P2 #9 before assuming integration coverage.

---

## Gotchas & known quirks

1. **Docs drift fast** — this repo's docs were written alongside features; if code and contract disagree, check git history and fix the doc in the same PR.
2. `success: "true"` string literals exist in two spots of `c_products.js` (bug — ROADMAP P0 #3).
3. Archived-product update returns 401 instead of 404 (bug — ROADMAP P0 #4).
4. `updateProductDetails` silently ignores a negative `qty_available` (falls back to current value) instead of rejecting.
5. Express-generator leftovers still in `package.json`: `argon2`, `bcrypt`, `cookie-parser`, `debug`, `http-errors`, `morgan`, `pug` — unused, safe to remove (ROADMAP P3 #15).
6. A stray empty file named `test` sits at the repo root; harmless leftover.
7. `server.js` runs a startup DB ping before listening — if tests ever import it, they'll need a live DB. Import `src/app.js` for supertest instead.
8. `.gitignore` excludes `.agents/` and `plans/` — scratch/planning artifacts go there; tracked docs stay at root.
9. Schema changes: edit `src/schema/tokki_schema.sql` (it's `CREATE ... IF NOT EXISTS`, idempotent-ish but has no migration path — ROADMAP P3 #15). Keep `PROJECT_SUMMARY_AND_PLAN.md` §3 in sync when tables change.
10. `orders.processed_by` is populated on cancel/approve via lazy upsert of the acting admin (`src/middleware/auth.js`). Older orders keep NULL.

---

## Where things live (map)

```
server.js                  entrypoint: dotenv, DB ping, listen
src/app.js                 express app: cors, json parsing, clerkMiddleware, /api router, 404 + global error handler
src/config/db.js           pool adapter: query() / getClient()
src/middleware/auth.js     requireAdmin (Clerk role check) + users-table upsert helper
src/routes/index.js        mounts /products, /orders
src/routes/products.js     product routes
src/routes/orders.js       order routes (incl. /client/:id, /:id/cancel, /:id/approve)
src/controllers/c_products.js   catalog CRUD + soft delete
src/controllers/c_orders.js     checkout transaction, listing, lifecycle transitions
src/utils/validate.js      phone normalization (E.164)
src/schema/tokki_schema.sql authoritative DDL (schema tokki_shop)
tests/validate.test.js     phone validator unit tests
```
