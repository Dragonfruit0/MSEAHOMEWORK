import path from 'path';
import dotenv from 'dotenv';
import type { Knex } from 'knex';

// The knex CLI changes process.cwd() to the migrations directory before this
// file runs, so a bare `dotenv/config` (which loads relative to cwd) would
// silently miss apps/api/.env. Load it by an explicit path instead.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Used only by the `knex` CLI for running/rolling back migrations. */
const config: Knex.Config = {
  client: process.env.PORTAL_DB_CLIENT ?? 'pg',
  connection: {
    host: process.env.PORTAL_DB_HOST ?? 'localhost',
    port: Number(process.env.PORTAL_DB_PORT ?? 5432),
    database: process.env.PORTAL_DB_NAME ?? 'homework_portal',
    user: process.env.PORTAL_DB_USER ?? 'postgres',
    password: process.env.PORTAL_DB_PASSWORD ?? 'postgres',
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    tableName: 'hp_knex_migrations',
  },
};

export default config;
