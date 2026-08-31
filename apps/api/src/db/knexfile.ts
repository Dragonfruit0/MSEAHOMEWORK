import 'dotenv/config';
import type { Knex } from 'knex';

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
