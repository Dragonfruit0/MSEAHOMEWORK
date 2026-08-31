import { Router } from 'express';
import { portalDb } from '../db/portal-connection';
import { requireAuth, requireRole } from '../middleware/auth';
import { runInitialSync } from '../sync/sync-service';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

adminRouter.post('/sync', async (_req, res) => {
  const result = await runInitialSync();
  res.json(result);
});

adminRouter.get('/sync-runs', async (_req, res) => {
  res.json(await portalDb()('hp_sync_runs').orderBy('started_at', 'desc').limit(20));
});
