# ---------------------------------------------------------------------------
# Hospitality POS — one multi-stage Dockerfile producing TWO images via targets:
#   --target api : Node runtime for @pos/api (also used by the one-shot migrate)
#   --target web : nginx serving the @pos/web admin portal's static export (out/)
#
# CI (.github/workflows/deploy.yml) builds both targets, pushes them to GHCR, and
# the droplet pulls them (docker-compose.prod.yml). Locally, docker-compose.yml
# builds both targets too. The print host is folded into the Electron till
# (apps/till) and runs natively on Windows — nothing print-related is built here.
#
# The web bundle inlines NEXT_PUBLIC_* at BUILD time, so those URLs arrive as build
# ARGs on the `web` target (the browser runs on the host / the droplet's public IP).
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
# devDependencies (nest cli, tsc, next, tsx, prisma). It is set in the `api` stage.

# --- deps: install once, cached on the manifests + lockfile -----------------
FROM base AS deps
# Copy only what affects dependency resolution so this layer caches until a
# package.json or the lockfile actually changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json           apps/api/package.json
COPY apps/web/package.json           apps/web/package.json
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

# --- build-base: full source + @pos/shared (needed by BOTH api and web) -----
FROM deps AS build-base
COPY . .
RUN pnpm --filter @pos/shared build

# --- build-api: compile @pos/db (prisma generate + tsc) then @pos/api -------
FROM build-base AS build-api
RUN pnpm --filter @pos/db build \
  && pnpm --filter @pos/api build

# --- api: Node runtime, run by the api AND the one-shot migrate service ------
FROM base AS api
ENV NODE_ENV=production
# Bring the built workspace: node_modules (incl. the generated Prisma client),
# apps/api/dist, packages/*/dist, and the prisma migrations `migrate` applies.
COPY --from=build-api /app /app
# Default command; the migrate service overrides `command`.
CMD ["node", "apps/api/dist/main.js"]

# --- build-web: static export (out/) of the @pos/web admin portal -----------
FROM build-base AS build-web
# NEXT_PUBLIC_* are inlined into the bundle here. `exec next build` bypasses the
# package's dotenv wrapper (there is no .env in the image) and uses these ENV vars.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN pnpm --filter @pos/web exec next build

# --- web: nginx serving the static export ------------------------------------
FROM nginx:alpine AS web
# Replace the stock server block with our SPA/deep-link routing for the flat export.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /app/apps/web/out /usr/share/nginx/html
EXPOSE 80
