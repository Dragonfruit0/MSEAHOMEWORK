import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { portalDb } from '../db/portal-connection';
import { requireAuth, requireRole } from '../middleware/auth';
import { getActiveStorageProvider } from '../storage/factory';

// file-type is ESM-only with no CommonJS export condition; import it
// dynamically so it works under the api's CommonJS build/runtime (tsx/tsc).
async function fileTypeFromBuffer(buffer: Buffer) {
  const mod = await import('file-type');
  return mod.fileTypeFromBuffer(buffer);
}

export const teacherRouter = Router();
teacherRouter.use(requireAuth, requireRole('TEACHER'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function teacherId(req: import('express').Request): Promise<number> {
  return req.user!.linkedEntityId!;
}

/** The set of (class, section, subject) this teacher may act on — never trust a client-supplied classId. */
async function myAssignments(tId: number) {
  return portalDb()('hp_teacher_assignments').where({ teacher_id: tId, is_active: true });
}

teacherRouter.get('/my-classes', async (req, res) => {
  const tId = await teacherId(req);
  const rows = await portalDb()('hp_teacher_assignments as ta')
    .join('hp_classes as c', 'c.id', 'ta.class_id')
    .leftJoin('hp_sections as s', 's.id', 'ta.section_id')
    .join('hp_subjects as sub', 'sub.id', 'ta.subject_id')
    .select(
      'ta.id as assignmentId', 'c.id as classId', 'c.name as className',
      's.id as sectionId', 's.name as sectionName',
      'sub.id as subjectId', 'sub.name as subjectName', 'ta.academic_year'
    )
    .where({ 'ta.teacher_id': tId, 'ta.is_active': true });
  res.json(rows);
});

const createHomeworkSchema = z.object({
  subjectId: z.number().optional(),
  title: z.string().min(1).max(250),
  description: z.string().optional(),
  assignedDate: z.string(),
  dueDate: z.string().optional(),
  allowSubmission: z.boolean().default(true),
  targets: z.array(z.object({ classId: z.number(), sectionId: z.number().nullable().optional() })).min(1),
});

teacherRouter.post('/homework', async (req, res) => {
  const parsed = createHomeworkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tId = await teacherId(req);
  const assignments = await myAssignments(tId);
  const allowedClassIds = new Set(assignments.map((a) => a.class_id));
  for (const target of parsed.data.targets) {
    if (!allowedClassIds.has(target.classId)) {
      res.status(403).json({ error: `You are not assigned to class ${target.classId}.` });
      return;
    }
  }

  const [id] = await portalDb().transaction(async (trx) => {
    const inserted = await trx('hp_homework')
      .insert({
        teacher_id: tId,
        subject_id: parsed.data.subjectId ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        assigned_date: parsed.data.assignedDate,
        due_date: parsed.data.dueDate ?? null,
        allow_submission: parsed.data.allowSubmission,
        status: 'draft',
      })
      .returning('id');
    const homeworkId = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];
    await trx('hp_homework_targets').insert(
      parsed.data.targets.map((t) => ({ homework_id: homeworkId, class_id: t.classId, section_id: t.sectionId ?? null }))
    );
    return [homeworkId];
  });

  res.status(201).json({ id });
});

/** Confirms the caller's homework row exists and belongs to them; 404s/403s otherwise. */
async function loadOwnHomework(req: import('express').Request, res: import('express').Response) {
  const tId = await teacherId(req);
  const hw = await portalDb()('hp_homework').where({ id: Number(req.params.id) }).first();
  if (!hw) {
    res.status(404).json({ error: 'Homework not found.' });
    return null;
  }
  if (hw.teacher_id !== tId) {
    res.status(403).json({ error: 'Not your homework.' });
    return null;
  }
  return hw;
}

teacherRouter.post('/homework/:id/attachments', upload.single('file'), async (req, res) => {
  const hw = await loadOwnHomework(req, res);
  if (!hw) return;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  const { provider, maxFileMb, allowedExtensions } = await getActiveStorageProvider();
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    res.status(400).json({ error: `File extension .${ext} is not allowed.` });
    return;
  }
  if (file.size > maxFileMb * 1024 * 1024) {
    res.status(400).json({ error: `File exceeds the ${maxFileMb}MB limit.` });
    return;
  }
  const sniffed = await fileTypeFromBuffer(file.buffer);
  // Best-effort MIME sniffing; some office/text formats aren't magic-byte detectable, so
  // absence of a sniffed type is not itself a rejection — the extension allow-list still gates it.
  const mimeType = sniffed?.mime ?? file.mimetype;

  const key = `homework/${hw.id}/${uuid()}.${ext}`;
  const stored = await provider.save(key, file.buffer, mimeType);

  const [id] = await portalDb()('hp_homework_attachments')
    .insert({
      homework_id: hw.id,
      file_name: file.originalname,
      stored_path: stored.storedPath,
      mime_type: mimeType,
      size_bytes: file.size,
      uploaded_by: req.user!.sub,
    })
    .returning('id');
  res.status(201).json({ id: typeof id === 'object' ? id.id : id });
});

teacherRouter.post('/homework/:id/publish', async (req, res) => {
  const hw = await loadOwnHomework(req, res);
  if (!hw) return;
  await portalDb()('hp_homework').where({ id: hw.id }).update({ status: 'published' });
  res.json({ ok: true });
});

teacherRouter.get('/homework', async (req, res) => {
  const tId = await teacherId(req);
  const rows = await portalDb()('hp_homework').where({ teacher_id: tId }).orderBy('assigned_date', 'desc');
  res.json(rows);
});

teacherRouter.get('/homework/:id/submissions', async (req, res) => {
  const hw = await loadOwnHomework(req, res);
  if (!hw) return;
  const rows = await portalDb()('hp_homework_submissions as sub')
    .join('hp_students as st', 'st.id', 'sub.student_id')
    .select('sub.*', 'st.full_name as studentName', 'st.roll_no')
    .where('sub.homework_id', hw.id);
  res.json(rows);
});

const gradeSchema = z.object({ grade: z.number().min(0).max(100), feedback: z.string().optional() });
teacherRouter.post('/submissions/:id/grade', async (req, res) => {
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tId = await teacherId(req);
  const submission = await portalDb()('hp_homework_submissions as sub')
    .join('hp_homework as h', 'h.id', 'sub.homework_id')
    .select('sub.id', 'h.teacher_id')
    .where('sub.id', Number(req.params.id))
    .first();
  if (!submission || submission.teacher_id !== tId) {
    res.status(403).json({ error: 'Not your homework submission.' });
    return;
  }
  await portalDb()('hp_homework_submissions').where({ id: submission.id }).update({
    grade: parsed.data.grade,
    feedback: parsed.data.feedback ?? null,
    status: 'graded',
    graded_by: req.user!.sub,
    graded_at: portalDb().fn.now(),
  });
  res.json({ ok: true });
});
