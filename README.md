# Hospitality POS

A single-outlet **Restaurant + Bar + Room-Service** point-of-sale system sharing **one inventory**,
built to the spec in [`POS_SYSTEM_INSTRUCTIONS.md`](./POS_SYSTEM_INSTRUCTIONS.md).

- **Backend** — NestJS REST API (`apps/api`): orders, inventory, billing, rooms/folio, auth,
  realtime gateway, print queue, reports.
- **Till** — Electron desktop app (`apps/till`) for the counter: a kiosk shell around the
  touch-first POS terminal + room-service UI (`apps/till/ui`, `@pos/till-ui`), with an offline
  order queue and an **in-process print host** that claims print jobs from the API and prints
  KOTs/bills to the till's installed Windows printers.
- **Web admin** — Next.js App Router + Tailwind (`apps/web`): the admin management portal
  (inventory, menu, purchasing, rooms, tables, printers, reports, users, settings). Ships as a
  static export served by nginx.
- **Database** — PostgreSQL via Prisma (`packages/db`): schema, migrations, seed.
- **Shared** — `packages/shared` (enums, DTO/response types, zod schemas, the pure money/stock
  engine) and `packages/client-core` (API client, stores & hooks shared by the web admin and the
  till UI).

## Monorepo layout

```
apps/
  api/          NestJS REST API + socket.io realtime gateway
  web/          Next.js App Router admin portal (static export → nginx)
  till/         Electron kiosk shell + in-process print host
    ui/         Next.js POS terminal + room-service UI (@pos/till-ui, static export)
packages/
  db/           Prisma schema, client, migrations, seed
  shared/       Shared enums, DTO & response types, zod schemas, money/stock engine
  client-core/  API client, stores & hooks shared by the web admin and the till UI
  tsconfig/     Shared TypeScript configs
docker-compose.yml       Local dev stack: Postgres + api + web (+ one-shot migrate)
docker-compose.prod.yml  Droplet stack: pulls the GHCR images (see DEPLOY.md)
turbo.json               Turborepo task graph
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

# 4. Apply the schema and load Hotel KinTop's real catalog
pnpm db:migrate      # first run creates the migration/database
pnpm db:seed         # idempotent: wipes then re-inserts the seed dataset

# 5. Run the API, web admin, and till UI dev servers together (Turborepo)
pnpm dev

# 6. (optional) Launch the Electron till — the counter POS + in-process print host
pnpm till
```

| App           | URL / target                    | Notes                                                        |
| ------------- | ------------------------------- | ------------------------------------------------------------ |
| Web admin     | http://localhost:3000           | Admin management portal — sign in `admin` / `pos1234`        |
| Till UI       | http://localhost:3100           | POS terminal + room service (the Electron till loads this)   |
| REST API      | http://localhost:4000/api       | Health: `GET /api/health`                                    |
| Realtime      | ws://localhost:4000             | socket.io — live floor/room board, KOT, printers             |
| Adminer       | http://localhost:8080           | DB browser (server `db`, user/pass/db all `pos`)             |

> `pnpm dev` starts the three dev servers; `pnpm till` opens the Electron shell that loads the
> Till UI and runs the print host. The print host stays dormant unless `PRINT_AGENT_TOKEN` is set.

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

### Seeded catalog (real Hotel KinTop data)

The menu and inventory are **Hotel KinTop's real catalog**, imported from the two source workbooks
in `packages/db/data/source/` by `packages/db/scripts/import-xlsx.py` into the committed
`packages/db/data/seed-data.json`, which the Prisma seed loads verbatim (never hand-edit it — to
change the catalog, edit the workbooks and re-run `python packages/db/scripts/import-xlsx.py`, then
`pnpm db:seed`). The seed creates:

- **47 ingredients** — 21 spirits stocked by the millilitre (each with its scannable **bottle
  barcode** + opening stock), plus packaged bar items and kitchen ingredients (kitchen stock starts
  empty and is established later via goods-received).
- **220 menu items / 520 per-channel prices / 300 recipe rows** — 140 bar items (every priced pour
  size **25–750 ml is its own sellable item**, since the prices are non-linear — a 50 ml shot is
  ₨280 but 100 ml is ₨580, not 2×) and 80 kitchen dishes, each with a recipe that deducts stock on
  send.
- **34 scannable barcodes** — on spirit bottles (→ pour picker) and packaged bar items (→ added
  directly). See _Bar barcode scanner_ below.
