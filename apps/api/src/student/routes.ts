import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { portalDb } from '../db/portal-connection';
import { requireAuth, requireRole } from '../middleware/auth';
import { getActiveStorageProvider } from '../storage/factory';

export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole('STUDENT'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function loadCallerStudent(req: import('express').Request) {
  const student = await portalDb()('hp_students').where({ id: req.user!.linkedEntityId!, is_active: true }).first();
  if (!student) throw new Error('Linked student record not found or inactive.');
  return student;
}

const PAGE_SIZE = 20;

/**
 * The homework feed. Resolves the student's class/section from the verified
 * JWT's linked entity — never from a query param — then joins entirely
 * within the portal plane (no touch on the school's source DB).
 */
studentRouter.get('/homework', async (req, res) => {
  const student = await loadCallerStudent(req);
  const status = String(req.query.status ?? 'all');
  const page = Math.max(1, Number(req.query.page ?? 1));

  const query = portalDb()('hp_homework as h')
    .join('hp_homework_targets as tg', 'tg.homework_id', 'h.id')
    .join('hp_teachers as t', 't.id', 'h.teacher_id')
    .leftJoin('hp_subjects as s', 's.id', 'h.subject_id')
    .leftJoin('hp_homework_submissions as sub', function () {
      this.on('sub.homework_id', '=', 'h.id').andOn('sub.student_id', '=', portalDb().raw('?', [student.id]));
    })
    .select(
      'h.id', 'h.title', 'h.description', 'h.assigned_date', 'h.due_date',
      's.name as subject', 't.full_name as teacher',
      portalDb().raw("coalesce(sub.status, 'pending') as submission_status")
    )
    .where('h.status', 'published')
    .andWhere('tg.class_id', student.class_id)
    .andWhere(function () {
      this.whereNull('tg.section_id').orWhere('tg.section_id', student.section_id);
    })
    .orderBy('h.assigned_date', 'desc')
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  if (status === 'pending') {
    query.andWhere((qb) => qb.whereNull('sub.status').orWhere('sub.status', 'pending'));
  }

  res.json(await query);
});

studentRouter.get('/homework/:id', async (req, res) => {
  const student = await loadCallerStudent(req);
  const homeworkId = Number(req.params.id);

  const target = await portalDb()('hp_homework_targets')
    .where({ homework_id: homeworkId, class_id: student.class_id })
    .andWhere((qb) => qb.whereNull('section_id').orWhere('section_id', student.section_id))
    .first();
  if (!target) {
    res.status(404).json({ error: 'Homework not found.' });
    return;
  }

  const hw = await portalDb()('hp_homework as h')
    .join('hp_teachers as t', 't.id', 'h.teacher_id')
    .leftJoin('hp_subjects as s', 's.id', 'h.subject_id')
    .select('h.*', 't.full_name as teacher', 's.name as subject')
    .where('h.id', homeworkId)
    .first();
  const attachments = await portalDb()('hp_homework_attachments')
    .select('id', 'file_name', 'mime_type', 'size_bytes')
    .where({ homework_id: homeworkId });
  const submission = await portalDb()('hp_homework_submissions')
    .where({ homework_id: homeworkId, student_id: student.id })
    .first();

  res.json({ ...hw, attachments, submission: submission ?? null });
});

const submitSchema = z.object({ note: z.string().optional() });

studentRouter.post('/homework/:id/submit', upload.array('files', 5), async (req, res) => {
  const student = await loadCallerStudent(req);
  const homeworkId = Number(req.params.id);

  const target = await portalDb()('hp_homework_targets')
    .where({ homework_id: homeworkId, class_id: student.class_id })
    .andWhere((qb) => qb.whereNull('section_id').orWhere('section_id', student.section_id))
    .first();
  const homework = await portalDb()('hp_homework').where({ id: homeworkId }).first();
  if (!target || !homework || homework.status !== 'published') {
    res.status(404).json({ error: 'Homework not found.' });
    return;
  }
  if (!homework.allow_submission) {
    res.status(403).json({ error: 'This homework does not accept submissions.' });
    return;
  }

  const parsed = submitSchema.safeParse(req.body);
  const isLate = homework.due_date && new Date() > new Date(homework.due_date);

  const [submissionId] = await portalDb()('hp_homework_submissions')
    .insert({
      homework_id: homeworkId,
      student_id: student.id,
      submitted_at: portalDb().fn.now(),
      note: parsed.success ? parsed.data.note ?? null : null,
      status: isLate ? 'late' : 'submitted',
    })
    .onConflict(['homework_id', 'student_id'])
    .merge({ submitted_at: portalDb().fn.now(), note: parsed.success ? parsed.data.note ?? null : null, status: isLate ? 'late' : 'submitted' })
    .returning('id');
  const subId = typeof submissionId === 'object' ? submissionId.id : submissionId;

  const { provider, maxFileMb, allowedExtensions } = await getActiveStorageProvider();
  const files = (req.files as Express.Multer.File[]) ?? [];
  for (const file of files) {
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!allowedExtensions.includes(ext) || file.size > maxFileMb * 1024 * 1024) continue;
    const key = `submissions/${subId}/${uuid()}.${ext}`;
    const stored = await provider.save(key, file.buffer, file.mimetype);
    await portalDb()('hp_submission_attachments').insert({
      submission_id: subId,
      file_name: file.originalname,
      stored_path: stored.storedPath,
      mime_type: file.mimetype,
      size_bytes: file.size,
    });
  }

  res.status(201).json({ id: subId });
});
