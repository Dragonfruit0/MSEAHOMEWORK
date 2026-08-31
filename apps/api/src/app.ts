import cors from 'cors';
import express from 'express';
import { adminRouter } from './admin/routes';
import { attachmentsRouter } from './attachments/routes';
import { authRouter } from './auth/routes';
import { branchRouter } from './branch/routes';
import { setupRouter } from './setup/routes';
import { studentRouter } from './student/routes';
import { teacherRouter } from './teacher/routes';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/setup', setupRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/branch', branchRouter);
  app.use('/api/teacher', teacherRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/attachments', attachmentsRouter);

  return app;
}
