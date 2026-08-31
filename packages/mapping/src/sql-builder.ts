import type { Engine } from '@homework-portal/db-adapters';
import { assertKnownIdentifier } from '@homework-portal/db-adapters';
import type { EntityMapping, EntityMappingDocument, LogicalEntityName } from '@homework-portal/shared';
import { type IntrospectionSnapshot, snapshotColumns } from './introspection-snapshot';

/**
 * Turns an admin-authored EntityMappingDocument into a parameterised,
 * per-engine SELECT statement. This is the single place in the whole system
 * that is allowed to know the school's real column names — and it treats
 * those names as untrusted right up until the moment it checks them against
 * a live introspection snapshot.
 *
 * Contract with packages/db-adapters: every generated SELECT ends with a
 * deterministic ORDER BY over the entity's primary identifier column, so the
 * adapters' batch-pagination (LIMIT/OFFSET or OFFSET/FETCH) is stable across
 * pages — required for syncing 40k+ rows without duplicates or gaps.
 */

/** Logical field that identifies the primary key column for each entity, used for ORDER BY. */
const PRIMARY_FIELD: Record<LogicalEntityName, string> = {
  student: 'student_id',
  class: 'class_id',
  section: 'section_id',
  teacher: 'teacher_id',
  branch: 'branch_id',
  subject: 'subject_id',
  enrollment: 'student_ref',
};

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

type QuoteFn = (name: string) => string;

function quoteQualified(qualifiedTable: string, quote: QuoteFn): string {
  const parts = qualifiedTable.split('.');
  return parts.map(quote).join('.');
}

/**
 * Builds `SELECT <mapped columns> AS <logical field> FROM <table> [WHERE ...]
 * ORDER BY <primary field>` for one entity, validating every identifier
 * against `snapshot` before it is quoted and interpolated.
 */
export function buildEntitySelect(
  entityName: LogicalEntityName,
  mapping: EntityMapping,
  snapshot: IntrospectionSnapshot,
  engine: Engine,
  quote: QuoteFn
): BuiltQuery {
  const allowList = snapshotColumns(snapshot, mapping.sourceTable);
  if (allowList.size === 0) {
    throw new Error(
      `Cannot build query for "${entityName}": table "${mapping.sourceTable}" is not in the current schema snapshot.`
    );
  }

  const selectParts: string[] = [];
  for (const [field, col] of Object.entries(mapping.fields)) {
    const cols = Array.isArray(col) ? col : [col];
    for (const c of cols) assertKnownIdentifier(c, allowList);

    if (Array.isArray(col)) {
      // Concatenated name field, e.g. first_name + last_name.
      const sep = mapping.nameSeparator ?? ' ';
      const concatSql = buildConcat(
        col.map((c) => quote(c)),
        sep,
        engine
      );
      selectParts.push(`${concatSql} AS ${quote(field)}`);
    } else {
      selectParts.push(`${quote(col)} AS ${quote(field)}`);
    }
  }

  const params: unknown[] = [];
  const whereParts: string[] = [];
  for (const filter of mapping.filters ?? []) {
    assertKnownIdentifier(filter.column, allowList);
    const colSql = quote(filter.column);
    if (filter.op === 'IS NULL' || filter.op === 'IS NOT NULL') {
      whereParts.push(`${colSql} ${filter.op}`);
    } else if (filter.op === 'IN') {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      whereParts.push(`${colSql} IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    } else {
      whereParts.push(`${colSql} ${filter.op} ?`);
      params.push(filter.value);
    }
  }

  const primaryField = PRIMARY_FIELD[entityName];
  const primaryCol = mapping.fields[primaryField];
  if (!primaryCol) {
    throw new Error(`Entity "${entityName}" has no mapped primary field "${primaryField}"; cannot order/paginate.`);
  }
  const primaryColsForOrder = (Array.isArray(primaryCol) ? primaryCol : [primaryCol]).map((c) => quote(c));

  const tableSql = quoteQualified(mapping.sourceTable, quote);
  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${tableSql}`,
    whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    `ORDER BY ${primaryColsForOrder.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params };
}

function buildConcat(quotedCols: string[], separator: string, engine: Engine): string {
  const sepLiteral = `'${separator.replace(/'/g, "''")}'`;
  switch (engine) {
    case 'mssql':
      return `CONCAT_WS(${sepLiteral}, ${quotedCols.join(', ')})`;
    case 'mysql':
      return `CONCAT_WS(${sepLiteral}, ${quotedCols.join(', ')})`;
    case 'postgres':
      return `CONCAT_WS(${sepLiteral}, ${quotedCols.join(', ')})`;
    case 'oracle':
      // Oracle lacks CONCAT_WS; build with || and coalesce nulls to ''.
      return quotedCols
        .map((c) => `COALESCE(${c}, '')`)
        .join(` || ${sepLiteral} || `);
    default: {
      const exhaustive: never = engine;
      throw new Error(`Unsupported engine: ${exhaustive}`);
    }
  }
}

/** Builds queries for every mapped entity in one document. */
export function buildAllEntityQueries(
  doc: EntityMappingDocument,
  snapshot: IntrospectionSnapshot,
  engine: Engine,
  quote: QuoteFn
): Partial<Record<LogicalEntityName, BuiltQuery>> {
  const result: Partial<Record<LogicalEntityName, BuiltQuery>> = {};
  for (const [entityName, mapping] of Object.entries(doc.entities) as [
    LogicalEntityName,
    EntityMapping | undefined,
  ][]) {
    if (!mapping) continue;
    result[entityName] = buildEntitySelect(entityName, mapping, snapshot, engine, quote);
  }
  return result;
}
