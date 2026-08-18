import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright web smoke config (spec §11). Boots the API — waiting on its public
 * `/api/health` endpoint — and the Next.js web app, then drives the critical POS
 * path in a real browser (see `e2e/smoke.spec.ts`).
 *
 * Prerequisites: Postgres up and seeded (`docker compose up -d` then
 * `pnpm db:seed`). The flow signs in as the seeded admin and orders a seeded
 * menu item, so it needs the seed data present; it provisions no fixtures of its
 * own beyond a throwaway takeaway order (no table/session state consumed), so it
 * is repeatable without re-seeding.
 *
 * `reuseExistingServer: true` means an already-running `pnpm dev` is reused
 * rather than double-booting ports 4000/3000.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @pos/api dev',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @pos/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
