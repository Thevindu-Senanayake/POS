# Hospitality POS

A single-outlet **Restaurant + Bar + Room-Service** point-of-sale system with one shared
inventory, built to the spec in [`POS_SYSTEM_INSTRUCTIONS.md`](./POS_SYSTEM_INSTRUCTIONS.md).

- **Backend:** NestJS REST API (`apps/api`) — orders, inventory, billing, rooms, auth, realtime.
- **Frontend:** Next.js + Tailwind (`apps/web`) — touch-first POS terminal + admin dashboard.
- **Print agent:** local ESC/POS service (`apps/print-agent`) — KOT + bill thermal printing.
- **Database:** PostgreSQL via Prisma (`packages/db`).
- **Shared types:** enums / DTOs / zod schemas (`packages/shared`).

## Monorepo layout

```
apps/
  api/          NestJS REST API + socket.io realtime gateway
  web/          Next.js App Router POS + admin UI
  print-agent/  Node ESC/POS print-queue worker
packages/
  db/           Prisma schema, client, migrations, seed
  shared/       Shared enums, DTO & response types, zod schemas
  tsconfig/     Shared TypeScript configs
```

## Quick start

```bash
# 1. Install deps (Node >= 20, pnpm 9)
pnpm install

# 2. Environment
cp .env.example .env

# 3. Start Postgres (Docker) — Adminer UI on http://localhost:8080
docker compose up -d

# 4. Apply schema + seed demo data
pnpm db:migrate
pnpm db:seed

# 5. Run everything (api :4000, web :3000, print-agent)
pnpm dev
```

Full setup, seeded logins, and an end-to-end verification walkthrough are documented at the end of
the build (see the "Running & verifying" section, added with the final docs commit).
