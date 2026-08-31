import { BaseAdapter } from './base';
import type { ColumnInfo, ConnectionConfig, FkInfo, TableInfo, TestConnectionResult } from '../types';

export class PostgresAdapter extends BaseAdapter {
  readonly engine = 'postgres' as const;

  constructor(config: ConnectionConfig) {
    super(config, 'pg', {
      host: config.host,
      port: config.port ?? 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      // Read-only intent: refuse writes at the session level as defense in depth.
      options: '-c default_transaction_read_only=on',
    });
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const rows = await this.kx.raw('select version() as version');
      return { ok: true, serverVersion: this.unwrapRows(rows)[0]?.version as string };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async listSchemas(): Promise<string[]> {
    const rows = await this.kx.raw(
      `select schema_name from information_schema.schemata
       where schema_name not in ('pg_catalog','information_schema','pg_toast')
       order by schema_name`
    );
    return this.unwrapRows(rows).map((r) => r.schema_name as string);
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const rows = await this.kx.raw(
      `select c.relname as name, coalesce(c.reltuples, 0)::bigint as approx_row_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = ? and c.relkind = 'r'
       order by c.relname`,
      [schema]
    );
    return this.unwrapRows(rows).map((r) => ({
      schema,
      name: r.name as string,
      approxRowCount: Number(r.approx_row_count ?? 0),
    }));
  }

  async listColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.kx.raw(
      `select col.column_name, col.data_type, col.is_nullable, col.character_maximum_length,
              exists (
                select 1 from information_schema.table_constraints tc
                join information_schema.key_column_usage kcu
                  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
                where tc.constraint_type = 'PRIMARY KEY'
                  and tc.table_schema = col.table_schema and tc.table_name = col.table_name
                  and kcu.column_name = col.column_name
              ) as is_pk
       from information_schema.columns col
       where col.table_schema = ? and col.table_name = ?
       order by col.ordinal_position`,
      [schema, table]
    );
    return this.unwrapRows(rows).map((r) => ({
      name: r.column_name as string,
      dataType: r.data_type as string,
      nullable: r.is_nullable === 'YES',
      isPrimaryKey: Boolean(r.is_pk),
      maxLength: r.character_maximum_length ? Number(r.character_maximum_length) : undefined,
    }));
  }

  async detectForeignKeys(schema: string, table: string): Promise<FkInfo[]> {
    const rows = await this.kx.raw(
      `select kcu.column_name as from_column, ccu.table_schema as to_schema,
              ccu.table_name as to_table, ccu.column_name as to_column
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = ? and tc.table_name = ?`,
      [schema, table]
    );
    return this.unwrapRows(rows).map((r) => ({
      fromTable: `${schema}.${table}`,
      fromColumn: r.from_column as string,
      toTable: `${r.to_schema}.${r.to_table}`,
      toColumn: r.to_column as string,
    }));
  }

  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  protected buildLimitedSelect(qualifiedTable: string, limit: number): string {
    return `select * from ${qualifiedTable} limit ${limit}`;
  }

  protected wrapPaginated(sql: string, limit: number, offset: number): string {
    // Contract with packages/mapping: sync SELECTs always carry a deterministic
    // ORDER BY over the entity's primary key, so LIMIT/OFFSET pages are stable.
    return `${sql.replace(/;\s*$/, '')} limit ${limit} offset ${offset}`;
  }
}
