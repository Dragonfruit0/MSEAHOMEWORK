import { Router } from 'express';
import { z } from 'zod';
import { portalDb } from '../db/portal-connection';
import { requireAuth, requireRole } from '../middleware/auth';
import { runInitialSync } from '../sync/sync-service';
import { hashPassword } from '../auth/password';
import { generateTempPassword } from '../auth/temp-password';
import { writeAuditLog } from './audit';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

adminRouter.post('/sync', async (req, res) => {
  const result = await runInitialSync();
  await writeAuditLog(req, 'sync.run', 'sync', null, result);
  res.json(result);
});

adminRouter.get('/sync-runs', async (_req, res) => {
  res.json(await portalDb()('hp_sync_runs').orderBy('started_at', 'desc').limit(20));
});

adminRouter.get('/branches', async (_req, res) => {
  res.json(await portalDb()('hp_branches').where({ is_active: true }).select('id', 'name').orderBy('name'));
});

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

const PORTAL_ROLES = ['SUPER_ADMIN', 'BRANCH_HEAD', 'TEACHER', 'STUDENT', 'PARENT'] as const;

adminRouter.get('/users', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 25;
  const role = typeof req.query.role === 'string' && req.query.role ? req.query.role : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  let query = portalDb()('hp_users').select(
    'id', 'login_id', 'role', 'linked_entity_type', 'linked_entity_id',
    'is_active', 'must_change_password', 'last_login_at', 'created_at'
  );
  if (role) query = query.where({ role });
  if (q) query = query.whereILike('login_id', `%${q}%`);

  const countQuery = query.clone().clearSelect().count<{ count: string }[]>('id as count');
  const [{ count }] = (await countQuery) as [{ count: string }];
  const rows = await query.orderBy('created_at', 'desc').limit(pageSize).offset((page - 1) * pageSize);

  res.json({ rows, total: Number(count), page, pageSize });
});

const createUserSchema = z.object({
  loginId: z.string().min(2).max(100),
  password: z.string().min(8).optional(),
  role: z.enum(PORTAL_ROLES),
  linkedEntityType: z.enum(['student', 'teacher', 'branch']).nullable().optional(),
  linkedEntityId: z.number().nullable().optional(),
});

adminRouter.post('/users', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await portalDb()('hp_users').where({ login_id: parsed.data.loginId }).first();
  if (existing) {
    res.status(409).json({ error: 'That login ID is already taken.' });
    return;
  }
  const tempPassword = parsed.data.password ?? generateTempPassword();
  const [id] = await portalDb()('hp_users')
    .insert({
      login_id: parsed.data.loginId,
      password_hash: await hashPassword(tempPassword),
      role: parsed.data.role,
      linked_entity_type: parsed.data.linkedEntityType ?? null,
      linked_entity_id: parsed.data.linkedEntityId ?? null,
      must_change_password: true,
    })
    .returning('id');
  const userId = typeof id === 'object' ? id.id : id;
  await writeAuditLog(req, 'user.create', 'user', userId, { loginId: parsed.data.loginId, role: parsed.data.role });
  res.status(201).json({ id: userId, loginId: parsed.data.loginId, tempPassword });
});

adminRouter.post('/users/:id/deactivate', async (req, res) => {
  const id = Number(req.params.id);
  await portalDb()('hp_users').where({ id }).update({ is_active: false });
  await portalDb()('hp_refresh_tokens').where({ user_id: id }).update({ revoked_at: portalDb().fn.now() });
  await writeAuditLog(req, 'user.deactivate', 'user', id, {});
  res.json({ ok: true });
});

adminRouter.post('/users/:id/reactivate', async (req, res) => {
  const id = Number(req.params.id);
  await portalDb()('hp_users').where({ id }).update({ is_active: true });
  await writeAuditLog(req, 'user.reactivate', 'user', id, {});
  res.json({ ok: true });
});

adminRouter.post('/users/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const user = await portalDb()('hp_users').where({ id }).first();
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const tempPassword = generateTempPassword();
  await portalDb()('hp_users').where({ id }).update({
    password_hash: await hashPassword(tempPassword),
    must_change_password: true,
  });
  await portalDb()('hp_refresh_tokens').where({ user_id: id }).update({ revoked_at: portalDb().fn.now() });
  await writeAuditLog(req, 'user.reset_password', 'user', id, {});
  res.json({ ok: true, tempPassword });
});

