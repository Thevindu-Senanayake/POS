# Deploying the Hospitality POS to a DigitalOcean droplet (CI/CD)

The **web admin portal** (`@pos/web`) and the **API** (`@pos/api`) deploy to a single
DigitalOcean droplet via GitHub Actions:

```
push to main  →  GitHub Actions builds 2 images  →  GHCR  →  droplet pulls & rolls over
```

- **Web** ships as a Next.js **static export** served by **nginx on port 80**.
- **API** runs as a Node container **exposed directly on port 4000** (no reverse proxy).
- **Postgres** stays a container on the droplet (volume `pos_pgdata`), **not published** —
  only the API reaches it over the compose network.
- Public host is the droplet's **bare IP over plain HTTP** (no TLS/domain yet — see
  [Adding TLS later](#adding-tls-later)).

> **Printing is not part of this deploy.** Receipt/KOT printing is handled by the
> **Electron till** (`apps/till`), which folds the print host into its main process and
> drives the Windows printer drivers directly. It authenticates to this API with
> `PRINT_AGENT_TOKEN` and runs on the on-prem till PC — the standalone `apps/print-agent`
> is retired.

---

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| `.github/workflows/deploy.yml` | GitHub Actions | Builds `pos-api` + `pos-web`, pushes to GHCR, SSHes to the droplet, rolls the stack over, smoke-checks. |
| `Dockerfile` (targets `api`, `web`) | repo | One multi-stage build → two images. `--target api` = Node runtime; `--target web` = nginx + static export. |
| `docker-compose.prod.yml` | copied to `/opt/pos` on the droplet | **Pulls** the GHCR images (dev's `docker-compose.yml` builds them locally instead). |
| `deploy/nginx.conf` | baked into `pos-web` | SPA/deep-link routing for the flat export (`/admin/inventory` → `admin/inventory.html`). |
| `/opt/pos/.env` | droplet only, **never in git** | All runtime secrets (JWT, Postgres creds, `PRINT_AGENT_TOKEN`, `CORS_ORIGIN`, `GHCR_OWNER`). |

Images are published as `ghcr.io/<owner>/pos-api` and `ghcr.io/<owner>/pos-web`, tagged
both `:latest` and `:<commit-sha>` (the SHA tag is what a deploy pins, so rollback is exact).

---

## One-time GitHub setup

In the repo → **Settings → Secrets and variables → Actions**:

**Secrets** (encrypted):

| Secret | Value |
|---|---|
| `SSH_HOST` | droplet public IP |
| `SSH_USER` | deploy user (e.g. `deploy` or `root`) |
| `SSH_KEY` | **private** half of the deploy SSH key (PEM) |
| `SSH_PORT` | *(optional)* SSH port if not `22` |
| `GHCR_USER` | GitHub username that can read the packages |
| `GHCR_TOKEN` | a **classic PAT with `read:packages`** — used by the droplet to pull |

> `GHCR_USER`/`GHCR_TOKEN` are only needed because GHCR packages start **private**.
> Alternatively make both packages public (GHCR → each package → *Package settings* →
> *Change visibility* → Public) and delete the `docker login` line from the workflow.

**Variables** (plain text — these are **baked into the web bundle** at build time):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://<droplet-ip>:4000` |
| `NEXT_PUBLIC_WS_URL`  | `http://<droplet-ip>:4000` |

> Because `NEXT_PUBLIC_*` are compiled into the static bundle, the `pos-web` image is
> **environment-specific**. If the droplet IP changes, update these variables and re-run
> the workflow so the bundle is rebuilt against the new origin.

---

## One-time droplet setup

The droplet is assumed already provisioned with **Docker Engine + compose plugin** and SSH.

1. **Deploy key** — add the deploy key's **public** half to `~/.ssh/authorized_keys` for
   `SSH_USER`. Confirm `ssh SSH_USER@SSH_HOST` works with the private key you put in `SSH_KEY`.

2. **Deploy dir** — the workflow copies the compose file to `/opt/pos`:
   ```bash
   sudo mkdir -p /opt/pos && sudo chown "$USER" /opt/pos
   ```

3. **`/opt/pos/.env`** — create it with the production values (this file is **never**
   committed; it is the only place secrets live on the droplet):
   ```dotenv
   # --- image source (GHCR) ---
   GHCR_OWNER=<your-github-owner-lowercased>   # e.g. thevindu-senanayake

   # --- Postgres (must agree with each other) ---
   POSTGRES_USER=pos
   POSTGRES_PASSWORD=<a-strong-password>
   POSTGRES_DB=pos

   # --- API secrets ---
   JWT_ACCESS_SECRET=<random-32+-chars>
   JWT_REFRESH_SECRET=<different-random-32+-chars>
   JWT_ACCESS_TTL=15m
   JWT_REFRESH_TTL=7d

   # Shared secret the Electron till uses to authenticate to the print queue.
   PRINT_AGENT_TOKEN=<random-secret>

   # CRITICAL: the browser origin when web is served on :80 has NO port suffix.
   CORS_ORIGIN=http://<droplet-ip>

   CURRENCY_SYMBOL=₨
   ```
   > `DATABASE_URL` is **not** set here — `docker-compose.prod.yml` derives the in-network
   > URL (`db:5432`) from `POSTGRES_*`. `NEXT_PUBLIC_*` are **not** set here either — they
   > are baked into `pos-web` at CI build time from the GitHub *variables* above.

4. **Firewall** — allow inbound **22** (SSH), **80** (web), **4000** (API); keep Postgres
   unexposed. With `ufw`:
   ```bash
   sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 4000 && sudo ufw enable
   ```
   (Or the equivalent DigitalOcean Cloud Firewall rules.)

---

## Deploying

- **Automatic:** push to `main`. Actions builds both images, pushes to GHCR, then SSHes in
  and runs `docker compose -f docker-compose.prod.yml pull && up -d` in `/opt/pos`, pinned
  to the commit SHA, and smoke-checks `:4000/api/health` and `/`.

- **Manual / re-deploy:** Actions → **Deploy** → **Run workflow** (leave *image tag* blank
  to build & deploy the current `main`).

Verify after a deploy:

- Web: `http://<droplet-ip>/` — sign in **admin** / **pos1234** (manager PIN **1234**).
- API: `http://<droplet-ip>:4000/api/health`.
- On the droplet: `docker compose -f /opt/pos/docker-compose.prod.yml ps` — `db`, `api`,
  `web` up; `migrate` exited `0`.

> **Seeding is safe.** `migrate` runs `prisma migrate deploy` then seeds **only if the DB
> has no users**, so every deploy is idempotent and never wipes live data.

---

## Rollback

Every build is tagged with its commit SHA, so rolling back is just redeploying an older tag:

- **From GitHub:** Actions → **Deploy** → **Run workflow** → set **image tag** to the older
  commit SHA. The build step is skipped; the droplet pulls and rolls over to that tag.
- **On the droplet directly:**
  ```bash
  cd /opt/pos
  IMAGE_TAG=<old-sha> docker compose -f docker-compose.prod.yml up -d
  ```

---

## Troubleshooting

- **Browser calls fail with CORS errors** — `CORS_ORIGIN` in `/opt/pos/.env` must be
  **exactly** the web origin, i.e. `http://<droplet-ip>` with **no port** (web is on :80).
  `http://<ip>:3000` or `:80` will be rejected. Edit `.env` and `docker compose … up -d api`.
- **Web loads but all API/WS calls go to `localhost:4000`** — the bundle was built without
  the GitHub *variables*. Set `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` and re-run the workflow.
- **Deep-link refresh 404s** (e.g. reloading `/admin/inventory`) — that's what
  `deploy/nginx.conf`'s `try_files $uri $uri.html … /index.html` handles; confirm the
  `pos-web` image includes it (`docker exec pos-web cat /etc/nginx/conf.d/default.conf`).
- **Droplet can't pull images** (`denied`/`unauthorized`) — the packages are private and the
  `docker login` failed: check `GHCR_USER`/`GHCR_TOKEN` (PAT needs `read:packages`), or make
  the packages public.
- **`api` unhealthy** — `docker compose -f /opt/pos/docker-compose.prod.yml logs api`;
  usually a missing/blank required secret in `.env` (the API fails fast at boot) or a
  `DATABASE_URL`/`POSTGRES_*` mismatch.

---

## Adding TLS later

Plain HTTP with the API on `:4000` is the current, explicit choice. To add HTTPS + a domain
without touching app code:

1. Put a TLS reverse proxy (Caddy or nginx + certbot) in front, terminating `:443` and
   proxying `/` → web and (optionally) `/api` + WebSocket → the API — ideally moving the API
   **same-origin** behind `/api` so the `:4000` port can be closed.
2. Update the GitHub *variables* to the `https://<domain>` origin (and `/api` base if you
   move it behind the proxy) and re-run the workflow to rebake the web bundle.
3. Set `CORS_ORIGIN=https://<domain>` in `/opt/pos/.env`.

Only the baked URLs and `CORS_ORIGIN` change — the application code is origin-agnostic.
