import { Router } from 'express';
import { z } from 'zod';
import { createAdapter, ENGINE_DEFAULT_PORT, type Engine } from '@homework-portal/db-adapters';
import { buildEntitySelect, validateMappingStructure } from '@homework-portal/mapping';
import { REQUIRED_FIELDS, type EntityMappingDocument, type LogicalEntityName } from '@homework-portal/shared';
import { portalDb } from '../db/portal-connection';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword } from '../auth/password';
import {
  activateConnection,
  adapterForConnection,
  saveDraftConnection,
} from './connection-store';
import { snapshotForMapping } from './introspect-snapshot';
import { runInitialSync } from '../sync/sync-service';
import { seedTestingMode } from './testing-mode';

export const setupRouter = Router();

async function isSetupComplete(): Promise<boolean> {
  const state = await portalDb()('hp_setup_state').first();
  return Boolean(state?.completed);
}

/** Blocks every setup route once first-run setup is done, except for SUPER_ADMIN re-mapping. */
setupRouter.use(async (req, res, next) => {
  if (await isSetupComplete()) {
    // After go-live, only an authenticated SUPER_ADMIN may touch setup (e.g. to remap).
    requireAuth(req, res, () => requireRole('SUPER_ADMIN')(req, res, next));
    return;
  }
  next();
});

/** One-time bootstrap: create the first SUPER_ADMIN before anything else exists. */
const bootstrapSchema = z.object({ loginId: z.string().min(3), password: z.string().min(8) });
setupRouter.post('/bootstrap-admin', async (req, res) => {
  if (await isSetupComplete()) {
    res.status(409).json({ error: 'Setup is already complete.' });
    return;
  }
  const existingAdmin = await portalDb()('hp_users').where({ role: 'SUPER_ADMIN' }).first();
  if (existingAdmin) {
    res.status(409).json({ error: 'A SUPER_ADMIN already exists. Log in instead.' });
    return;
  }
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'loginId (min 3 chars) and password (min 8 chars) are required.' });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const [id] = await portalDb()('hp_users')
    .insert({
      login_id: parsed.data.loginId,
      password_hash: passwordHash,
      role: 'SUPER_ADMIN',
      must_change_password: false,
    })
    .returning('id');
  res.status(201).json({ id: typeof id === 'object' ? id.id : id });
});

/**
 * Skips the whole connect-a-real-database flow: seeds a self-contained demo
 * dataset (see testing-mode.ts) and marks setup complete so the team can log
 * in and try every role immediately. Safe to call again later to reset the
 * demo — but refuses once a *real* database has been mapped and synced, so
 * it can never be used to accidentally wipe real school data.
 */
setupRouter.post('/testing-mode', async (req, res) => {
  const state = await portalDb()('hp_setup_state').first();
  if (state?.completed && !state.testing_mode) {
    res.status(409).json({ error: 'A real database is already connected — testing mode would wipe it. Not allowed.' });
    return;
  }
  const admin = await portalDb()('hp_users').where({ role: 'SUPER_ADMIN' }).orderBy('id', 'asc').first();
  if (!admin) {
    res.status(400).json({ error: 'Create the admin account first.' });
    return;
  }
  const result = await seedTestingMode(admin.id);
  res.status(201).json(result);
});

const connectionSchema = z.object({
  engine: z.enum(['mssql', 'mysql', 'postgres', 'oracle']),
  host: z.string().min(1),
  port: z.number().optional(),
  database: z.string().min(1),
  schema: z.string().optional(),
  user: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().optional(),
  trustServerCertificate: z.boolean().optional(),
  readOnlyIntent: z.boolean().optional(),
  connectString: z.string().optional(),
});

/** Step 1: test a connection WITHOUT persisting it, so a typo doesn't get saved. */
setupRouter.post('/test-connection', async (req, res) => {
  const parsed = connectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const cfg = { ...parsed.data, port: parsed.data.port ?? ENGINE_DEFAULT_PORT[parsed.data.engine as Engine] };
  const adapter = createAdapter(cfg);
  try {
    const result = await adapter.testConnection();
    res.json(result);
  } finally {
    await adapter.close();
  }
});

