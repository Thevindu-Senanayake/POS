# ---------------------------------------------------------------------------
# Hospitality POS — one multi-stage image shared by the api, web and migrate
# compose services (see docker-compose.yml). The print-agent is deliberately
# NOT built here: it runs natively on the Windows till so it can drive the USB
# print spooler (see scripts/install-print-agent.ps1 and DEPLOY.md).
#
# Build order follows the workspace graph:
#   @pos/shared -> @pos/db (prisma generate + tsc) -> @pos/api -> @pos/web
# The web bundle inlines NEXT_PUBLIC_* at build time, so those URLs arrive as
# build ARGs. The browser runs on the host, so they point at the host-published
# API port (http://localhost:4000), not the in-network service name.
# ---------------------------------------------------------------------------

# --- base: node + pnpm, shared by every stage -------------------------------
FROM node:22-bookworm-slim AS base
# openssl + ca-certificates: required by Prisma's query engine at generate/runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
# NB: NODE_ENV is intentionally NOT set to production here — the build needs
# devDependencies (nest cli, tsc, next, tsx, prisma). It is set in `runtime`.

# --- deps: install once, cached on the manifests + lockfile -----------------
FROM base AS deps
# Copy only what affects dependency resolution so this layer caches until a
# package.json or the lockfile actually changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json           apps/api/package.json
COPY apps/web/package.json           apps/web/package.json
COPY apps/print-agent/package.json   apps/print-agent/package.json
COPY apps/till/package.json          apps/till/package.json
COPY apps/till/ui/package.json       apps/till/ui/package.json
COPY packages/db/package.json        packages/db/package.json
COPY packages/shared/package.json    packages/shared/package.json
COPY packages/client-core/package.json packages/client-core/package.json
COPY packages/tsconfig/package.json  packages/tsconfig/package.json
# The Prisma schema is present so @prisma/client's postinstall has what it needs;
# the client is regenerated authoritatively in the build stage regardless.
COPY packages/db/prisma              packages/db/prisma
# @pos/till (the Electron desktop shell) is a workspace member, so the frozen
# install must see its manifest — but Electron's ~170 MB prebuilt binary is
# useless in a Linux server image (the till runs natively on Windows). Skip it.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

# --- build: compile shared -> db -> api, then the web bundle ----------------
FROM deps AS build
COPY . .
# NEXT_PUBLIC_* are inlined into the web bundle at build time; the browser runs
# on the host and reaches the API on the host-published port.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN pnpm --filter @pos/shared build \
  && pnpm --filter @pos/db build \
  && pnpm --filter @pos/api build \
  && pnpm --filter @pos/web exec next build

# --- runtime: the built workspace, run by the api/web/migrate services ------
FROM base AS runtime
ENV NODE_ENV=production
# Bring the whole built workspace: node_modules (incl. the generated Prisma
# client), apps/*/dist, apps/web/.next, packages/*/dist, and the prisma
# migrations the `migrate` service needs.
COPY --from=build /app /app
# Default command; each compose service overrides `command`.
CMD ["node", "apps/api/dist/main.js"]
