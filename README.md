# Hospitality POS

A single-outlet **Restaurant + Bar + Room-Service** point-of-sale system sharing **one inventory**,
built to the spec in [`POS_SYSTEM_INSTRUCTIONS.md`](./POS_SYSTEM_INSTRUCTIONS.md).

- **Backend** — NestJS REST API (`apps/api`): orders, inventory, billing, rooms/folio, auth,
  realtime gateway, print queue, reports.
- **Frontend** — Next.js App Router + Tailwind (`apps/web`): touch-first POS terminal + admin
  dashboard, with an offline order queue.
- **Print agent** — Node ESC/POS worker (`apps/print-agent`): polls the print queue over the LAN and
  renders KOTs / bills to thermal printers (or stdout in dev).
- **Database** — PostgreSQL via Prisma (`packages/db`): schema, migrations, seed.
- **Shared types** — enums, DTO/response types, zod schemas, and the pure money/stock engine
  (`packages/shared`), consumed by both the API and the web app.

## Monorepo layout

```
apps/
  api/          NestJS REST API + socket.io realtime gateway
  web/          Next.js App Router POS + admin UI
  print-agent/  Node ESC/POS print-queue worker
packages/
  db/           Prisma schema, client, migrations, seed
  shared/       Shared enums, DTO & response types, zod schemas, money/stock engine
  tsconfig/     Shared TypeScript configs
docker-compose.yml   Postgres 15 (+ Adminer)
turbo.json           Turborepo task graph
```

Managed with **pnpm workspaces + Turborepo**.

## Prerequisites

- **Node.js ≥ 20** (developed on 22)
- **pnpm 9** (`corepack enable` then `corepack prepare pnpm@9.15.0 --activate`)
- **Docker** (for Postgres) — or a local Postgres 15 you point `DATABASE_URL` at

## Quick start

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Create your env file (safe defaults for local dev)
cp .env.example .env

# 3. Start Postgres + Adminer (Adminer UI: http://localhost:8080)
docker compose up -d

# 4. Apply the schema and load demo data
pnpm db:migrate      # first run creates the migration/database
pnpm db:seed         # idempotent: wipes then re-inserts the demo dataset

