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
