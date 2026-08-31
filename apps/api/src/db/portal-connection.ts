import knex, { Knex } from 'knex';

/**
 * The PORTAL plane connection: our own hp_* tables. Unlike the source-school
 * connection (see packages/db-adapters), this one is read-write and its
 * location is fixed for the process lifetime via env vars — chosen once by
 * the admin in setup wizard step 6, then written to .env / deployment config.
 *
 * We deliberately do NOT let the portal DB location be reconfigured through
 * a running server the way the source DB can: changing where your own
 * application state lives needs a restart and a migration run, not a
 * click in a wizard.
 */
export interface PortalDbConfig {
  client: 'pg' | 'mysql2' | 'mssql';
  connection: Knex.StaticConnectionConfig;
}

function loadPortalDbConfig(): PortalDbConfig {
  const client = (process.env.PORTAL_DB_CLIENT as PortalDbConfig['client']) ?? 'pg';
  return {
    client,
    connection: {
      host: process.env.PORTAL_DB_HOST ?? 'localhost',
      port: Number(process.env.PORTAL_DB_PORT ?? 5432),
      database: process.env.PORTAL_DB_NAME ?? 'homework_portal',
      user: process.env.PORTAL_DB_USER ?? 'postgres',
      password: process.env.PORTAL_DB_PASSWORD ?? 'postgres',
    },
  };
}

let instance: Knex | null = null;

export function portalDb(): Knex {
  if (!instance) {
    const cfg = loadPortalDbConfig();
    instance = knex({
      client: cfg.client,
      connection: cfg.connection,
      pool: { min: 1, max: 10 },
    });
  }
  return instance;
}

export async function closePortalDb(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
  }
}
