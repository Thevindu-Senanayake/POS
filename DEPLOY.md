# Deploying the Hospitality POS on a Windows till (turnkey)

This guide sets up the POS on a single Windows PC (the "till") so that **everything
starts automatically when Windows starts** and the operator never launches anything
by hand.

**Two layers:**

| Layer | Runs as | Why |
|---|---|---|
| **db + api + web** | Docker containers (auto-restart) | one command, isolated, reproducible |
| **print-agent** | native Windows Scheduled Task | needs the OS print spooler for **USB** printing (Docker can't reach it) |

Both auto-start after the till user signs in: Docker Desktop via "start on sign-in"
+ `restart: always`, the print-agent via a logon Scheduled Task. With Windows
auto-login, a reboot brings the whole system back with **zero manual steps**.

---

## Prerequisites (install once)

1. **Docker Desktop** (WSL2 backend) — https://www.docker.com/products/docker-desktop/
   Docker Desktop is free for small businesses/personal use; confirm your org qualifies.
   After install: **Settings → General → enable "Start Docker Desktop when you sign in"**.
2. **Node.js 22 LTS** — https://nodejs.org (needed only for the native print-agent).
3. The repository copied to the PC, e.g. `C:\POS`. All commands below run from that folder.

---

## Step 1 — Start the app stack (db + api + web)

From the repo root, in a terminal:

```bash
docker compose up -d --build
```

This builds one image and starts Postgres, applies DB migrations, **seeds the demo
catalog on first boot only**, then starts the API and web app. First build takes a
few minutes; subsequent `up`s are fast.

Verify:

- App: http://localhost:3000 — sign in **admin** / **pos1234** (manager PIN **1234**).
- API health: http://localhost:4000/api/health
- `docker compose ps` — `db`, `api`, `web` up; `migrate` exited `0`.

> **Re-seeding is safe.** The seed runs only when the database has no users, so
> restarts never wipe live data. To deliberately reset to demo data:
> `pnpm docker:seed` (or `docker compose run --rm -e FORCE_SEED=1 migrate node packages/db/scripts/seed-if-empty.mjs`) — **this wipes existing data.**

Handy scripts (from `package.json`): `pnpm docker:up`, `pnpm docker:down`,
`pnpm docker:logs`. Optional DB browser at :8080 → `docker compose --profile tools up -d adminer`.

---

## Step 2 — Configure printers (`.env`)

Copy the template and edit it once:

```bash
cp .env.example .env
```

In `.env` set at minimum:

- `PRINT_AGENT_TOKEN` — **must equal** the `PRINT_AGENT_TOKEN` in `docker-compose.yml`
  (default `dev-print-agent-token-change-me`; change both together for production).
- `PRINT_AGENT_API_URL="http://localhost:4000"` (already the default).
- **USB receipt printer:** `PRINTER_RECEIPT_CONNECTION="usb"` and
  `PRINTER_RECEIPT_DEVICE="<exact Windows printer name>"` (as shown in *Printers & scanners*).
- **Network kitchen/bar printers:** `PRINTER_KITCHEN_CONNECTION="network"`,
  `PRINTER_KITCHEN_IP="<ip>"`, `PRINTER_KITCHEN_PORT=9100` (same for `PRINTER_BAR_*`).

Any value left blank falls back to the DB printer map, and ultimately to on-screen
(stdout) rendering — so the agent never crashes on missing hardware.

---

## Step 3 — Install the print-agent (auto-start at logon)

From an **elevated** PowerShell (Run as administrator), in the repo root:

```bash
powershell -ExecutionPolicy Bypass -File scripts\install-print-agent.ps1
```

This builds the agent and registers the **"POS Print Agent"** logon Scheduled Task,
then starts it. Agent output is logged to `print-agent.log` in the repo root.

> **USB printing** needs the optional native module `@thiagoelg/node-printer`.
> `pnpm install` tries to fetch a prebuilt binary; if none exists for this machine,
> **network printing still works** and USB falls back to on-screen rendering. To
> enable USB, install **VS Build Tools ("Desktop development with C++")** + **Python 3**,
> then re-run `pnpm install` and restart the task.

Manage the task:

```bash
Get-ScheduledTask 'POS Print Agent' | Get-ScheduledTaskInfo   # status / last result
Stop-ScheduledTask  'POS Print Agent'
Start-ScheduledTask 'POS Print Agent'
Unregister-ScheduledTask -TaskName 'POS Print Agent'          # remove
```

---

## Step 4 — Make it unattended after reboot (Windows auto-login)

Docker Desktop and the print-agent both start **after a user signs in**. For a till
that should come up on its own after a power cycle, enable auto-login for the till user:

1. `Win+R` → `netplwiz` → select the till user → untick **"Users must enter a user
   name and password to use this computer"** → Apply → enter the password.
   (If that checkbox is hidden, enable it via `reg add
   "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device" /v
   DevicePasswordLessBuildVersion /t REG_DWORD /d 0 /f`, then re-open `netplwiz`.)

> **Security note:** auto-login means anyone who powers on the PC reaches the desktop.
> Use it only on a physically controlled till, on a dedicated low-privilege-in-spirit
> account, and rely on the POS app's own login (admin / staff PINs) for access control.

---

## Step 5 — Reboot test (proves it's turnkey)

1. **Restart Windows.**
2. After auto-login, wait ~1 minute for Docker Desktop to start the containers.
3. Open http://localhost:3000 — the app loads and data is intact.
4. `Get-ScheduledTask 'POS Print Agent' | Get-ScheduledTaskInfo` → `LastTaskResult 0`
   (or check `print-agent.log`).
5. Place a test order: the kitchen/bar KOT prints to the network printer and the
   customer bill prints to the USB receipt printer — with **no manual startup**.

---

## Notes & caveats

- **`restart: always`** brings `db`/`api`/`web` back after crashes and reboots;
  `migrate` is one-shot and idempotent (deploy + seed-if-empty).
- **The UI is baked for use *on the till*.** `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`
  are compiled into the web bundle as `http://localhost:4000` (Docker **build args** in
  `docker-compose.yml`). If you also want waiters using the POS from **LAN tablets**,
  rebuild with the till's LAN IP, e.g.:
  ```bash
  docker compose build --build-arg NEXT_PUBLIC_API_URL=http://192.168.1.50:4000 --build-arg NEXT_PUBLIC_WS_URL=http://192.168.1.50:4000 web
  docker compose up -d
  ```
  and set the API's `CORS_ORIGIN` to that tablet-facing origin.
- **Production secrets:** change `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and
  `PRINT_AGENT_TOKEN` in `docker-compose.yml` (and keep the agent's `.env`
  `PRINT_AGENT_TOKEN` equal to the API's).
- **A "true" pre-login Windows service** (starts before any sign-in) is possible with
  [nssm](https://nssm.cc/) wrapping `pnpm --filter @pos/print-agent run start:svc`, but
  Docker Desktop itself only starts after login, so auto-login is required regardless.
```
