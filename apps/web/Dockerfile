# Built from the monorepo root: docker build -f apps/web/Dockerfile .
FROM node:20-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db-adapters/package.json packages/db-adapters/package.json
COPY packages/mapping/package.json packages/mapping/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
RUN npm run build --workspace=packages/shared

COPY apps/web apps/web
RUN npm run build --workspace=apps/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
