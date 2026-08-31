/**
 * A live snapshot of "what tables and columns actually exist" in the source
 * database, taken via DbAdapter introspection just before we trust a mapping
 * document. This is the allow-list every generated query is checked against.
 *
 * We re-fetch this at query-build time (not just once at wizard-save time)
 * because school DBAs do sometimes rename or drop columns later, and a stale
 * mapping must fail loudly rather than silently querying the wrong thing.
 */
export interface IntrospectionSnapshot {
  /** key: "schema.table" (case preserved as given by the adapter) */
  tables: Map<string, Set<string>>;
}

export function buildSnapshot(tables: Record<string, string[]>): IntrospectionSnapshot {
  const map = new Map<string, Set<string>>();
  for (const [table, columns] of Object.entries(tables)) {
    map.set(table, new Set(columns));
  }
  return { tables: map };
}

export function snapshotHasColumn(snapshot: IntrospectionSnapshot, table: string, column: string): boolean {
  return snapshot.tables.get(table)?.has(column) ?? false;
}

export function snapshotColumns(snapshot: IntrospectionSnapshot, table: string): ReadonlySet<string> {
  return snapshot.tables.get(table) ?? new Set();
}
