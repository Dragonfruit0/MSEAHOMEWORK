import { BaseAdapter } from './base';
import type { ColumnInfo, ConnectionConfig, FkInfo, TableInfo, TestConnectionResult } from '../types';

export class MysqlAdapter extends BaseAdapter {
  readonly engine = 'mysql' as const;

  constructor(config: ConnectionConfig) {
    super(config, 'mysql2', {
      host: config.host,
      port: config.port ?? 3306,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? {} : undefined,
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
       where schema_name not in ('mysql','information_schema','performance_schema','sys')
       order by schema_name`
    );
    return this.unwrapRows(rows).map((r) => r.schema_name ?? r.SCHEMA_NAME) as string[];
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const rows = await this.kx.raw(
      `select table_name, table_rows from information_schema.tables
       where table_schema = ? and table_type = 'BASE TABLE'
       order by table_name`,
      [schema]
    );
    return this.unwrapRows(rows).map((r) => ({
      schema,
      name: (r.table_name ?? r.TABLE_NAME) as string,
      approxRowCount: Number(r.table_rows ?? r.TABLE_ROWS ?? 0),
    }));
  }

  async listColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.kx.raw(
      `select column_name, data_type, is_nullable, character_maximum_length, column_key
       from information_schema.columns
       where table_schema = ? and table_name = ?
       order by ordinal_position`,
      [schema, table]
    );
    return this.unwrapRows(rows).map((r) => ({
      name: (r.column_name ?? r.COLUMN_NAME) as string,
      dataType: (r.data_type ?? r.DATA_TYPE) as string,
      nullable: (r.is_nullable ?? r.IS_NULLABLE) === 'YES',
      isPrimaryKey: (r.column_key ?? r.COLUMN_KEY) === 'PRI',
      maxLength: r.character_maximum_length ? Number(r.character_maximum_length) : undefined,
    }));
  }

  async detectForeignKeys(schema: string, table: string): Promise<FkInfo[]> {
    const rows = await this.kx.raw(
      `select column_name, referenced_table_schema, referenced_table_name, referenced_column_name
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and referenced_table_name is not null`,
      [schema, table]
    );
    return this.unwrapRows(rows).map((r) => ({
      fromTable: `${schema}.${table}`,
      fromColumn: (r.column_name ?? r.COLUMN_NAME) as string,
      toTable: `${r.referenced_table_schema ?? r.REFERENCED_TABLE_SCHEMA}.${r.referenced_table_name ?? r.REFERENCED_TABLE_NAME}`,
      toColumn: (r.referenced_column_name ?? r.REFERENCED_COLUMN_NAME) as string,
    }));
  }

  quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
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
