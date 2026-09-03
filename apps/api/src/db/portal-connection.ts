import knex, { Knex } from 'knex';
import pg from 'pg';

// node-postgres deserializes a plain SQL DATE column (no time-of-day) into a
// JS Date at LOCAL midnight, which then serializes to JSON via toISOString()
// as a UTC instant — shifting the calendar date backward by a day for any
// server not running in UTC (e.g. IST: Aug 27 local midnight becomes
// "2026-08-26T18:30:00.000Z"). hp_homework.assigned_date/due_date are exactly
// this type, and are read back naively as text (.slice(0, 10)) in more than
// one place (the calendar view keys marked days off this). Returning the
// raw "YYYY-MM-DD" string instead of a Date object removes the ambiguity
// at the source rather than compensating for it at every call site.
// OID 1082 = date.
pg.types.setTypeParser(1082, (val) => val);

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
      // Managed providers (Supabase included) require TLS and terminate it
      // with a cert chain node's default CA list won't validate — set
      // PORTAL_DB_SSL=true for those; leave unset for a local/Docker
      // Postgres that isn't listening for TLS at all.
      ...(process.env.PORTAL_DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
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
      // Small on purpose: in a serverless deployment, many function
      // instances can be warm concurrently, each holding its own pool —
      // the *aggregate* connection count across all of them is what has to
      // stay under the database's limit, not any single instance's pool.
      // Point a serverless deployment at a connection-pooling endpoint
      // (e.g. Supabase's transaction pooler) rather than raising this.
      pool: {
        min: Number(process.env.PORTAL_DB_POOL_MIN ?? 0),
        max: Number(process.env.PORTAL_DB_POOL_MAX ?? 5),
      },
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