- Plus: 1 outlet, 6 users, 3 suppliers, service-charge rules, 10 tables (restaurant + bar), 5 rooms
  across 3 categories, one checked-in half-board booking (John Guest, room 201), and **three
  printers** — kitchen, bar, and receipt.

## End-to-end verification walkthrough

With `docker compose up -d`, `pnpm db:seed`, `pnpm dev`, and `pnpm till` running:

1. **Sign in** on the **till** (the Electron window from `pnpm till`, or the Till UI at
   http://localhost:3100) as `admin` / `pos1234`, open **POS Terminal**. (The web admin at
   http://localhost:3000 is management-only — no order taking.)
2. **Take an order** — tap a free restaurant table (opens a session) or **+ Takeaway**. Add menu
   items to the round, then **Send**. This is the *only* point stock is deducted: the API writes
   `StockMovement(reason=sale)` rows for each recipe ingredient, decrements `currentStock`, and
   enqueues a **KOT `PrintJob`** per station — all in one transaction. At a **bar** table you can
   also **scan** a barcode instead of tapping (see _Bar barcode scanner_).
3. **Watch the till's print host** — it claims each queued job from the API and prints it to the
   matching installed Windows printer (KOTs to the kitchen/bar printers, the bill to the receipt
   printer) via the OS print driver. With no printer configured (dev) printing simply no-ops; set
   `PRINT_AGENT_TOKEN` so the host activates, and map jobs to real printers in **Admin → Printers**.
4. **Watch realtime** — the floor board and admin board update live over socket.io as the table
   changes state.
5. **Bill & pay** — tap **Pay**. Restaurant carries a 10% service charge; bar dine-in, takeaway, and
   room service are 0% (spec §2.5, surfaced in the UI). Settle in full, split N ways across cash/card,
   or **charge to room** for an in-house guest. On payment the order is marked `paid`, a bill
   `PrintJob` is enqueued (→ the **USB** receipt printer), the session closes, and the table flips to
   `needs_cleaning`.
6. **Board-plan comp** — a room-service order for the half-board guest can be comped: the KOT still
   fires and stock still deducts, but the folio charge is **₨0** (spec §2.7).
7. **Low-stock alert** — receive against a purchase order, or send enough orders to drop an ingredient
   below its reorder threshold, then check **Admin → Reports / Inventory** for the low-stock warning.
8. **Printer-offline alert** — take a mapped printer offline (power it off, or remove its Windows
   driver) and send a round: the repeated print failures flip that printer's health to offline and
   raise the "printer offline" banner in **Admin → Printers**.
9. **Offline queue** — stop the API (`Ctrl-C` the api process) and send a round: the till durably
   queues it (IndexedDB) with a "queued offline" indicator. Restart the API; the queue replays and the
   KOT/stock fire **only after the server confirms** — never from the local draft (spec §9).

## Bar barcode scanner

The bar has a **USB barcode reader** (an HID keyboard-emulating scanner). On a **bar** order screen
the till's POS listens for the scanner's fast keystroke burst + Enter (ignoring input while a text
field is focused) and resolves the code against `GET /api/menu/scan?code=<barcode>`:

- **Packaged item** (barcode on a `MenuItem` — beer, cans, cigarettes) → added to the round directly.
- **Spirit bottle** (barcode on an `Ingredient`) → opens a **pour picker** listing that bottle's
  priced sizes (25–750 ml); tapping one adds that pour (which deducts its exact ml from the bottle).
- **Unknown code** → a transient "not found" note.

Scanning needs the API online (recipes/prices live server-side); tapping tiles still works offline.
To try it without hardware, dispatch rapid `keydown` events for a seeded barcode on a bar order
screen. The barcodes live in `packages/db/data/seed-data.json` (34 of them) — e.g. grep it for a
spirit `barcode` (opens the picker) vs. a packaged-item `barcode` (adds directly).

## Printing

Print jobs are routed by **printer role** and served by the **till's in-process print host**
(`apps/till/src/print`) — the standalone print-agent app is retired. The API only owns the queue;
the till claims and prints:

- **KOTs** carry a `station` (`kitchen`/`bar`) and print to that station's mapped printer.
- The **customer bill/receipt** is a station-less job that routes to the `receipt` role.

The host polls the API's `/api/printing/agent/*` endpoints (authenticated with `PRINT_AGENT_TOKEN`),
claims pending jobs, renders each as HTML, and prints it to the mapped **installed Windows printer**
via Electron's `webContents.print({ silent, deviceName })` — i.e. the OS print driver, so any printer
Windows can see (USB, network, or virtual) works with no ESC/POS wiring. Printer → device mapping is
managed in **Admin → Printers**. Because it uses the host's own print stack, the print host runs where
the printers are: **inside the Electron till on the counter PC** (`pnpm till`). With no
`PRINT_AGENT_TOKEN` set, the host stays dormant and the till runs as a pure UI shell.

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
| `PRINT_AGENT_TOKEN`                    | api, till    |   yes    | —                          | Shared secret the till's print host authenticates with |
| `CURRENCY_SYMBOL`                      | api          |    no    | `₨`                        | Symbol on bills/receipts                            |
| `NEXT_PUBLIC_API_URL`                  | web          |    no    | `http://localhost:4000`    | REST base the browser calls (baked in at build time) |
| `NEXT_PUBLIC_WS_URL`                   | web          |    no    | `http://localhost:4000`    | socket.io endpoint (baked in at build time)         |
| `PRINT_AGENT_API_URL`                  | till         |    no    | `http://localhost:4000`    | API origin the till's print host polls              |
| `PRINT_AGENT_POLL_MS`                  | till         |    no    | `2000`                     | Queue poll interval                                 |
| `PRINT_AGENT_MAX_RETRIES`              | till         |    no    | `6`                        | Backoff doublings (capped at 2 min) when API is down |

Optional till print-host tuning (`PRINT_AGENT_ID`, `PRINT_AGENT_CLAIM_LIMIT`, `POS_RECEIPT_WIDTH_MM`,
`POS_PRINT_SETTLE_MS`, `RECEIPT_LOGO_PATH`) and the Electron shell/kiosk vars (`POS_*`) are documented
inline in `.env.example`.

## Useful scripts

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `pnpm dev`             | Run the api, web admin & till UI dev servers together (Turborepo)   |
| `pnpm till`            | Launch the Electron till (counter POS + in-process print host)      |
| `pnpm build`           | Build every workspace                                               |
| `pnpm typecheck`       | Type-check every workspace                                          |
| `pnpm test`            | Run all package test tasks                                          |
| `pnpm db:migrate`      | Create/apply a dev migration                                        |
| `pnpm db:deploy`       | Apply committed migrations (non-interactive, for prod/CI)           |
| `pnpm db:seed`         | Load the Hotel KinTop catalog (idempotent — wipes then re-inserts)   |
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

**Deploying the web admin + API to a server:** see [`DEPLOY.md`](./DEPLOY.md) — CI/CD to a
DigitalOcean droplet (push `main` → GitHub Actions builds the two images → GHCR → the droplet pulls
and rolls the stack over). The till is packaged separately for the counter PC (`pnpm till:dist`).

This is a complete, runnable system with automated tests on the money/stock critical paths. Before a
real go-live, the spec §12 UAT items still need on-site confirmation — they are **flagged, not
skipped**:

- **Real printer hardware** must be validated on-site: each printer mapped in **Admin → Printers**
  must be installed on the till PC and reachable through its Windows driver, so the till's print host
  can drive it via `webContents.print`. Confirm KOTs land on the kitchen/bar printers and the bill on
  the receipt printer.
- **USB barcode scanner** — keystroke timing is tuned for a generic HID reader; confirm against the
  bar's actual scanner on-site (adjust the inter-key threshold in the till's scanner hook if needed).
- **Exact permission matrix** — implemented to the spec §7 default table; confirm with the owner.
- **Sheet-imported stock units** — opening quantities came from the venue's workbooks (spirits by ml);
  confirm the unit/column interpretation with the owner before go-live.
- **Bar dine-in 0% service charge** is intentional (spec §2.5) and surfaced in the UI — confirm.
- Whether comped board-plan meals should print a **"PACKAGE"** tag on the KOT.
- If the venue's internet is unreliable and the DB is cloud-hosted, decide on a local DB cache for the
  print path (the till already talks to the API over the LAN, so KOT/bill printing survives an internet
  blip — spec §9).

## Spec

The authoritative build spec lives in [`POS_SYSTEM_INSTRUCTIONS.md`](./POS_SYSTEM_INSTRUCTIONS.md).
Section references throughout the code and this README (`§2.5`, `§7`, …) point back to it.
