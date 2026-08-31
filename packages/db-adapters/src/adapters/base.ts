import knex, { Knex } from 'knex';
import { assertReadOnlySelect } from '../guard';
import type { ConnectionConfig, DbAdapter, Engine } from '../types';

/**
 * Shared plumbing for all four engine adapters: pool lifecycle, the
 * read-only guard, batch streaming. Concrete adapters only need to supply
 * introspection SQL and identifier quoting, since those differ per dialect.
 */
export abstract class BaseAdapter implements DbAdapter {
  abstract readonly engine: Engine;
  protected readonly kx: Knex;

  constructor(protected readonly config: ConnectionConfig, knexClient: Knex.Config['client'], connection: unknown) {
    this.kx = knex({
      client: knexClient,
      connection: connection as Knex.StaticConnectionConfig,
      pool: { min: 0, max: 5 },
    });
  }

  abstract testConnection(): ReturnType<DbAdapter['testConnection']>;
  abstract listSchemas(): ReturnType<DbAdapter['listSchemas']>;
  abstract listTables(schema: string): ReturnType<DbAdapter['listTables']>;
  abstract listColumns(schema: string, table: string): ReturnType<DbAdapter['listColumns']>;
  abstract detectForeignKeys(schema: string, table: string): ReturnType<DbAdapter['detectForeignKeys']>;
  abstract quoteIdent(name: string): string;

  async sampleRows(schema: string, table: string, limit: number): Promise<Record<string, unknown>[]> {
    const qualified = `${this.quoteIdent(schema)}.${this.quoteIdent(table)}`;
    const capped = Math.min(Math.max(limit, 1), 200);
    const rows = await this.kx.raw(this.buildLimitedSelect(qualified, capped));
    return this.unwrapRows(rows);
  }

  async runQuery(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    assertReadOnlySelect(sql);
    const result = await this.kx.raw(sql, params as Knex.RawBinding[]);
    return this.unwrapRows(result);
  }

  async streamQuery(
    sql: string,
    params: unknown[] | undefined,
    batchSize: number,
    onBatch: (rows: Record<string, unknown>[]) => Promise<void>
  ): Promise<number> {
    assertReadOnlySelect(sql);
    let total = 0;
    let offset = 0;
    // Portable batching via the guarded SQL wrapped once per page. Engine
    // adapters supply pagination that fits their dialect.
    for (;;) {
      const page = this.wrapPaginated(sql, batchSize, offset);
      const result = await this.kx.raw(page, (params ?? []) as Knex.RawBinding[]);
      const rows = this.unwrapRows(result);
      if (rows.length === 0) break;
      await onBatch(rows);
      total += rows.length;
      offset += batchSize;
      if (rows.length < batchSize) break;
    }
    return total;
  }

  async close(): Promise<void> {
    await this.kx.destroy();
  }

  protected abstract buildLimitedSelect(qualifiedTable: string, limit: number): string;
  protected abstract wrapPaginated(sql: string, limit: number, offset: number): string;

  /** Knex's raw() return shape differs per driver; normalise to an array of row objects. */
  protected unwrapRows(result: unknown): Record<string, unknown>[] {
    const r = result as { rows?: unknown[] } | unknown[];
    if (Array.isArray(r)) return r as Record<string, unknown>[];
    if (r && Array.isArray((r as { rows?: unknown[] }).rows)) {
      return (r as { rows: unknown[] }).rows as Record<string, unknown>[];
    }
    return [];
  }
}
