import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { effectiveSections, ALL_SECTIONS, isMgmtRole, type SectionKey } from '../services/access/mgmtRoles';
import { logAuthFailure } from './authFailureLog';

export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
  // Present on bridge-minted staff tokens: the management role that scopes which
  // admin SECTIONS this login may reach (mgmtRoles.ts). Absent on legacy
  // admin_users logins, which keep full admin access.
  mgmt_role?: string;
  // C82 (H4 option A): sections granted on top of mgmt_role, minted from community_members.mgmt_extra_sections. Only ever read
  // together with a valid mgmt_role (effectiveSections), so it cannot widen a legacy admin or a token without a role.
  mgmt_extra_sections?: string[];
  // Present on a legacy admin_users login whose email matches a staff
  // CommunityMember — the enrollment id to bridge into via "AI Training"
  // (POST /api/admin/portal/enter). Deliberately separate from `mgmt_role`:
  // this only marks "a connected portal account exists," it must NEVER feed
  // adminAllowedSections() or it would narrow a legacy full admin's sections
  // to that role's scope. On a bridge-minted token this is unset — `sub` IS
  // the enrollment id there already (see mintMgmtAdminToken).
  portal_enrollment_id?: string;
}

/**
 * The admin sidebar SECTIONS this identity may access. Legacy full admins
 * (admin_users role admin/super_admin, no mgmt_role) get everything — unchanged.
 * A bridge-minted staff token is scoped strictly to its management role's
 * sections. Anything else gets no admin sections. This is the authoritative
 * source both requireSection() and GET /api/admin/me read from.
 *
 * 'sales' (the lead-queue rep role, provisioned by
 * backend/src/scripts/provisionSalesReps20260809.js) resolves to the single
 * 'leads' section. Before 2026-08-09 it fell through to `[]`, so a rep logged
 * in to a completely empty sidebar with no route to the lead queue at all,
 * while the 16 requireSalesOrAdmin lead routes they were provisioned for sat
 * there unreachable. The API scope is unchanged by this — requireSalesOrAdmin
 * still decides what data they may touch; this only lets the shell render it.
 */
export function adminAllowedSections(payload: Pick<AuthPayload, 'role' | 'mgmt_role'> & Pick<Partial<AuthPayload>, 'mgmt_extra_sections'>): SectionKey[] {
  // C82: the role's sections plus any extra grants (effectiveSections), never more than the real section keys
  if (payload.mgmt_role) return effectiveSections(payload.mgmt_role, payload.mgmt_extra_sections);
  if (payload.role === 'super_admin' || payload.role === 'admin') return [...ALL_SECTIONS];
  if (payload.role === 'sales') return ['leads'];
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

/**
 * The management roles that are NOT section-scoped: `owner` holds every section and `admin` holds
 * all but Inbox, and `mgmtSectionGate` treats the latter as `isBroad` — it denies them only a
 * path mapped to a section they lack, and passes unmapped paths. Every other `mgmt_role` is
 * scoped and is refused an unmapped path by that gate.
 *
 * Kept as its own constant rather than inlined into `requireFullAdmin` so there is one statement
 * of "broad" to read, and so `mgmtRoleScoping.test.ts` can assert it against `MGMT_ROLE_DEFS`
 * rather than against a literal: a new near-full role added there and not here would be refused
 * every action, which is the safe direction but still a surprise worth failing a test over.
 */
const BROAD_MGMT_ROLES = new Set(['owner', 'admin']);

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
  } catch (err) {
    logAuthFailure('admin_auth_failed', err, 'admin', req.ip, req);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * The identities that may take an IRREVERSIBLE platform action, as opposed to reading about one.
 *
 * ## The gap this closes
 *
 * `requireAdmin` above checks `payload.role` only, and `mintMgmtAdminToken` sets
 * `role = mgmt === 'owner' ? 'super_admin' : 'admin'` for EVERY management role. So a mentor, a
 * support rep and a community organizer all carry `role: 'admin'` and all pass `requireAdmin`.
 * It is a check that the caller is an admin-portal identity at all — not a check that they are a
 * full admin — and several comments in `mgmtSectionGate.ts` lean on it as though it were the
 * second thing.
 *
 * That did not matter while the surfaces it guards were also UNMAPPED in `PATH_SECTION`, because
 * the gate is deny-by-default for scoped roles and refused them earlier. It matters the moment a
 * prefix is classified so that somebody can READ it: the gate is path-based and cannot tell
 * `GET /ai-ops/overview` from `POST /ai-ops/emergency-stop`, so classifying the prefix to a
 * section a scoped role holds would hand that role the emergency stop, the kill switch, safe
 * mode, and agent run/restart/control. This is the guard that makes reading and acting separable.
 *
 * ## Deliberately defined as "whoever reaches an unmapped admin path today"
 *
 * Legacy admins (no `mgmt_role`, so they skip `mgmtSectionGate` entirely), `owner`, and the
 * near-full `admin` role — whose `isBroad` branch in that gate denies only mapped-and-forbidden
 * paths and therefore passes unmapped ones. Scoped roles are exactly the set the gate already
 * refuses on an unmapped path.
 *
 * The point of matching that set precisely is that applying this guard **takes access from
 * nobody**. Anybody who can POST to one of these routes today still can. It only becomes load
 * bearing for an identity granted a read section it did not previously hold, which is the whole
 * change it exists to make safe.
 *
 * `requireAdmin` is left exactly as it is. Narrowing it would silently change every one of the
 * hundreds of routes that use it, which is a far bigger decision than this one and not mine.
 */
export function requireFullAdmin(req: Request, res: Response, next: NextFunction): void {
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
    // A scoped management role may READ these surfaces when its section allows; it may not act
    // on them. The refusal names the distinction, because "Admin access required" on a page the
    // caller is looking at reads as a bug rather than as a boundary.
    if (payload.mgmt_role && !BROAD_MGMT_ROLES.has(payload.mgmt_role)) {
      res.status(403).json({
        error: 'This action is limited to a full administrator. Your role can view this surface '
          + 'but not change it.',
        code: 'full_admin_required',
      });
      return;
    }
    req.admin = payload;
    next();
  } catch (err) {
    logAuthFailure('full_admin_auth_failed', err, 'admin', req.ip, req);
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
  } catch (err) {
    logAuthFailure('sales_or_admin_auth_failed', err, 'admin', req.ip, req);
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
/**
 * The Cory predicate, as a pure function over an already-verified identity.
 *
 * `requireCoryAuthorized` below is the middleware form, and it is the right tool when a whole
 * route belongs to Ali. It is the wrong tool when only SOME requests to a route do - Maya's
 * capability state setter, where RAISING a capability toward live is Ali's and LOWERING it is
 * any admin's, so the authority depends on the body, not on the path. Those handlers run behind
 * `requireAdmin` (which has already verified the token and populated `req.admin`) and then ask
 * this predicate. Extracted rather than restated so there is one definition of "Ali or a
 * super_admin" and not two that can drift apart.
 */
export function isCoryAuthorizedIdentity(
  identity: { email?: string | null; role?: string | null } | undefined | null,
): boolean {
  return identity?.email === 'ali@colaberry.com' || identity?.role === 'super_admin';
}

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

    const isAuthorized = isCoryAuthorizedIdentity(payload);
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
  } catch (err) {
    logAuthFailure('cory_auth_failed', err, 'admin', req.ip, req);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