/** Once a test succeeds, save it as a draft "source" or "portal" connection. */
const saveConnectionSchema = connectionSchema.extend({ role: z.enum(['source', 'portal']) });
setupRouter.post('/connections', async (req, res) => {
  const parsed = saveConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { role, ...cfg } = parsed.data;
  const id = await saveDraftConnection(role, cfg);
  res.status(201).json({ id });
});

/** Step 2: browse schema/tables/columns/sample rows on a saved draft connection. */
setupRouter.get('/connections/:id/schemas', async (req, res) => {
  const adapter = await adapterForConnection(Number(req.params.id));
  try {
    res.json(await adapter.listSchemas());
  } finally {
    await adapter.close();
  }
});

setupRouter.get('/connections/:id/tables', async (req, res) => {
  const schema = String(req.query.schema ?? '');
  const adapter = await adapterForConnection(Number(req.params.id));
  try {
    res.json(await adapter.listTables(schema));
  } finally {
    await adapter.close();
  }
});

setupRouter.get('/connections/:id/columns', async (req, res) => {
  const schema = String(req.query.schema ?? '');
  const table = String(req.query.table ?? '');
  const adapter = await adapterForConnection(Number(req.params.id));
  try {
    res.json(await adapter.listColumns(schema, table));
  } finally {
    await adapter.close();
  }
});

setupRouter.get('/connections/:id/foreign-keys', async (req, res) => {
  const schema = String(req.query.schema ?? '');
  const table = String(req.query.table ?? '');
  const adapter = await adapterForConnection(Number(req.params.id));
  try {
    res.json(await adapter.detectForeignKeys(schema, table));
  } finally {
    await adapter.close();
  }
});

setupRouter.get('/connections/:id/sample', async (req, res) => {
  const schema = String(req.query.schema ?? '');
  const table = String(req.query.table ?? '');
  const limit = Number(req.query.limit ?? 20);
  const adapter = await adapterForConnection(Number(req.params.id));
  try {
    res.json(await adapter.sampleRows(schema, table, limit));
  } finally {
    await adapter.close();
  }
});

/** Step 3-4: save an entity+relationship mapping document as a new version. */
setupRouter.post('/mapping', async (req, res) => {
  const doc = req.body as EntityMappingDocument;
  const sourceId = Number(req.body.sourceConnectionId);
  if (!sourceId) {
    res.status(400).json({ error: 'sourceConnectionId is required.' });
    return;
  }
  const adapter = await adapterForConnection(sourceId);
  try {
    const snapshot = await snapshotForMapping(adapter, doc);
    const issues = validateMappingStructure(doc, snapshot);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      res.status(422).json({ issues });
      return;
    }
    const lastVersion = await portalDb()('hp_entity_mappings').max('version as v').first();
    const version = Number(lastVersion?.v ?? 0) + 1;
    await portalDb()('hp_entity_mappings').insert({
      version,
      mapping_json: JSON.stringify({ ...doc, version }),
      is_active: false,
    });
    res.status(201).json({ version, issues });
  } finally {
    await adapter.close();
  }
});

/**
 * Step 5: data-quality validation against a saved mapping version. Pulls
 * every mapped entity's full row set through the same buildEntitySelect()
 * the sync engine itself uses (so a passing check here is a real guarantee,
 * not a preview of a different query), then checks — per entity — the row
 * count, null counts in required fields, duplicate primary identifiers, and
 * orphaned foreign-key references (a "*_ref" field whose value matches no
 * row in the entity it's supposed to point at, by naming convention:
 * class_ref -> the mapped "class" entity's own primary field).
 *
 * For a genuinely large school this pulls the full row set into memory
 * once, which costs real seconds at 40k+ rows — acceptable for a one-time
 * setup step, and no worse than what the first sync does anyway (just not
 * batched). Not something to run on every request.
 */
