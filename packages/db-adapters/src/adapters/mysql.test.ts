import { describe, expect, it } from 'vitest';
import { MysqlAdapter } from './mysql';

/**
 * Regression test for a real bug: mysql2's raw() reply is a [rows, fields]
 * tuple. The shared BaseAdapter.unwrapRows treats any array as "the rows"
 * directly, so without MysqlAdapter's override every introspection method
 * (listTables, listColumns, sampleRows, ...) silently returned garbage —
 * the tuple's two elements themselves, not the actual row objects.
 */
describe('MysqlAdapter.unwrapRows', () => {
  const adapter = new MysqlAdapter({
    engine: 'mysql',
    host: 'localhost',
    database: 'unused',
    user: 'unused',
    password: 'unused',
  });
  const unwrap = (adapter as unknown as { unwrapRows(result: unknown): Record<string, unknown>[] }).unwrapRows.bind(
    adapter
  );

  it('unwraps the [rows, fields] tuple mysql2 actually returns', () => {
    const rows = [{ id: 1, name: 'Ananya' }, { id: 2, name: 'Rohan' }];
    const fields = [{ name: 'id' }, { name: 'name' }];
    expect(unwrap([rows, fields])).toEqual(rows);
  });

  it('falls back to the base behavior for a plain row array', () => {
    const rows = [{ id: 1 }];
    expect(unwrap(rows)).toEqual(rows);
  });

  it('falls back to the base behavior for a { rows } shaped result', () => {
    const rows = [{ id: 1 }];
    expect(unwrap({ rows })).toEqual(rows);
  });

  it('returns an empty array for an unrecognized shape', () => {
    expect(unwrap(undefined)).toEqual([]);
  });
});
