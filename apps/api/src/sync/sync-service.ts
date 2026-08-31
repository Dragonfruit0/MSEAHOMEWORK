import { buildAllEntityQueries, buildSnapshot } from '@homework-portal/mapping';
import type { LogicalEntityName } from '@homework-portal/shared';
import { portalDb } from '../db/portal-connection';
import { adapterForConnection, getActiveConnectionId } from '../setup/connection-store';
import { snapshotForMapping } from '../setup/introspect-snapshot';

const BATCH_SIZE = 1000;

/** Mirror table + which mapped fields become which mirror columns, per entity. */
const MIRROR_TABLE: Record<LogicalEntityName, string> = {
  branch: 'hp_branches',
  class: 'hp_classes',
  section: 'hp_sections',
  subject: 'hp_subjects',
  teacher: 'hp_teachers',
  student: 'hp_students',
  enrollment: 'hp_enrollments',
};

// Order matters: children reference parents via source_key -> portal id lookups.
const SYNC_ORDER: LogicalEntityName[] = ['branch', 'class', 'section', 'subject', 'teacher', 'student', 'enrollment'];

interface SyncCounts {
  inserted: number;
  updated: number;
}

/**
 * Runs a full sync of every mapped entity from the active source connection
 * into the portal mirror tables. Streams source rows in batches of 1,000 so
 * a 40,000-student sync never holds the whole table in memory.
 */
export async function runInitialSync(): Promise<Record<string, SyncCounts>> {
  const [runId] = await portalDb()('hp_sync_runs').insert({ status: 'running' }).returning('id');
  const syncRunId = typeof runId === 'object' ? runId.id : runId;

  const sourceId = await getActiveConnectionId('source');
  if (!sourceId) throw new Error('No active source connection. Complete setup first.');

  const mappingRow = await portalDb()('hp_entity_mappings').where({ is_active: true }).first();
  if (!mappingRow) throw new Error('No active entity mapping. Complete setup first.');
  const doc = typeof mappingRow.mapping_json === 'string' ? JSON.parse(mappingRow.mapping_json) : mappingRow.mapping_json;

  const adapter = await adapterForConnection(sourceId);
  const totals: Record<string, SyncCounts> = {};
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    const snapshot = await snapshotForMapping(adapter, doc);
    const quote = adapter.quoteIdent.bind(adapter);
    const queries = buildAllEntityQueries(doc, snapshot, adapter.engine, quote);

    for (const entity of SYNC_ORDER) {
      const query = queries[entity];
      if (!query) continue; // entity not mapped (e.g. enrollment is optional)
      const counts: SyncCounts = { inserted: 0, updated: 0 };
      const seenKeys: string[] = [];

      await adapter.streamQuery(query.sql, query.params, BATCH_SIZE, async (rows) => {
        const upserted = await upsertBatch(entity, rows);
        counts.inserted += upserted.inserted;
        counts.updated += upserted.updated;
        seenKeys.push(...rows.map((r) => String(r[primaryFieldFor(entity)])));
      });

      // Anything previously synced but absent this run is deactivated, never deleted,
      // so historical homework/submissions never lose their student/teacher reference.
      const deactivated = await deactivateMissing(entity, seenKeys);
      totals[entity] = counts;
      totalInserted += counts.inserted;
      totalUpdated += counts.updated;
      void deactivated;
    }

    await portalDb()('hp_sync_runs').where({ id: syncRunId }).update({
      status: 'success',
      finished_at: portalDb().fn.now(),
      rows_inserted: totalInserted,
      rows_updated: totalUpdated,
    });
    return totals;
  } catch (err) {
    await portalDb()('hp_sync_runs').where({ id: syncRunId }).update({
      status: 'failed',
      finished_at: portalDb().fn.now(),
      error_log: (err as Error).message,
    });
    throw err;
  } finally {
    await adapter.close();
  }
}

function primaryFieldFor(entity: LogicalEntityName): string {
  const map: Record<LogicalEntityName, string> = {
    student: 'student_id',
    class: 'class_id',
    section: 'section_id',
    teacher: 'teacher_id',
    branch: 'branch_id',
    subject: 'subject_id',
    enrollment: 'student_ref',
  };
  return map[entity];
}

/** Resolves a source foreign-key value to the portal-local id via source_key lookup. */
async function resolveRef(mirrorTable: string, sourceKey: unknown): Promise<number | null> {
  if (sourceKey === null || sourceKey === undefined) return null;
  const row = await portalDb()(mirrorTable).select('id').where({ source_key: String(sourceKey) }).first();
  return row?.id ?? null;
}

async function upsertBatch(entity: LogicalEntityName, rows: Record<string, unknown>[]): Promise<SyncCounts> {
  const table = MIRROR_TABLE[entity];
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const record = await mapRowToMirror(entity, row);
    const existing = await portalDb()(table).select('id').where({ source_key: record.source_key }).first();
    if (existing) {
      await portalDb()(table).where({ id: existing.id }).update({ ...record, is_active: true, synced_at: portalDb().fn.now() });
      updated++;
    } else {
      await portalDb()(table).insert({ ...record, is_active: true, synced_at: portalDb().fn.now() });
      inserted++;
    }
  }
  return { inserted, updated };
}

async function mapRowToMirror(entity: LogicalEntityName, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (entity) {
    case 'branch':
      return {
        source_key: String(row.branch_id),
        name: row.branch_name,
        code: row.code ?? null,
      };
    case 'class':
      return {
        source_key: String(row.class_id),
        name: row.class_name,
        grade_level: row.grade_level ?? null,
        branch_id: await resolveRef('hp_branches', row.branch_ref),
        academic_year: row.academic_year ?? null,
      };
    case 'section':
      return {
        source_key: String(row.section_id),
        name: row.section_name,
        class_id: await resolveRef('hp_classes', row.class_ref),
        branch_id: await resolveRef('hp_branches', row.branch_ref),
      };
    case 'subject':
      return {
        source_key: String(row.subject_id),
        name: row.subject_name,
        class_id: await resolveRef('hp_classes', row.class_ref),
      };
    case 'teacher':
      return {
        source_key: String(row.teacher_id),
        full_name: row.full_name,
        email: row.email ?? null,
        employee_code: row.employee_code ?? null,
        branch_id: await resolveRef('hp_branches', row.branch_ref),
      };
    case 'student':
      return {
        source_key: String(row.student_id),
        full_name: row.full_name,
        roll_no: row.roll_no ?? null,
        class_id: await resolveRef('hp_classes', row.class_ref),
        section_id: await resolveRef('hp_sections', row.section_ref),
        branch_id: await resolveRef('hp_branches', row.branch_ref),
        email: row.email ?? null,
        parent_phone: row.parent_phone ?? null,
      };
    case 'enrollment':
      return {
        student_id: await resolveRef('hp_students', row.student_ref),
        class_id: await resolveRef('hp_classes', row.class_ref),
        section_id: await resolveRef('hp_sections', row.section_ref),
        academic_year: row.academic_year ?? null,
      };
    default: {
      const exhaustive: never = entity;
      throw new Error(`Unhandled entity: ${exhaustive}`);
    }
  }
}

async function deactivateMissing(entity: LogicalEntityName, seenSourceKeys: string[]): Promise<number> {
  if (entity === 'enrollment') return 0; // no source_key / is_active concept for the join table
  const table = MIRROR_TABLE[entity];
  const query = portalDb()(table).where({ is_active: true });
  if (seenSourceKeys.length > 0) {
    query.whereNotIn('source_key', seenSourceKeys);
  }
  return query.update({ is_active: false });
}
