import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@homework-portal/shared';
import { verifyAccessToken, type AccessTokenPayload } from '../auth/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Every protected route resolves the caller's identity, role, and linked
 * entity from the verified JWT — never from a client-supplied body/query
 * field. This is what lets §5 of the plan promise "authorization enforced
 * server-side on every request."
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden for this role.' });
      return;
    }
    next();
  };
}
