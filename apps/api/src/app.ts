// Must be imported before any router is defined below — it patches
// Express's Router methods so a rejected promise from an async route
// handler reaches the error middleware instead of hanging the request
// forever. Discovered the hard way: Express 4 does not do this natively
// (Express 5 does), so an uncaught throw anywhere in any route handler in
// this app — every one of which is `async (req, res) => {...}` — would
// otherwise leave the client waiting until the platform's own timeout
// killed the connection (a real 30s Vercel FUNCTION_INVOCATION_TIMEOUT,
// not a hypothetical, is what surfaced this).
import 'express-async-errors';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { adminRouter } from './admin/routes';
import { attachmentsRouter } from './attachments/routes';
import { authRouter } from './auth/routes';
import { branchRouter } from './branch/routes';
import { setupRouter } from './setup/routes';
import { studentRouter } from './student/routes';
import { teacherRouter } from './teacher/routes';

export function createApp() {
  const app = express();
  // origin:true reflects the request's Origin header (rather than "*"), which
  // is required for the refresh-token cookie (credentials) to be accepted.
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/setup', setupRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/branch', branchRouter);
  app.use('/api/teacher', teacherRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/attachments', attachmentsRouter);

  // Last-resort safety net: with express-async-errors patching routers above,
  // an uncaught error in any handler now lands here instead of hanging the
  // request. Logged server-side; the client only ever gets a generic
  // message, never a stack trace or internal error detail.
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled route error:', err);
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
