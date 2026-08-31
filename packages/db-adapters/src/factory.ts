import { MssqlAdapter } from './adapters/mssql';
import { MysqlAdapter } from './adapters/mysql';
import { OracleAdapter } from './adapters/oracle';
import { PostgresAdapter } from './adapters/postgres';
import type { ConnectionConfig, DbAdapter } from './types';

export function createAdapter(config: ConnectionConfig): DbAdapter {
  switch (config.engine) {
    case 'mssql':
      return new MssqlAdapter(config);
    case 'mysql':
      return new MysqlAdapter(config);
    case 'postgres':
      return new PostgresAdapter(config);
    case 'oracle':
      return new OracleAdapter(config);
    default: {
      const exhaustive: never = config.engine;
      throw new Error(`Unsupported engine: ${exhaustive}`);
    }
  }
}