// ---------------------------------------------------------------------------
// Bulk provisioning — creates one login per mirrored student/teacher row that
// doesn't already have a portal account. This is the only realistic way to
// onboard tens of thousands of students; hand-creating accounts one at a
// time (the /users POST route above) doesn't scale past a handful of staff.
// ---------------------------------------------------------------------------

const provisionSchema = z.object({
  entityType: z.enum(['student', 'teacher']),
  branchId: z.number().nullable().optional(),
});

const MIRROR_TABLE: Record<'student' | 'teacher', string> = { student: 'hp_students', teacher: 'hp_teachers' };
const ROLE_FOR: Record<'student' | 'teacher', string> = { student: 'STUDENT', teacher: 'TEACHER' };
const LOGIN_PREFIX: Record<'student' | 'teacher', string> = { student: 'stu', teacher: 'tch' };

adminRouter.post('/users/provision-preview', async (req, res) => {
  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { entityType, branchId } = parsed.data;
  const table = MIRROR_TABLE[entityType];
  let query = portalDb()(table).where({ is_active: true });
  if (branchId) query = query.where({ branch_id: branchId });
  const totalRows = (await query.clone().count<{ count: string }[]>('id as count')) as [{ count: string }];
  const total = Number(totalRows[0].count);
  const provisionedRows = (await portalDb()('hp_users')
    .where({ linked_entity_type: entityType, is_active: true })
    .whereIn('linked_entity_id', query.clone().select('id'))
    .count<{ count: string }[]>('id as count')) as [{ count: string }];
  const alreadyProvisioned = Number(provisionedRows[0].count);
  res.json({ total, alreadyProvisioned, toProvision: total - alreadyProvisioned });
});

adminRouter.post('/users/provision', async (req, res) => {
  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { entityType, branchId } = parsed.data;
  const table = MIRROR_TABLE[entityType];

  let rowsQuery = portalDb()(table).where({ is_active: true });
  if (branchId) rowsQuery = rowsQuery.where({ branch_id: branchId });
  const rows: { id: number; source_key: string; full_name: string }[] = await rowsQuery.select('id', 'source_key', 'full_name');

  const alreadyLinkedIds = new Set(
    (
      await portalDb()('hp_users')
        .where({ linked_entity_type: entityType })
        .whereIn('linked_entity_id', rows.map((r) => r.id))
        .select('linked_entity_id')
    ).map((r: { linked_entity_id: number }) => r.linked_entity_id)
  );

  const toCreate = rows.filter((r) => !alreadyLinkedIds.has(r.id));
  const created: { loginId: string; tempPassword: string; name: string }[] = [];

  // Sequential rather than Promise.all: argon2 hashing is CPU-bound, and at
  // 40k rows a naive Promise.all would spike memory and contend the same
  // hashing threadpool with no throughput benefit.
  for (const row of toCreate) {
    const loginId = `${LOGIN_PREFIX[entityType]}${row.source_key}`;
    const tempPassword = generateTempPassword();
    await portalDb()('hp_users').insert({
      login_id: loginId,
      password_hash: await hashPassword(tempPassword),
      role: ROLE_FOR[entityType],
      linked_entity_type: entityType,
      linked_entity_id: row.id,
      must_change_password: true,
    });
    created.push({ loginId, tempPassword, name: row.full_name });
  }

  await writeAuditLog(req, 'user.bulk_provision', entityType, null, { count: created.length });
  res.json({ created, skipped: rows.length - toCreate.length });
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

adminRouter.get('/audit-log', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 50;
  const [{ count }] = (await portalDb()('hp_audit_log').count<{ count: string }[]>('id as count')) as [{ count: string }];
  const rows = await portalDb()('hp_audit_log as al')
    .leftJoin('hp_users as u', 'u.id', 'al.actor_user_id')
    .select('al.*', 'u.login_id as actor_login_id')
    .orderBy('al.at', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  res.json({ rows, total: Number(count), page, pageSize });
});
