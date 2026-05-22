import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthPayload;
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Cory-specific authorization ────────────────────────────────────────────
//
// Cory is a stricter scope than generic admin: only identities matching the
// Cory-authorized predicate (email === 'ali@colaberry.com' OR role ===
// 'super_admin') may reach the routes. The middleware also accepts a
// participant_token from those identities so the portal (which authenticates
// via participant_token, not admin_token) can reach Cory chat — matching
// the frontend's `useCoryAvailable()` predicate symmetrically.
//
// 2026-05-22 (Plan A Phase 1): replaces the prior "no middleware at all"
// state on coryRoutes — the route file was committed in 593a5530 without
// any auth middleware, leaving 19 Cory endpoints (command, hire-agent,
// retire-agent, approve-proposal, run-evolution, etc.) callable by any
// unauthenticated request. This middleware closes that hole.
//
// Implementation note: the same `req.admin` slot is populated whether the
// source was admin_token or participant_token, so downstream Cory handlers
// that reference `req.admin` work identically without modification.
export function requireCoryAuthorized(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    // JWT payload shape varies between admin_token (AuthPayload: sub/email/role)
    // and participant_token (ParticipantPayload: sub/email/cohort_id/role).
    // They share `email`, `sub`, and a (differently-valued) `role`, which is
    // all the Cory predicate needs. A narrow interface here avoids `any`.
    interface CoryClaims { sub: string; email: string; role: string }
    const payload = jwt.verify(token, env.jwtSecret) as CoryClaims;

    const isAuthorized =
      payload?.email === 'ali@colaberry.com' || payload?.role === 'super_admin';
    if (!isAuthorized) {
      res.status(403).json({ error: 'Cory access denied' });
      return;
    }

    req.admin = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role || 'admin',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
