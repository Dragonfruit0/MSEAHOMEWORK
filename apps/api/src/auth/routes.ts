import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { portalDb } from '../db/portal-connection';
import { hashPassword, verifyPassword } from './password';
import { signAccessToken } from './jwt';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const loginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'loginId and password are required.' });
    return;
  }
  const { loginId, password } = parsed.data;

  const user = await portalDb()('hp_users').where({ login_id: loginId, is_active: true }).first();
  if (!user || !(await verifyPassword(user.password_hash, password))) {
    // Deliberately identical error for "no such user" and "wrong password".
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  await portalDb()('hp_users').where({ id: user.id }).update({ last_login_at: portalDb().fn.now() });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    linkedEntityType: user.linked_entity_type,
    linkedEntityId: user.linked_entity_id,
  });

  res.json({
    accessToken,
    mustChangePassword: user.must_change_password,
    user: {
      id: user.id,
      loginId: user.login_id,
      role: user.role,
    },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'currentPassword and a newPassword (min 8 chars) are required.' });
    return;
  }
  const userId = req.user!.sub;
  const user = await portalDb()('hp_users').where({ id: userId }).first();
  if (!user || !(await verifyPassword(user.password_hash, parsed.data.currentPassword))) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  const newHash = await hashPassword(parsed.data.newPassword);
  await portalDb()('hp_users')
    .where({ id: userId })
    .update({ password_hash: newHash, must_change_password: false });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await portalDb()('hp_users')
    .select('id', 'login_id', 'role', 'linked_entity_type', 'linked_entity_id', 'must_change_password')
    .where({ id: req.user!.sub })
    .first();
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json(user);
});