# 5. Run everything (Turborepo runs all three apps together)
pnpm dev
```

| App          | URL / target                    | Notes                                             |
| ------------ | ------------------------------- | ------------------------------------------------- |
| Web POS      | http://localhost:3000           | Sign in, take orders, admin dashboard             |
| REST API     | http://localhost:4000/api       | Health: `GET /api/health`                         |
| Realtime     | ws://localhost:4000             | socket.io — live floor/room board, KOT, printers  |
| Print agent  | (no port)                       | Logs claimed jobs; prints to stdout when no IP set |
| Adminer      | http://localhost:8080           | DB browser (server `db`, user/pass/db all `pos`)  |

> Postgres is published on host port **5433** (not 5432) to avoid clashing with a native install.
> `DATABASE_URL` uses `127.0.0.1` rather than `localhost` so Node/Prisma don't resolve to IPv6 `::1`,
> which Docker doesn't forward.

## Seeded logins

All users share the password **`pos1234`**. The admin also has manager **PIN `1234`** (used to
approve PIN-gated actions such as discounts, voids, split/merge for non-admin roles — spec §7/§8).

| Username      | Name              | Role                 |
| ------------- | ----------------- | -------------------- |
| `admin`       | Alice Admin       | admin (+ PIN `1234`) |
| `cashier`     | Cathy Cashier     | cashier              |
| `waiter`      | Wasim Waiter      | waiter               |
| `bartender`   | Bilal Bartender   | bartender            |
| `kitchen`     | Karim Kitchen     | kitchen_staff        |
| `roomservice` | Rana RoomService  | room_service_staff   |

The seed also creates: 1 outlet, 3 suppliers, 12 ingredients (each with an opening-balance stock
movement), 7 menu items with per-channel prices + recipes, service-charge rules, 10 tables
(restaurant + bar), 5 rooms across 3 categories, one checked-in half-board booking (John Guest,
room 201), and two printers (kitchen + bar).

## End-to-end verification walkthrough

With `docker compose up -d`, `pnpm db:seed`, and `pnpm dev` running:

1. **Sign in** at http://localhost:3000 as `admin` / `pos1234`, open **POS Terminal**.
2. **Take an order** — tap a free restaurant table (opens a session) or **+ Takeaway**. Add menu
   items to the round, then **Send**. This is the *only* point stock is deducted: the API writes
   `StockMovement(reason=sale)` rows for each recipe ingredient, decrements `currentStock`, and
   enqueues a **KOT `PrintJob`** per station — all in one transaction.
3. **Watch the print agent** — its log renders the KOT as ESC/POS text to stdout (no printer IP is
   configured in dev). Set `PRINTER_KITCHEN_IP` etc. in `.env` to print to real hardware.
4. **Watch realtime** — the floor board and admin board update live over socket.io as the table
   changes state.
5. **Bill & pay** — tap **Pay**. Restaurant carries a 10% service charge; bar dine-in, takeaway, and
   room service are 0% (spec §2.5, surfaced in the UI). Settle in full, split N ways across cash/card,
   or **charge to room** for an in-house guest. On payment the order is marked `paid`, a bill
   `PrintJob` is enqueued, the session closes, and the table flips to `needs_cleaning`.
6. **Board-plan comp** — a room-service order for the half-board guest can be comped: the KOT still
   fires and stock still deducts, but the folio charge is **₨0** (spec §2.7).
7. **Low-stock alert** — receive against a purchase order, or send enough orders to drop an ingredient
   below its reorder threshold, then check **Admin → Reports / Inventory** for the low-stock warning.
8. **Printer-offline alert** — set a bogus `PRINTER_KITCHEN_IP` (e.g. `10.255.255.1`) and restart the
   agent: repeated send failures exhaust the capped exponential backoff, flip the printer's health to
   offline, and raise the "printer offline" banner in **Admin → Printers**.
9. **Offline queue** — stop the API (`Ctrl-C` the api process) and send a round: the web app durably
   queues it (IndexedDB) with a "queued offline" indicator. Restart the API; the queue replays and the
   KOT/stock fire **only after the server confirms** — never from the local draft (spec §9).

## Testing

```bash
# Backend unit tests — the pure money/stock engine (no DB needed)
pnpm --filter @pos/api test

# Backend e2e — boots the Nest app over HTTP against the seeded DB
#   (requires: docker compose up -d && pnpm db:seed)
pnpm --filter @pos/api test:e2e

# Web smoke — Playwright drives sign-in → order → send → pay in a real browser
#   (first run only: install the browser)
pnpm --filter @pos/web exec playwright install chromium
#   (requires Postgres up + seeded; boots/reuses the api+web dev servers automatically)
pnpm --filter @pos/web test:smoke
```

What's covered:

- **Unit (Jest, 28 tests):** order totals + service charge by channel, discount resolution/clamping,
  split-bill proportional allocation (cents never lost), weighted-average goods-received cost, room
  checkout composition.
- **E2E (Jest + supertest, 3 flows):** the happy path (open table → send, asserting `StockMovement`
  **and** KOT `PrintJob` → pay → session closed / table dirty), the board-plan ₨0 comp, and
  cancel-after-send restoring the deducted stock.
- **Smoke (Playwright):** sign in → takeaway order → add item → send → settle in full → back to floor.

## Environment variables

Copy `.env.example` → `.env`. The same root file is read by every workspace (via `dotenv -e ../../.env`
in the package scripts, and Next.js for `NEXT_PUBLIC_*`). The API **fails fast at boot** if a required
variable is missing.

| Variable                               | Used by      | Required | Default                    | Purpose                                             |
| -------------------------------------- | ------------ | :------: | -------------------------- | --------------------------------------------------- |
| `DATABASE_URL`                         | db, api      |   yes    | —                          | Postgres connection string                          |
| `API_PORT`                             | api          |    no    | `4000`                     | REST + realtime port                                |
| `CORS_ORIGIN`                          | api          |    no    | `http://localhost:3000`    | Allowed web origin(s), comma-separated              |
| `JWT_ACCESS_SECRET`                    | api          |   yes    | —                          | Access-token signing secret                         |
| `JWT_REFRESH_SECRET`                   | api          |   yes    | —                          | Refresh-token signing secret                        |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`   | api          |    no    | `15m` / `7d`               | Token lifetimes                                     |
| `PRINT_AGENT_TOKEN`                    | api, agent   |   yes    | —                          | Shared secret the agent uses to authenticate        |
| `CURRENCY_SYMBOL`                      | api          |    no    | `₨`                        | Symbol on bills/receipts                            |
| `NEXT_PUBLIC_API_URL`                  | web          |    no    | `http://localhost:4000`    | REST base the browser calls                         |
| `NEXT_PUBLIC_WS_URL`                   | web          |    no    | `http://localhost:4000`    | socket.io endpoint                                  |
| `PRINT_AGENT_API_URL`                  | agent        |    no    | `http://localhost:4000`    | API origin the agent polls                          |
| `PRINT_AGENT_POLL_MS`                  | agent        |    no    | `2000`                     | Queue poll interval                                 |
| `PRINT_AGENT_MAX_RETRIES`              | agent        |    no    | `6`                        | Backoff doublings (capped at 2 min) when API is down |
| `PRINTER_<STATION>_{IP,PORT,TYPE}`     | agent        |    no    | — / `9100` / `epson`       | Per-station printer (`KITCHEN`/`BAR`/`RECEIPT`); blank IP → stdout |

