import { BaseAdapter } from './base';
import type { ColumnInfo, ConnectionConfig, FkInfo, TableInfo, TestConnectionResult } from '../types';

export class OracleAdapter extends BaseAdapter {
  readonly engine = 'oracle' as const;

  constructor(config: ConnectionConfig) {
    const connectString =
      config.connectString ?? `${config.host}:${config.port ?? 1521}/${config.database}`;
    super(config, 'oracledb', {
      user: config.user,
      password: config.password,
      connectString,
    });
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const rows = await this.kx.raw(`select banner as version from v$version where rownum = 1`);
      return { ok: true, serverVersion: this.unwrapRows(rows)[0]?.version as string };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async listSchemas(): Promise<string[]> {
    // In Oracle a "schema" is a user/owner. Restrict to owners that actually have tables.
    const rows = await this.kx.raw(
      `select distinct owner from all_tables
       where owner not in ('SYS','SYSTEM','OUTLN','DBSNMP','APPQOSSYS','WMSYS','XDB','CTXSYS','ORDDATA')
       order by owner`
    );
    return this.unwrapRows(rows).map((r) => (r.OWNER ?? r.owner) as string);
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const rows = await this.kx.raw(
      `select table_name, num_rows from all_tables where owner = ? order by table_name`,
      [schema.toUpperCase()]
    );
    return this.unwrapRows(rows).map((r) => ({
      schema,
      name: (r.TABLE_NAME ?? r.table_name) as string,
      approxRowCount: Number(r.NUM_ROWS ?? r.num_rows ?? 0),
    }));
  }

  async listColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.kx.raw(
      `select c.column_name, c.data_type, c.nullable, c.data_length,
              case when pk.column_name is not null then 1 else 0 end as is_pk
       from all_tab_columns c
       left join (
         select ucc.column_name
         from all_constraints uc
         join all_cons_columns ucc on ucc.constraint_name = uc.constraint_name and ucc.owner = uc.owner
         where uc.constraint_type = 'P' and uc.owner = ? and uc.table_name = ?
       ) pk on pk.column_name = c.column_name
       where c.owner = ? and c.table_name = ?
       order by c.column_id`,
      [schema.toUpperCase(), table.toUpperCase(), schema.toUpperCase(), table.toUpperCase()]
    );
    return this.unwrapRows(rows).map((r) => ({
      name: (r.COLUMN_NAME ?? r.column_name) as string,
      dataType: (r.DATA_TYPE ?? r.data_type) as string,
      nullable: (r.NULLABLE ?? r.nullable) === 'Y',
      isPrimaryKey: Boolean(r.IS_PK ?? r.is_pk),
      maxLength: Number(r.DATA_LENGTH ?? r.data_length ?? 0) || undefined,
    }));
  }

  async detectForeignKeys(schema: string, table: string): Promise<FkInfo[]> {
    const rows = await this.kx.raw(
      `select
         fkc.column_name as from_column,
         pk.owner as to_schema, pk.table_name as to_table, pkc.column_name as to_column
       from all_constraints fk
       join all_cons_columns fkc on fkc.constraint_name = fk.constraint_name and fkc.owner = fk.owner
       join all_constraints pk on pk.constraint_name = fk.r_constraint_name and pk.owner = fk.r_owner
       join all_cons_columns pkc on pkc.constraint_name = pk.constraint_name and pkc.owner = pk.owner
                                  and pkc.position = fkc.position
       where fk.constraint_type = 'R' and fk.owner = ? and fk.table_name = ?`,
      [schema.toUpperCase(), table.toUpperCase()]
    );
    return this.unwrapRows(rows).map((r) => ({
      fromTable: `${schema}.${table}`,
      fromColumn: (r.FROM_COLUMN ?? r.from_column) as string,
      toTable: `${r.TO_SCHEMA ?? r.to_schema}.${r.TO_TABLE ?? r.to_table}`,
      toColumn: (r.TO_COLUMN ?? r.to_column) as string,
    }));
  }

  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""').toUpperCase()}"`;
  }

  protected buildLimitedSelect(qualifiedTable: string, limit: number): string {
    return `select * from ${qualifiedTable} where rownum <= ${limit}`;
  }

  protected wrapPaginated(sql: string, limit: number, offset: number): string {
    // Contract with packages/mapping: sync SELECTs always carry a deterministic
    // ORDER BY over the entity's primary key. OFFSET/FETCH needs Oracle 12c+.
    if (!/order\s+by/i.test(sql)) {
      throw new Error('oracle pagination requires the base query to include an ORDER BY clause.');
    }
    return `${sql.replace(/;\s*$/, '')} offset ${offset} rows fetch next ${limit} rows only`;
  }
}
