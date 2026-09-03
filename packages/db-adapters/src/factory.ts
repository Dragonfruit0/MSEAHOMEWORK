import type { ConnectionConfig, DbAdapter } from './types';

/**
 * Lazily imports only the one engine adapter actually being used, rather
 * than eagerly importing all four (which pulls mssql/mysql2/oracledb into
 * every process regardless of which engine a deployment ever talks to).
 * Two concrete benefits, not just tidiness: a serverless bundler (e.g.
 * Vercel's) can code-split each adapter into its own chunk instead of
 * bundling oracledb's native bindings into every function, and a process
 * that only ever needs 'postgres' (e.g. this app's own portal connection)
 * never pays the require() cost of the other three.
 */
export async function createAdapter(config: ConnectionConfig): Promise<DbAdapter> {
  switch (config.engine) {
    case 'mssql': {
      const { MssqlAdapter } = await import('./adapters/mssql');
      return new MssqlAdapter(config);
    }
    case 'mysql': {
      const { MysqlAdapter } = await import('./adapters/mysql');
      return new MysqlAdapter(config);
    }
    case 'postgres': {
      const { PostgresAdapter } = await import('./adapters/postgres');
      return new PostgresAdapter(config);
    }
    case 'oracle': {
      const { OracleAdapter } = await import('./adapters/oracle');
      return new OracleAdapter(config);
    }
    default: {
      const exhaustive: never = config.engine;
      throw new Error(`Unsupported engine: ${exhaustive}`);
    }
  }
}
