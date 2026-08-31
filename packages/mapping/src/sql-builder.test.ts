import type { EntityMapping } from '@homework-portal/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './introspection-snapshot';
import { buildEntitySelect } from './sql-builder';

const mssqlQuote = (name: string) => `[${name.replace(/]/g, ']]')}]`;

describe('buildEntitySelect', () => {
  const snapshot = buildSnapshot({
    'dbo.TBL_STU_MST': ['STU_ID', 'STU_FNAME', 'STU_LNAME', 'CLS_ID', 'ACTIVE_FLG'],
  });

  const mapping: EntityMapping = {
    sourceTable: 'dbo.TBL_STU_MST',
    nameStrategy: 'concat',
    nameSeparator: ' ',
    fields: {
      student_id: 'STU_ID',
      full_name: ['STU_FNAME', 'STU_LNAME'],
      class_ref: 'CLS_ID',
    },
    filters: [{ column: 'ACTIVE_FLG', op: '=', value: 'Y' }],
  };

  it('builds a valid parameterised SELECT with ORDER BY on the primary field', () => {
    const { sql, params } = buildEntitySelect('student', mapping, snapshot, 'mssql', mssqlQuote);
    expect(sql).toContain('FROM [dbo].[TBL_STU_MST]');
    expect(sql).toContain('ORDER BY [STU_ID]');
    expect(sql).toContain('WHERE [ACTIVE_FLG] = ?');
    expect(params).toEqual(['Y']);
  });

  it('rejects a mapping that points at a column not in the live snapshot', () => {
    const malicious: EntityMapping = {
      ...mapping,
      fields: { ...mapping.fields, student_id: 'STU_ID; DROP TABLE TBL_STU_MST--' },
    };
    expect(() => buildEntitySelect('student', malicious, snapshot, 'mssql', mssqlQuote)).toThrow();
  });

  it('rejects a mapping whose source table is not in the snapshot', () => {
    const malicious: EntityMapping = { ...mapping, sourceTable: 'dbo.NOT_A_REAL_TABLE' };
    expect(() => buildEntitySelect('student', malicious, snapshot, 'mssql', mssqlQuote)).toThrow();
  });

  it('throws when the primary identifier field is unmapped (would break pagination)', () => {
    const noId: EntityMapping = {
      ...mapping,
      fields: { full_name: mapping.fields.full_name!, class_ref: mapping.fields.class_ref! },
    };
    expect(() => buildEntitySelect('student', noId, snapshot, 'mssql', mssqlQuote)).toThrow();
  });
});
