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

/** Long-lived, opaque, random refresh tokens are stored hashed — this just generates one. */
export function generateRefreshToken(): string {
  return jwt.sign({ nonce: Date.now() + Math.random() }, getJwtSecret() + ':refresh', {
    expiresIn: '30d',
  });
}
