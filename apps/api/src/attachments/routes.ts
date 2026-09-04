import { Router } from 'express';
import { portalDb } from '../db/portal-connection';
import { requireAuth } from '../middleware/auth';
import { getActiveStorageProvider } from '../storage/factory';

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

/**
 * The only path a homework/submission attachment is ever fetched through.
 * Authorizes the caller against the homework's class/section (student) or
 * ownership (teacher) before streaming — stored paths are opaque UUIDs and
 * are never handed to the client directly, by design (see plan §6).
 */
attachmentsRouter.get('/:id/download', async (req, res) => {
  const attachment = await portalDb()('hp_homework_attachments').where({ id: Number(req.params.id) }).first();
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }

  const authorized = await callerCanAccessHomework(req, attachment.homework_id);
  if (!authorized) {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }

  const { provider } = await getActiveStorageProvider();
  const result = await provider.read(attachment.stored_path);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
  res.setHeader('Content-Type', attachment.mime_type);
  if (result.redirectUrl) {
    res.redirect(result.redirectUrl);
  } else if (result.stream) {
    result.stream.pipe(res);
  } else {
    res.status(500).json({ error: 'Storage provider returned neither a stream nor a URL.' });
  }
});

/**
 * Returns preview info as JSON instead of streaming/redirecting — lets the
 * frontend embed the file inline (img/iframe/office-viewer) using the
 * signed URL directly, rather than proxying bytes through this function.
 * Same authorization check as /download; a longer-lived signed URL since an
 * embedded preview can stay open on screen far longer than a one-off
 * download click.
 */
attachmentsRouter.get('/:id/preview', async (req, res) => {
  const attachment = await portalDb()('hp_homework_attachments').where({ id: Number(req.params.id) }).first();
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  const authorized = await callerCanAccessHomework(req, attachment.homework_id);
  if (!authorized) {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }
  res.json(await buildPreviewPayload(attachment, req.params.id));
});

attachmentsRouter.get('/submission/:id/preview', async (req, res) => {
  const attachment = await portalDb()('hp_submission_attachments').where({ id: Number(req.params.id) }).first();
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  const submission = await portalDb()('hp_homework_submissions').where({ id: attachment.submission_id }).first();
  if (!submission) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  const user = req.user!;
  let authorized = user.role === 'SUPER_ADMIN';
  if (user.role === 'STUDENT') {
    authorized = submission.student_id === user.linkedEntityId;
  } else if (user.role === 'TEACHER') {
    const hw = await portalDb()('hp_homework').where({ id: submission.homework_id }).first();
    authorized = hw?.teacher_id === user.linkedEntityId;
  }
  if (!authorized) {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }
  res.json(await buildPreviewPayload(attachment, req.params.id, 'submission'));
});

async function buildPreviewPayload(
  attachment: { file_name: string; mime_type: string; stored_path: string },
  id: string,
  kind: 'homework' | 'submission' = 'homework'
) {
  const { provider } = await getActiveStorageProvider();
  // 10 minutes — long enough for a viewer left open, short enough that a
  // leaked URL (e.g. via a browser history entry) doesn't stay valid long.
  const result = await provider.read(attachment.stored_path, 600);
  return {
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    direct: Boolean(result.redirectUrl),
    url: result.redirectUrl ?? `/attachments/${kind === 'submission' ? `submission/${id}` : id}/download`,
  };
}

/**
 * Submission attachments live in a separate table (hp_submission_attachments)
 * from homework attachments, so they get their own download route rather
 * than overloading /:id/download with two different ID spaces.
 */
attachmentsRouter.get('/submission/:id/download', async (req, res) => {
  const attachment = await portalDb()('hp_submission_attachments').where({ id: Number(req.params.id) }).first();
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  const submission = await portalDb()('hp_homework_submissions').where({ id: attachment.submission_id }).first();
  if (!submission) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }

  const user = req.user!;
  let authorized = user.role === 'SUPER_ADMIN';
  if (user.role === 'STUDENT') {
    authorized = submission.student_id === user.linkedEntityId;
  } else if (user.role === 'TEACHER') {
    const hw = await portalDb()('hp_homework').where({ id: submission.homework_id }).first();
    authorized = hw?.teacher_id === user.linkedEntityId;
  }
  if (!authorized) {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }

  const { provider } = await getActiveStorageProvider();
  const result = await provider.read(attachment.stored_path);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
  res.setHeader('Content-Type', attachment.mime_type);
  if (result.redirectUrl) {
    res.redirect(result.redirectUrl);
  } else if (result.stream) {
    result.stream.pipe(res);
  } else {
    res.status(500).json({ error: 'Storage provider returned neither a stream nor a URL.' });
  }
});

async function callerCanAccessHomework(req: import('express').Request, homeworkId: number): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'TEACHER') {
    const hw = await portalDb()('hp_homework').where({ id: homeworkId }).first();
    return hw?.teacher_id === user.linkedEntityId;
  }
  if (user.role === 'STUDENT') {
    const student = await portalDb()('hp_students').where({ id: user.linkedEntityId! }).first();
    if (!student) return false;
    const target = await portalDb()('hp_homework_targets')
      .where({ homework_id: homeworkId, class_id: student.class_id })
      .andWhere((qb) => qb.whereNull('section_id').orWhere('section_id', student.section_id))
      .first();
    return Boolean(target);
  }
  return false;
}
