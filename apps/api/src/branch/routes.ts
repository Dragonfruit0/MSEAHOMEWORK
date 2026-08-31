import { Router } from 'express';
import { z } from 'zod';
import { portalDb } from '../db/portal-connection';
import { requireAuth, requireRole } from '../middleware/auth';

export const branchRouter = Router();
branchRouter.use(requireAuth, requireRole('BRANCH_HEAD', 'SUPER_ADMIN'));

/** Scopes every query to the branch head's own branch, never a client-supplied branchId. */
async function callerBranchId(req: import('express').Request): Promise<number | null> {
  if (req.user!.role === 'SUPER_ADMIN') return null; // SUPER_ADMIN can see all branches
  return req.user!.linkedEntityId;
}

branchRouter.get('/classes', async (req, res) => {
  const branchId = await callerBranchId(req);
  const query = portalDb()('hp_classes').select('*').where({ is_active: true });
  if (branchId) query.andWhere({ branch_id: branchId });
  res.json(await query.orderBy('name'));
});

branchRouter.get('/teachers', async (req, res) => {
  const branchId = await callerBranchId(req);
  const query = portalDb()('hp_teachers').select('*').where({ is_active: true });
  if (branchId) query.andWhere({ branch_id: branchId });
  res.json(await query.orderBy('full_name'));
});

branchRouter.get('/assignments', async (req, res) => {
  const branchId = await callerBranchId(req);
  const query = portalDb()('hp_teacher_assignments as ta')
    .join('hp_teachers as t', 't.id', 'ta.teacher_id')
    .join('hp_classes as c', 'c.id', 'ta.class_id')
    .leftJoin('hp_sections as s', 's.id', 'ta.section_id')
    .join('hp_subjects as sub', 'sub.id', 'ta.subject_id')
    .select(
      'ta.id', 'ta.academic_year', 'ta.is_active',
      't.id as teacherId', 't.full_name as teacherName',
      'c.id as classId', 'c.name as className',
      's.id as sectionId', 's.name as sectionName',
      'sub.id as subjectId', 'sub.name as subjectName'
    )
    .where('ta.is_active', true);
  if (req.query.classId) query.andWhere('ta.class_id', Number(req.query.classId));
  if (req.query.year) query.andWhere('ta.academic_year', String(req.query.year));
  if (branchId) query.andWhere('c.branch_id', branchId);
  res.json(await query);
});

const assignSchema = z.object({
  teacherId: z.number(),
  classId: z.number(),
  sectionId: z.number().nullable().optional(),
  subjectId: z.number(),
  academicYear: z.string().min(4),
});

branchRouter.post('/assignments', async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const branchId = await callerBranchId(req);
  if (branchId) {
    // A branch head may only assign teachers within their own branch's classes.
    const cls = await portalDb()('hp_classes').where({ id: parsed.data.classId }).first();
    if (!cls || cls.branch_id !== branchId) {
      res.status(403).json({ error: 'That class is outside your branch.' });
      return;
    }
  }
  const [id] = await portalDb()('hp_teacher_assignments')
    .insert({
      teacher_id: parsed.data.teacherId,
      class_id: parsed.data.classId,
      section_id: parsed.data.sectionId ?? null,
      subject_id: parsed.data.subjectId,
      academic_year: parsed.data.academicYear,
      assigned_by: req.user!.sub,
    })
    .onConflict(['teacher_id', 'class_id', 'section_id', 'subject_id', 'academic_year'])
    .merge({ is_active: true, assigned_by: req.user!.sub, assigned_at: portalDb().fn.now() })
    .returning('id');
  res.status(201).json({ id: typeof id === 'object' ? id.id : id });
});

branchRouter.delete('/assignments/:id', async (req, res) => {
  const assignment = await portalDb()('hp_teacher_assignments as ta')
    .join('hp_classes as c', 'c.id', 'ta.class_id')
    .select('ta.id', 'c.branch_id')
    .where('ta.id', Number(req.params.id))
    .first();
  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }
  const branchId = await callerBranchId(req);
  if (branchId && assignment.branch_id !== branchId) {
    res.status(403).json({ error: 'That assignment is outside your branch.' });
    return;
  }
  await portalDb()('hp_teacher_assignments').where({ id: assignment.id }).update({ is_active: false });
  res.json({ ok: true });
});
