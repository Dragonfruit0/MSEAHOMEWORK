import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@homework-portal/shared';

export interface AccessTokenPayload {
  sub: number; // hp_users.id
  role: Role;
  linkedEntityType: string | null;
  linkedEntityId: number | null;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set.');
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getJwtSecret()) as unknown as AccessTokenPayload;
}

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Long-lived, opaque, random refresh tokens. Only the sha256 hash is ever
 * stored (hp_refresh_tokens.token_hash) so a DB read never discloses a
 * usable token, and rotation/revocation is a plain row update.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
