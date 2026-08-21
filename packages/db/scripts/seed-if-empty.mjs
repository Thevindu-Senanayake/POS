// Seed guard for containerized startup.
//
// The real seed (`prisma/seed.ts`) is idempotent by WIPING the domain tables and
// re-inserting — perfect for `pnpm --filter @pos/db seed`, but catastrophic if it
// ran on every `docker compose up` (it would erase live data each boot). This guard
// runs the seed ONLY when the database is empty (no users), so first boot seeds the
// demo catalog and every later boot is a no-op. Set FORCE_SEED=1 to reseed anyway
// (used by `pnpm docker:seed`).
//
// Invoked by the one-shot `migrate` compose service after `prisma migrate deploy`.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const dbDir = join(dirname(fileURLToPath(import.meta.url)), '..'); // packages/db
const force = process.env.FORCE_SEED === '1';

const prisma = new PrismaClient();
let shouldSeed = force;
try {
  const users = await prisma.user.count();
  if (users > 0 && !force) {
    console.log(`[seed-if-empty] ${users} user(s) present — already seeded, skipping.`);
  } else {
    shouldSeed = true;
    console.log(
      force
        ? '[seed-if-empty] FORCE_SEED=1 — reseeding (existing data will be wiped)…'
        : '[seed-if-empty] empty database — seeding demo data…',
    );
  }
} finally {
  await prisma.$disconnect();
}

if (!shouldSeed) process.exit(0);

// Run the real seed from packages/db so its `data/seed-data.json` relative reads resolve.
const res = spawnSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
  cwd: dbDir,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32', // pnpm is a .cmd shim on Windows
});
if (res.error) {
  console.error(`[seed-if-empty] failed to launch seed: ${res.error.message}`);
  process.exit(1);
}
process.exit(res.status ?? 1);