Optional agent tuning (`PRINT_AGENT_ID`, `PRINT_AGENT_CLAIM_LIMIT`, `PRINT_AGENT_PRINTER_REFRESH_MS`,
`PRINT_AGENT_CONNECT_TIMEOUT_MS`) is documented inline in `.env.example`.

## Useful scripts

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `pnpm dev`             | Run api + web + print-agent together (Turborepo)                    |
| `pnpm build`           | Build every workspace                                               |
| `pnpm typecheck`       | Type-check every workspace                                          |
| `pnpm test`            | Run all package test tasks                                          |
| `pnpm db:migrate`      | Create/apply a dev migration                                        |
| `pnpm db:deploy`       | Apply committed migrations (non-interactive, for prod/CI)           |
| `pnpm db:seed`         | Load the demo dataset (idempotent — wipes then re-inserts)          |
| `pnpm db:reset`        | Drop, re-migrate, and re-seed the database                          |
| `pnpm db:studio`       | Open Prisma Studio                                                  |

## Key domain rules

- **Stock deducts on send-to-kitchen, never on draft** (spec §0.1/§2.6). Cancel/void after send writes
  reversing movements and restores `currentStock`.
- **Prices are snapshots.** `OrderItem.unitPrice` and `Booking.agreedRate` are copied at capture time;
  historical bills never re-join live prices (spec §2.4/§2.6/§2.7).
- **Service charge is per channel** (spec §2.5): restaurant 10%; bar dine-in / takeaway / room service
  0% by default — all owner-configurable via service-charge rules.
- **Goods received** updates `Ingredient.costPerUnit` by weighted average (spec §2.2).
- **The `StockMovement` ledger is the source of truth**; `currentStock` is only ever mutated inside the
  same transaction that appends a movement.

## Production / go-live notes

This is a complete, runnable system with automated tests on the money/stock critical paths. Before a
real go-live, the spec §12 UAT items still need on-site confirmation — they are **flagged, not
skipped**:

- **Real thermal-printer hardware + LAN printing** must be validated on-site. Dev uses the stdout sink.
- **Exact permission matrix** — implemented to the spec §7 default table; confirm with the owner.
- **Bar dine-in 0% service charge** is intentional (spec §2.5) and surfaced in the UI — confirm.
- Whether comped board-plan meals should print a **"PACKAGE"** tag on the KOT.
- If the venue's internet is unreliable and the DB is cloud-hosted, decide on a local DB cache for the
  print path (the agent already talks to the API over the LAN so KOT/bill printing survives an internet
  blip — spec §9).

## Spec

The authoritative build spec lives in [`POS_SYSTEM_INSTRUCTIONS.md`](./POS_SYSTEM_INSTRUCTIONS.md).
Section references throughout the code and this README (`§2.5`, `§7`, …) point back to it.
