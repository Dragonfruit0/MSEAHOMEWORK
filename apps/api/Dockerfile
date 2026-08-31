# Built from the monorepo root: docker build -f apps/api/Dockerfile .
FROM node:20-bookworm-slim AS build
WORKDIR /repo

# Workspace package.json files must all be present before `npm ci` so npm
# can resolve the workspace graph correctly — copying just apps/api's would
# make `@homework-portal/*: "*"` unresolvable.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db-adapters/package.json packages/db-adapters/package.json
COPY packages/mapping/package.json packages/mapping/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/db-adapters packages/db-adapters
COPY packages/mapping packages/mapping
RUN npm run build:packages && npm run build --workspace=apps/api

# One image serves both the running API (`node dist/server.js`) and, as a
# one-off (`docker compose run api npm run migrate`), the knex CLI — which
# needs the TypeScript source and its dev tooling (sucrase) to load
# src/db/knexfile.ts, not just the compiled dist/. Keeping this as a single
# stage (rather than a slimmed-down runtime copy) trades image size for not
# having to duplicate that toolchain into a second stage.
ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
