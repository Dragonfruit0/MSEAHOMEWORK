# MSEA Homework Portal

A homework portal for MS Education Academy that plugs into whatever student
information database the school already runs — SQL Server, MySQL, PostgreSQL,
or Oracle — without hardcoding a single column name. An admin maps the
school's real tables/columns onto logical fields in a Power BI-style setup
wizard; everything downstream (teacher assignment, the homework feed,
submissions) reads through that mapping.

## Structure

```
apps/
  api/    Express + TypeScript backend
  web/    React + Vite frontend
packages/
  db-adapters/  One DbAdapter interface over mssql/mysql/postgres/oracle
  mapping/      Turns an admin's field mapping into safe, per-engine SQL
  shared/       Shared types (roles, mapping document shape)
```

## Getting started

```bash
npm install
cp .env.example .env   # then fill in PORTAL_MASTER_KEY, JWT_SECRET, portal DB creds
npm run migrate         # creates the hp_* tables in the portal database
npm run dev:api         # http://localhost:4000
npm run dev:web         # http://localhost:5173
```

On first run, the web app sends you to `/setup` — the wizard walks through:
connecting to the school's database, browsing its real schema, mapping
student/class/teacher fields onto physical columns, choosing where homework
attachments are stored, and running the first sync.

## Tests

```bash
npm test          # runs every workspace's test suite
npm run build     # type-checks + builds packages, then apps (in that order — see below)
```

Covers the read-only SQL guard, the mapping-to-SQL builder's rejection of
identifiers that aren't in the live introspected schema (the two places a
hostile or mistaken mapping could otherwise turn into arbitrary SQL against
the school's production database), and the MySQL adapter's row-unwrapping
(mysql2's raw() reply shape differs from every other supported engine).

`npm run build` builds `packages/*` before `apps/*` deliberately — the apps
resolve `@homework-portal/shared|db-adapters|mapping` through node_modules
symlinks pointing at each package's `dist/`, so building out of order fails
on a clean checkout.

## Running with Docker

```bash
cp .env.example .env   # fill in PORTAL_DB_PASSWORD, PORTAL_MASTER_KEY, JWT_SECRET
docker compose up --build -d
docker compose run --rm api npm run migrate   # first run only
```

- Web: http://localhost:8080 (nginx, proxies `/api` to the api container)
- API: http://localhost:4000
- Portal Postgres: localhost:5432 (host-exposed for inspection only)

The compose file only stands up the **portal's own** database — it has no
opinion on the school's source database, which lives wherever the school
already runs it and is reached from the setup wizard like any other
connection. Local-disk attachment storage persists in the `api-uploads`
volume; switch to S3 during setup for anything beyond a single-host deploy.

## Load testing at scale

The portal is sized around ~40,000 students. `scripts/seed-scale-fixture.mjs`
seeds a legacy-shaped source schema at a configurable size,
`scripts/seed-homework-volume.mjs` adds a school-year's worth of published
homework to the synced portal database, and `scripts/cleanup-scale-fixture.mjs`
removes both afterward. Point `PG_HOST`/`PG_PORT`/etc at a **scratch**
database — never production — then run the setup wizard's sync and check
`EXPLAIN ANALYZE` on the student feed query and real request latency.

## Brand

Colors and logo pulled directly from mseducationacademy.in: indigo `#2F2483`,
green `#00963F`, orange `#EF7F1A`.
