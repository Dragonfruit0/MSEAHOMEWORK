import { BaseAdapter } from './base';
import type { ColumnInfo, ConnectionConfig, FkInfo, TableInfo, TestConnectionResult } from '../types';

export class MssqlAdapter extends BaseAdapter {
  readonly engine = 'mssql' as const;

  constructor(config: ConnectionConfig) {
    super(config, 'mssql', {
      server: config.host,
      port: config.port ?? 1433,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: config.ssl ?? true,
        trustServerCertificate: config.trustServerCertificate ?? false,
        // Route reads to a readable secondary when the school's DB is in an
        // Availability Group, and signal intent even on a standalone instance.
        appName: 'homework-portal-readonly',
        readOnlyIntent: config.readOnlyIntent ?? true,
      },
    });
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const rows = await this.kx.raw('select @@version as version');
      return { ok: true, serverVersion: this.unwrapRows(rows)[0]?.version as string };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async listSchemas(): Promise<string[]> {
    const rows = await this.kx.raw(
      `select s.name as schema_name from sys.schemas s
       where s.name not in ('sys','guest','INFORMATION_SCHEMA','db_owner','db_accessadmin',
         'db_securityadmin','db_ddladmin','db_backupoperator','db_datareader','db_datawriter',
         'db_denydatareader','db_denydatawriter')
       order by s.name`
    );
    return this.unwrapRows(rows).map((r) => r.schema_name as string);
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const rows = await this.kx.raw(
      `select t.name as table_name, sum(p.rows) as approx_row_count
       from sys.tables t
       join sys.schemas s on s.schema_id = t.schema_id
       join sys.partitions p on p.object_id = t.object_id and p.index_id in (0,1)
       where s.name = ?
       group by t.name
       order by t.name`,
      [schema]
    );
    return this.unwrapRows(rows).map((r) => ({
      schema,
      name: r.table_name as string,
      approxRowCount: Number(r.approx_row_count ?? 0),
    }));
  }

  async listColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.kx.raw(
      `select c.name as column_name, ty.name as data_type, c.is_nullable, c.max_length,
              case when pk.column_id is not null then 1 else 0 end as is_pk
       from sys.columns c
       join sys.tables t on t.object_id = c.object_id
       join sys.schemas s on s.schema_id = t.schema_id
       join sys.types ty on ty.user_type_id = c.user_type_id
       left join (
         select ic.object_id, ic.column_id
         from sys.index_columns ic
         join sys.indexes i on i.object_id = ic.object_id and i.index_id = ic.index_id
         where i.is_primary_key = 1
       ) pk on pk.object_id = c.object_id and pk.column_id = c.column_id
       where s.name = ? and t.name = ?
       order by c.column_id`,
      [schema, table]
    );
    return this.unwrapRows(rows).map((r) => ({
      name: r.column_name as string,
      dataType: r.data_type as string,
      nullable: Boolean(r.is_nullable),
      isPrimaryKey: Boolean(r.is_pk),
      maxLength: r.max_length ? Number(r.max_length) : undefined,
    }));
  }

  async detectForeignKeys(schema: string, table: string): Promise<FkInfo[]> {
    const rows = await this.kx.raw(
      `select
         fc.name as from_column,
         rs.name as to_schema, rt.name as to_table, rc.name as to_column
       from sys.foreign_keys fk
       join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id
       join sys.tables t on t.object_id = fk.parent_object_id
       join sys.schemas s on s.schema_id = t.schema_id
       join sys.columns fc on fc.object_id = fkc.parent_object_id and fc.column_id = fkc.parent_column_id
       join sys.tables rt on rt.object_id = fk.referenced_object_id
       join sys.schemas rs on rs.schema_id = rt.schema_id
       join sys.columns rc on rc.object_id = fkc.referenced_object_id and rc.column_id = fkc.referenced_column_id
       where s.name = ? and t.name = ?`,
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
    return `[${name.replace(/]/g, ']]')}]`;
  }

  protected buildLimitedSelect(qualifiedTable: string, limit: number): string {
    return `select top ${limit} * from ${qualifiedTable}`;
  }

  protected wrapPaginated(sql: string, limit: number, offset: number): string {
    // SQL Server requires OFFSET/FETCH to follow an ORDER BY on the SAME
    // query (it can't be applied to a wrapping subquery). The contract with
    // packages/mapping is that every sync SELECT already ends with a
    // deterministic ORDER BY over the entity's primary key.
    if (!/order\s+by/i.test(sql)) {
      throw new Error('mssql pagination requires the base query to include an ORDER BY clause.');
    }
    return `${sql.replace(/;\s*$/, '')} offset ${offset} rows fetch next ${limit} rows only`;
  }
}
