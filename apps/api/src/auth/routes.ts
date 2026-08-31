import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { portalDb } from '../db/portal-connection';
import { hashPassword, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken, signAccessToken, REFRESH_TOKEN_TTL_MS } from './jwt';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const REFRESH_COOKIE = 'hp_refresh';
const REFRESH_COOKIE_PATH = '/api/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

/** Issues a fresh refresh token row for a user and sets it as an httpOnly cookie. */
async function issueRefreshToken(res: import('express').Response, userId: number) {
  const token = generateRefreshToken();
  await portalDb()('hp_refresh_tokens').insert({
    user_id: userId,
    token_hash: hashRefreshToken(token),
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

async function accessTokenPayloadFor(userId: number) {
  const user = await portalDb()('hp_users').where({ id: userId, is_active: true }).first();
  if (!user) return null;
  return {
    user,
    accessToken: signAccessToken({
      sub: user.id,
      role: user.role,
      linkedEntityType: user.linked_entity_type,
      linkedEntityId: user.linked_entity_id,
    }),
  };
}

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
  await issueRefreshToken(res, user.id);

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

/**
 * Silent refresh: the frontend calls this whenever an access token (15min
 * TTL) has expired. Rotates the refresh token on every use — the old row is
 * revoked rather than reused, so a stolen-and-replayed refresh cookie is
 * detectable (the legitimate client's next refresh will fail because its
 * token was already revoked by the attacker's use).
 */
authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'No refresh token.' });
    return;
  }
  const tokenHash = hashRefreshToken(token);
  const row = await portalDb()('hp_refresh_tokens').where({ token_hash: tokenHash }).first();
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.status(401).json({ error: 'Refresh token is invalid or expired.' });
    return;
  }

  await portalDb()('hp_refresh_tokens').where({ id: row.id }).update({ revoked_at: portalDb().fn.now() });

  const result = await accessTokenPayloadFor(row.user_id);
  if (!result) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.status(401).json({ error: 'Account is no longer active.' });
    return;
  }

  await issueRefreshToken(res, row.user_id);
  res.json({
    accessToken: result.accessToken,
    mustChangePassword: result.user.must_change_password,
    user: { id: result.user.id, loginId: result.user.login_id, role: result.user.role },
  });
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await portalDb()('hp_refresh_tokens').where({ token_hash: hashRefreshToken(token) }).update({ revoked_at: portalDb().fn.now() });
  }
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  res.json({ ok: true });
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
