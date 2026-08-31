export type Engine = 'mssql' | 'mysql' | 'postgres' | 'oracle';

export const ENGINE_DEFAULT_PORT: Record<Engine, number> = {
  mssql: 1433,
  mysql: 3306,
  postgres: 5432,
  oracle: 1521,
};

export interface ConnectionConfig {
  engine: Engine;
  host: string;
  port?: number;
  /** Database name for mssql/mysql/postgres, or Oracle service name */
  database: string;
  /** Default schema to browse first: dbo / public / the Oracle owner, etc. */
  schema?: string;
  user: string;
  password: string;
  ssl?: boolean;
  /** mssql on-prem instances with self-signed certs */
  trustServerCertificate?: boolean;
  /** mssql: ApplicationIntent=ReadOnly against an AG readable secondary */
  readOnlyIntent?: boolean;
  /** Oracle: use serviceName instead of SID */
  connectString?: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  approxRowCount?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  maxLength?: number;
}

export interface FkInfo {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface TestConnectionResult {
  ok: boolean;
  serverVersion?: string;
  error?: string;
}

/**
 * One interface, four drivers. Every method here must be safe to call against
 * a school's live production database: read-only, bounded, and defensive
 * about identifiers that come from admin-picked (but still untrusted) input.
 */
export interface DbAdapter {
  readonly engine: Engine;
  testConnection(): Promise<TestConnectionResult>;
  listSchemas(): Promise<string[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  listColumns(schema: string, table: string): Promise<ColumnInfo[]>;
  detectForeignKeys(schema: string, table: string): Promise<FkInfo[]>;
  sampleRows(schema: string, table: string, limit: number): Promise<Record<string, unknown>[]>;
  /**
   * Runs a fully pre-built, parameterised SELECT. Rejects anything that is
   * not unambiguously a single read-only SELECT statement.
   */
  runQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Streams rows in batches for large-table sync without loading 40k rows into memory. */
  streamQuery(
    sql: string,
    params: unknown[] | undefined,
    batchSize: number,
    onBatch: (rows: Record<string, unknown>[]) => Promise<void>
  ): Promise<number>;
  /** Quote an identifier per this engine's dialect (double-quote, backtick, brackets...). */
  quoteIdent(name: string): string;
  close(): Promise<void>;
}
