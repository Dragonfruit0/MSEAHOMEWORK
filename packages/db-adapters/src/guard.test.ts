import { describe, expect, it } from 'vitest';
import { assertKnownIdentifier, assertReadOnlySelect } from './guard';

describe('assertReadOnlySelect', () => {
  it('allows a plain SELECT', () => {
    expect(() => assertReadOnlySelect('SELECT id FROM students')).not.toThrow();
  });

  it('allows a WITH (CTE) query', () => {
    expect(() => assertReadOnlySelect('WITH x AS (SELECT 1) SELECT * FROM x')).not.toThrow();
  });

  it('rejects DROP TABLE smuggled after a SELECT', () => {
    expect(() => assertReadOnlySelect('SELECT * FROM students; DROP TABLE students;')).toThrow();
  });

  it('rejects an UPDATE statement', () => {
    expect(() => assertReadOnlySelect('UPDATE students SET name = 1')).toThrow();
  });

  it('rejects a statement not starting with SELECT/WITH', () => {
    expect(() => assertReadOnlySelect('DELETE FROM students')).toThrow();
  });

  it('does not false-positive on write keywords inside string literals', () => {
    expect(() =>
      assertReadOnlySelect("SELECT * FROM tickets WHERE title = 'please update my record'")
    ).not.toThrow();
  });

  it('rejects EXEC-based command injection', () => {
    expect(() => assertReadOnlySelect("SELECT 1; EXEC xp_cmdshell 'dir'")).toThrow();
  });
});

describe('assertKnownIdentifier', () => {
  const allowList = new Set(['STU_ID', 'STU_FNAME']);

  it('accepts an identifier present in the allow-list', () => {
    expect(assertKnownIdentifier('STU_ID', allowList)).toBe('STU_ID');
  });

  it('rejects an identifier absent from the allow-list', () => {
    expect(() => assertKnownIdentifier('DROP TABLE students--', allowList)).toThrow();
  });

  it('rejects an allow-listed-looking name with illegal characters', () => {
    const trickList = new Set(["STU_ID; DROP TABLE students--"]);
    expect(() => assertKnownIdentifier('STU_ID; DROP TABLE students--', trickList)).toThrow();
  });
});
