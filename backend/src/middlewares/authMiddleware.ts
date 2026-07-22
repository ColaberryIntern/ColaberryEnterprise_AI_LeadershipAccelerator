import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { sectionsForRole, ALL_SECTIONS, isMgmtRole, type SectionKey } from '../services/access/mgmtRoles';

export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
  // Present on bridge-minted staff tokens: the management role that scopes which
  // admin SECTIONS this login may reach (mgmtRoles.ts). Absent on legacy
  // admin_users logins, which keep full admin access.
  mgmt_role?: string;
}

/**
 * The admin sidebar SECTIONS this identity may access. Legacy full admins
 * (admin_users role admin/super_admin, no mgmt_role) get everything — unchanged.
 * A bridge-minted staff token is scoped strictly to its management role's
 * sections. Anything else (e.g. 'sales') gets no admin sections. This is the
 * authoritative source both requireSection() and GET /api/admin/me read from.
 */
export function adminAllowedSections(payload: Pick<AuthPayload, 'role' | 'mgmt_role'>): SectionKey[] {
  if (payload.mgmt_role) return sectionsForRole(payload.mgmt_role);
  if (payload.role === 'super_admin' || payload.role === 'admin') return [...ALL_SECTIONS];
  return [];
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthPayload;
    }
  }
}

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const SALES_OR_ADMIN_ROLES = new Set(['sales', 'admin', 'super_admin']);

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (!ADMIN_ROLES.has(payload.role)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Section-aware admin guard for the management-portal RBAC. Passes only if the
 * caller's identity may reach `section` (see adminAllowedSections): legacy full
 * admins pass every section; a scoped staff (bridge-minted) token passes only
 * its role's sections; everyone else is 403. This is REAL access control — the
 * frontend also hides the nav, but this is what actually protects the API.
 * Apply it on the routers a scoped role needs (or must be excluded from), e.g.
 * `requireSection('inbox_content')` on the inbox routers so a mgmt 'admin' (who
 * lacks Inbox) is blocked even though they pass generic requireAdmin.
 */
export function requireSection(section: SectionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
      if (!adminAllowedSections(payload).includes(section)) {
        res.status(403).json({ error: 'You do not have access to this section.' });
        return;
      }
      req.admin = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Sales reps + admins. Used on lead-list, lead-detail, stage-update,
// activities, appointments, temperature. Sales role explicitly does NOT
// reach PII export, delete, batch update, manual create, CSV import, or
// any sequence/campaign management — those keep requireAdmin.
// Any valid admin-portal identity (legacy admin/super_admin/sales OR a
// bridge-minted staff mgmt token). Use where the handler self-scopes by role
// (e.g. GET /api/admin/me returning the caller's allowed sections) — NOT as
// section access control (that's requireSection).
const ANY_ADMIN_ROLES = new Set(['admin', 'super_admin', 'sales']);
export function requireAnyAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (!ANY_ADMIN_ROLES.has(payload.role) && !isMgmtRole(payload.mgmt_role)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireSalesOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (!SALES_OR_ADMIN_ROLES.has(payload.role)) {
      res.status(403).json({ error: 'Sales or admin access required' });
      return;
    }
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
