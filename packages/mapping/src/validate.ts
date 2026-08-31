import {
  type EntityMappingDocument,
  type LogicalEntityName,
  REQUIRED_FIELDS,
} from '@homework-portal/shared';
import { type IntrospectionSnapshot, snapshotColumns } from './introspection-snapshot';

export interface MappingIssue {
  severity: 'error' | 'warning';
  entity: LogicalEntityName;
  field?: string;
  message: string;
}

/**
 * Structural validation: does the mapping even reference tables/columns that
 * exist right now? This runs before any SQL is built (setup wizard step 5,
 * "Validate & preview"), and again defensively inside the sql-builder.
 *
 * This does NOT check data quality (duplicate IDs, orphan rows, nulls) —
 * that requires actually running queries against the source DB and lives in
 * the setup API's validation endpoint, not here.
 */
export function validateMappingStructure(
  doc: EntityMappingDocument,
  snapshot: IntrospectionSnapshot
): MappingIssue[] {
  const issues: MappingIssue[] = [];

  for (const [entityName, mapping] of Object.entries(doc.entities) as [
    LogicalEntityName,
    EntityMappingDocument['entities'][LogicalEntityName],
  ][]) {
    if (!mapping) continue;
    const columns = snapshotColumns(snapshot, mapping.sourceTable);
    if (columns.size === 0) {
      issues.push({
        severity: 'error',
        entity: entityName,
        message: `Source table "${mapping.sourceTable}" was not found in the latest schema scan.`,
      });
      continue;
    }

    const required = REQUIRED_FIELDS[entityName] ?? [];
    for (const field of required) {
      const mapped = mapping.fields[field];
      if (!mapped) {
        issues.push({
          severity: 'error',
          entity: entityName,
          field,
          message: `Required field "${field}" is not mapped for entity "${entityName}".`,
        });
        continue;
      }
      const mappedCols = Array.isArray(mapped) ? mapped : [mapped];
      for (const col of mappedCols) {
        if (!columns.has(col)) {
          issues.push({
            severity: 'error',
            entity: entityName,
            field,
            message: `Column "${col}" mapped to "${field}" no longer exists on "${mapping.sourceTable}".`,
          });
        }
      }
    }

    for (const [field, mapped] of Object.entries(mapping.fields)) {
      if (required.includes(field)) continue; // already checked above
      const mappedCols = Array.isArray(mapped) ? mapped : [mapped];
      for (const col of mappedCols) {
        if (!columns.has(col)) {
          issues.push({
            severity: 'warning',
            entity: entityName,
            field,
            message: `Optional field "${field}" points at missing column "${col}" on "${mapping.sourceTable}".`,
          });
        }
      }
    }
  }

  for (const rel of doc.relationships) {
    const [fromTable, fromCol] = splitColumnRef(rel.from);
    const [toTable, toCol] = splitColumnRef(rel.to);
    if (!snapshotColumns(snapshot, fromTable).has(fromCol)) {
      issues.push({
        severity: 'error',
        entity: 'student', // relationships aren't entity-scoped; attribute generically
        message: `Relationship references missing column "${rel.from}".`,
      });
    }
    if (!snapshotColumns(snapshot, toTable).has(toCol)) {
      issues.push({
        severity: 'error',
        entity: 'student',
        message: `Relationship references missing column "${rel.to}".`,
      });
    }
  }

  return issues;
}

function splitColumnRef(ref: string): [table: string, column: string] {
  const idx = ref.lastIndexOf('.');
  return [ref.slice(0, idx), ref.slice(idx + 1)];
}
