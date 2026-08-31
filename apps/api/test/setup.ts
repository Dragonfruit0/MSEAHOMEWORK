// Loaded once per test file via vitest's setupFiles, before any test or
// application module runs. Every value here is a default — an already-set
// env var (e.g. from CI or a local override) always wins, so this suite
// targets whatever Postgres a real deployment or CI service container
// provides without needing code changes.
process.env.PORTAL_DB_CLIENT ??= 'pg';
process.env.PORTAL_DB_HOST ??= 'localhost';
process.env.PORTAL_DB_PORT ??= '5432';
process.env.PORTAL_DB_NAME ??= 'homework_portal_test';
process.env.PORTAL_DB_USER ??= 'postgres';
process.env.PORTAL_DB_PASSWORD ??= 'postgres';
// A fixed, obviously-fake key — never use this for anything but tests.
process.env.PORTAL_MASTER_KEY ??= '0'.repeat(64);
process.env.JWT_SECRET ??= 'test-only-jwt-secret-do-not-use-in-any-real-deployment';

import path from 'path';
import knex from 'knex';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  const kx = knex({
    client: process.env.PORTAL_DB_CLIENT,
    connection: {
      host: process.env.PORTAL_DB_HOST,
      port: Number(process.env.PORTAL_DB_PORT),
      database: process.env.PORTAL_DB_NAME,
      user: process.env.PORTAL_DB_USER,
      password: process.env.PORTAL_DB_PASSWORD,
    },
    migrations: {
      directory: path.resolve(__dirname, '../src/db/migrations'),
      extension: 'ts',
      tableName: 'hp_knex_migrations',
    },
  });
  try {
    // Knex's migration lock table makes this safe even if another test
    // file's beforeAll races to migrate the same database concurrently.
    await kx.migrate.latest();
  } finally {
    await kx.destroy();
  }
});
