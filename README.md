# tokkiweb-backend

PostgreSQL, Express.js and Node.JS backend for online store website.

## Stack
- **PERN:** PostgreSQL, Express.js, React (frontend), Node.js
- **ES Modules**, `pg` connection pool, Clerk for admin auth (pending wiring)

## Architecture
- `src/config/db.js` — PG pool adapter (`query()` + transaction-capable `getClient()`)
- `src/routes/` — URL → controller mapping
- `src/controllers/` — request handling, validation, direct SQL, transactions
- `src/utils/validate.js` — shared validation helpers (phone normalization to E.164)
- `src/schema/tokki_schema.sql` — authoritative DDL for the `tokki_shop` schema

## API
- **`/api/products`** — CRUD for the product catalog (soft-delete via `is_archived`)
- **`/api/orders`** — create order (checkout), list all orders, get single order details

Full request/response contracts: [`API_CONTRACT.md`](API_CONTRACT.md)
Implementation plan & progress: [`PROJECT_SUMMARY_AND_PLAN.md`](PROJECT_SUMMARY_AND_PLAN.md)

## Getting started
```bash
pnpm install
# configure .env with DATABASE_URL
pnpm dev
```
Server verifies the DB connection before listening on `PORT` (default 3000).
