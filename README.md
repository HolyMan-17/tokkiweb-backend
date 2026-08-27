# tokkiweb-backend

PostgreSQL, Express.js and Node.JS backend for the Tokki online store.

## Stack
- **PERN:** PostgreSQL, Express.js, React (frontend, separate repo), Node.js
- **ES Modules**, `pg` connection pool, **Clerk auth wired** (`clerkMiddleware` + role-based `requireAdmin`; product mutations and order management are admin-only, checkout & catalog reads stay public)
- **pnpm** package manager, **Jest + supertest** for tests

## Architecture (Level 2: Router → Controller + direct SQL)
- `src/config/db.js` — PG pool adapter (`query()` + transaction-capable `getClient()`)
- `src/routes/` — URL → controller mapping
- `src/controllers/` — request handling, validation, direct SQL, transactions
- `src/utils/validate.js` — shared validation helpers (phone normalization to E.164)
- `src/schema/tokki_schema.sql` — authoritative DDL for the `tokki_shop` schema

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/products` | List active (non-archived) products |
| `GET /api/products/:product_id` | Single product details |
| `POST /api/products` | Create product |
| `PATCH /api/products/:product_id` | Partial product update |
| `DELETE /api/products/:product_id` | Soft-delete (archive) product |
| `POST /api/products/:product_id/image` | Upload/replace product image (multipart, WebP-normalized) |
| `POST /api/orders` | Checkout: find/create client, lock & deduct stock, create order |
| `GET /api/orders/receipt/:order_token` | Public order receipt by unguessable UUID token |
| `GET /api/orders` | Dashboard list of all orders (admin) |
| `GET /api/orders/client/:client_id` | One client's order history (admin) |
| `GET /api/orders/:order_id` | Full order details (header + client + line items) (admin) |
| `PATCH /api/orders/:order_id/cancel` | Cancel a pending order, restore stock (admin) |
| `PATCH /api/orders/:order_id/approve` | Approve a pending order (admin) |

**Public:** catalog reads (`GET /api/products*`), guest checkout (`POST /api/orders`), secure order receipt (`GET /api/orders/receipt/:order_token`).
**Admin-only:** product mutations (create/update/archive/images), orders dashboard (`GET /api/orders`), order full details (`GET /api/orders/:order_id`), client history, cancel/approve — requires a Clerk session with `publicMetadata.role` of `owner` or `tech`.

## Docs
- [`API_CONTRACT.md`](API_CONTRACT.md) — request/response contracts for every endpoint
- [`PROJECT_SUMMARY_AND_PLAN.md`](PROJECT_SUMMARY_AND_PLAN.md) — architecture decisions, DB schema, implemented behavior
- [`ROADMAP.md`](ROADMAP.md) — prioritized backlog of known gaps and next features
- [`PRODUCTION_DEPLOYMENT_ROADMAP.md`](PRODUCTION_DEPLOYMENT_ROADMAP.md) — step-by-step production setup, Nginx/PM2, and security hardening
- [`CONTEXT.md`](CONTEXT.md) — project context & conventions for agents/contributors

## Getting started
```bash
pnpm install
# configure .env with DATABASE_URL (see CONTEXT.md for all env vars)
pnpm dev
```
Server verifies the DB connection before listening on `PORT` (default 3000).

To initialize the database:
```bash
psql "$DATABASE_URL" -f src/schema/tokki_schema.sql
```

## Scripts
- `pnpm dev` — run with file watching
- `pnpm start` — run normally
- `pnpm test` — Jest (unit tests in `tests/`)