setupRouter.post('/validate', async (req, res) => {
  const { version, sourceConnectionId } = req.body as { version: number; sourceConnectionId: number };
  const mappingRow = await portalDb()('hp_entity_mappings').where({ version }).first();
  if (!mappingRow) {
    res.status(404).json({ error: `No mapping version ${version}.` });
    return;
  }
  const doc: EntityMappingDocument =
    typeof mappingRow.mapping_json === 'string' ? JSON.parse(mappingRow.mapping_json) : mappingRow.mapping_json;
  const adapter = await adapterForConnection(sourceConnectionId);
  try {
    const snapshot = await snapshotForMapping(adapter, doc);
    const quote = (name: string) => adapter.quoteIdent(name);

    const rowsByEntity: Partial<Record<LogicalEntityName, Record<string, unknown>[]>> = {};
    for (const [entityName, mapping] of Object.entries(doc.entities) as [LogicalEntityName, EntityMappingDocument['entities'][LogicalEntityName]][]) {
      if (!mapping) continue;
      const { sql, params } = buildEntitySelect(entityName, mapping, snapshot, adapter.engine, quote);
      rowsByEntity[entityName] = await adapter.runQuery(sql, params);
    }

    const results: Record<
      string,
      {
        rowCount: number;
        nulls: Record<string, number>;
        duplicatePrimaryKeyCount: number;
        orphans: Record<string, number>;
        preview: Record<string, unknown>[];
      }
    > = {};

    for (const [entityName, rows] of Object.entries(rowsByEntity) as [LogicalEntityName, Record<string, unknown>[]][]) {
      const required = REQUIRED_FIELDS[entityName];
      const mapping = doc.entities[entityName]!;

      const nulls: Record<string, number> = {};
      for (const field of required) {
        if (!(field in mapping.fields)) continue;
        nulls[field] = rows.filter((r) => r[field] == null || r[field] === '').length;
      }

      const primaryField = required[0]!;
      const pkValues = rows.map((r) => r[primaryField]).filter((v) => v != null);
      const duplicatePrimaryKeyCount = Math.max(0, pkValues.length - new Set(pkValues.map(String)).size);

      const orphans: Record<string, number> = {};
      for (const field of Object.keys(mapping.fields)) {
        if (!field.endsWith('_ref')) continue;
        const parentEntity = field.slice(0, -'_ref'.length) as LogicalEntityName;
        const parentRows = rowsByEntity[parentEntity];
        if (!parentRows) continue; // parent entity isn't mapped — can't check this reference
        const parentPrimaryField = REQUIRED_FIELDS[parentEntity][0]!;
        const parentKeys = new Set(parentRows.map((r) => String(r[parentPrimaryField])));
        orphans[field] = rows.filter((r) => r[field] != null && !parentKeys.has(String(r[field]))).length;
      }

      results[entityName] = {
        rowCount: rows.length,
        nulls,
        duplicatePrimaryKeyCount,
        orphans,
        preview: rows.slice(0, 5),
      };
    }

    res.json(results);
  } finally {
    await adapter.close();
  }
});

/** Step 6: storage config (local disk or S3-compatible). */
const storageSchema = z.object({
  provider: z.enum(['local', 's3']),
  config: z.record(z.unknown()),
  maxFileMb: z.number().default(25),
  allowedExtensions: z.array(z.string()).optional(),
});
setupRouter.post('/storage', async (req, res) => {
  const parsed = storageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await portalDb()('hp_storage_config').update({ is_active: false });
  await portalDb()('hp_storage_config').insert({
    provider: parsed.data.provider,
    config_json: JSON.stringify(parsed.data.config),
    max_file_mb: parsed.data.maxFileMb,
    allowed_extensions: JSON.stringify(
      parsed.data.allowedExtensions ?? ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'zip', 'txt']
    ),
    is_active: true,
  });
  res.json({ ok: true });
});

/** Step 7: activate the source connection + mapping, then run the first sync. */
const completeSchema = z.object({ sourceConnectionId: z.number(), mappingVersion: z.number() });
setupRouter.post('/complete', async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await activateConnection(parsed.data.sourceConnectionId);
  await portalDb()('hp_entity_mappings').update({ is_active: false });
  await portalDb()('hp_entity_mappings').where({ version: parsed.data.mappingVersion }).update({ is_active: true });
  await portalDb()('hp_setup_state').update({
    completed: true,
    completed_at: portalDb().fn.now(),
    active_mapping_version: parsed.data.mappingVersion,
    testing_mode: false,
  });

  const syncResult = await runInitialSync();
  res.json({ ok: true, sync: syncResult });
});

setupRouter.get('/state', async (_req, res) => {
  const state = await portalDb()('hp_setup_state').first();
  res.json({ completed: Boolean(state?.completed), testingMode: Boolean(state?.testing_mode) });
});
