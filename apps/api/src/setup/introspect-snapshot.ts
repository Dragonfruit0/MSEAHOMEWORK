import type { DbAdapter } from '@homework-portal/db-adapters';
import { buildSnapshot, type IntrospectionSnapshot } from '@homework-portal/mapping';
import type { EntityMappingDocument } from '@homework-portal/shared';

/** Re-introspects every table referenced by a mapping document, fresh, right now. */
export async function snapshotForMapping(
  adapter: DbAdapter,
  doc: EntityMappingDocument
): Promise<IntrospectionSnapshot> {
  const tables = new Set<string>();
  for (const mapping of Object.values(doc.entities)) {
    if (mapping) tables.add(mapping.sourceTable);
  }
  const tableColumns: Record<string, string[]> = {};
  for (const qualified of tables) {
    const idx = qualified.lastIndexOf('.');
    const schema = qualified.slice(0, idx);
    const table = qualified.slice(idx + 1);
    const cols = await adapter.listColumns(schema, table);
    tableColumns[qualified] = cols.map((c) => c.name);
  }
  return buildSnapshot(tableColumns);
}
