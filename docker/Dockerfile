# syntax=docker/dockerfile:1
#
# One file builds every image of the project, so that dependencies are installed
# and the workspace compiled only once. Pick an image with `--target`.
#
# Base images are pinned by digest; the tag is only there for readers.

ARG NODE_IMAGE=node:26-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:stable-alpine@sha256:56b8272e43a0525f67aed68d1e0794a712d10e3e45a563e118e9a77c817e6f86
# Its browsers must be those of the playwright-core version in apps/worker/package.json:
# a test checks that the two stay in step.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f

# ---------------------------------------------------------------- build stage
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NG_CLI_ANALYTICS=false
# Keep in step with "packageManager" in package.json.
RUN npm install --global --no-fund --no-audit pnpm@12.11.2
WORKDIR /repo

# Dependencies first: this layer is reused as long as the lockfile does not change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN pnpm --recursive run build

# Self-contained production trees: compiled code and production dependencies only.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @rampe/api deploy --prod /out/api && \
    pnpm --filter @rampe/worker deploy --prod /out/worker && \
    pnpm --filter @rampe/fixture-site deploy --prod /out/fixture-site

# ------------------------------------------------------------------ migrate
# Applies the database migrations, once, before the API starts. The Prisma
# migration engine is fetched now: at run time the database network has no
# way out.
FROM build AS migrate
WORKDIR /repo/apps/api
RUN node node_modules/prisma/build/index.js version >/dev/null
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# -------------------------------------------------------------- Node services
FROM ${NODE_IMAGE} AS node-runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

FROM node-runtime AS api
COPY --from=build --chown=node:node /out/api ./
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node-runtime AS worker
COPY --from=build --chown=node:node /out/worker ./
CMD ["node", "dist/main.js"]

FROM node-runtime AS fixture-site
COPY --from=build --chown=node:node /out/fixture-site ./
EXPOSE 80
CMD ["node", "dist/main.js"]

# -------------------------------------------------------------------- browser
# Chromium, driven by the worker. Runs as the image's unprivileged pwuser.
FROM ${PLAYWRIGHT_IMAGE} AS browser
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=pwuser:pwuser /out/worker ./
USER pwuser
EXPOSE 3000
CMD ["node", "dist/browser-server/main.js"]

# ------------------------------------------------------------------------ web
FROM ${NGINX_IMAGE} AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
