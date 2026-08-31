/**
 * Read-only guard for the source (school) database plane.
 *
 * This is deliberately paranoid: the source DB belongs to the school's other
 * system, and this portal must never be the thing that corrupts it. Every
 * query that reaches a source-plane adapter passes through here first.
 */

const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|exec|execute|call)\b/i;

export function assertReadOnlySelect(sql: string): void {
  const trimmed = sql.trim().replace(/^\(+/, '');
  if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed)) {
    throw new Error('Source-plane queries must start with SELECT or WITH (read-only).');
  }
  // Strip string literals before keyword-scanning so a column value like
  // 'update requests' doesn't false-positive.
  const withoutStrings = trimmed.replace(/'(?:[^']|'')*'/g, "''");
  if (WRITE_KEYWORDS.test(withoutStrings)) {
    throw new Error('Source-plane queries may not contain write/DDL statements.');
  }
  if (trimmed.includes(';')) {
    // Disallow statement stacking entirely — one SELECT per call.
    const withoutTrailingSemi = trimmed.replace(/;\s*$/, '');
    if (withoutTrailingSemi.includes(';')) {
      throw new Error('Multiple statements are not allowed in a single source-plane query.');
    }
  }
}

/**
 * Validates a bare identifier (table or column name) against a known allow-list
 * pulled from live introspection, and returns it unchanged. Never interpolate
 * an identifier that hasn't passed through this check — this is the control
 * that stops a hostile "column name" chosen at mapping time from becoming
 * arbitrary SQL.
 */
export function assertKnownIdentifier(name: string, allowList: ReadonlySet<string>): string {
  if (!allowList.has(name)) {
    throw new Error(`Identifier "${name}" is not part of the introspected schema allow-list.`);
  }
  if (!/^[A-Za-z0-9_$]+$/.test(name)) {
    // Defense in depth: even an allow-listed name must look like an identifier.
    throw new Error(`Identifier "${name}" contains characters that are not permitted.`);
  }
  return name;
}
