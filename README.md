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
npm run test --workspace=@homework-portal/db-adapters
npm run test --workspace=@homework-portal/mapping
```

Covers the read-only SQL guard and the mapping-to-SQL builder's rejection of
identifiers that aren't in the live introspected schema — the two places a
hostile or mistaken mapping could otherwise turn into arbitrary SQL against
the school's production database.

## Brand

Colors and logo pulled directly from mseducationacademy.in: indigo `#2F2483`,
green `#00963F`, orange `#EF7F1A`.
