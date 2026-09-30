import { Request, Response, NextFunction } from 'express';
import { requireAdmin } from './authMiddleware';
import { logAuthFailure } from './authFailureLog';
import OrgMember from '../models/OrgMember';
import { isAgentInHumanDownstream } from '../services/workforce/orgChartHierarchyService';

/**
 * requireAgentManagerOrAdmin — the AI Workforce Management manager-authorization
 * gate (Checkpoint B, first slice; see docs/architecture/ai-workforce-management/
 * MANAGER_AUTHORIZATION_MAP.md for the full design record).
 *
 * Distinguishes what plain `requireAdmin` cannot: a direct/upstream human manager of
 * THIS agent, a platform superadmin, or an unrelated admin who should be blocked.
 * `requireAdmin`'s existing role check runs first unchanged — this only narrows it
 * further, never widens it.
 *
 * Identity resolution is deliberately server-side only: the target org_member is
 * resolved from the JWT-verified `req.admin.email`, never from a client-supplied
 * request param. This is the exact gap found in the existing (unrelated, shipped
 * 2026-08-19) `orgChartTaskAssignmentService.ts::assignTaskToAgent()` precedent,
 * whose caller (`workforceController.ts::handleAssignHierarchyTask`) takes
 * `orgMemberId` straight from `req.params.id` with no check that the authenticated
 * caller actually IS that org member — flagged separately for Ali's review, not
 * fixed here (different route, different feature, out of this PR's scope).
 *
 * `email` is the deliberate join key, matching this repo's own established
 * convention (see `platformIdentityService.ts`'s "email is used as the join key...
 * nothing here matches on name, phone, or fuzzy similarity").
 */

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAgentManagerOrAdmin once the caller's own org_member
       * record is resolved — the human's identity for audit/logging purposes,
       * NOT the target agent's. Unset when the caller passed as a platform
       * superadmin (no org_member resolution needed for that path). */
      agentManagerOrgMemberId?: string;
    }
  }
}

const PLATFORM_SUPERADMIN_ROLES = new Set(['super_admin']);

/**
 * @param agentIdParam the Express route param carrying the target agent's
 *   `ai_agents.id`. Defaults to `'id'` (matches `agentDetailRoutes.ts`'s
 *   `/api/admin/agents/:id`).
 */
export function requireAgentManagerOrAdmin(agentIdParam = 'id') {
  return function agentManagerOrAdminGate(req: Request, res: Response, next: NextFunction): void {
    requireAdmin(req, res, (err?: unknown) => {
      if (err) { next(err); return; }
      // requireAdmin already sent a 401/403 response and did not call next() in
      // that case, so reaching here means req.admin is genuinely set.
      if (!req.admin) return;

      const agentId = String(req.params[agentIdParam] || '');
      if (!agentId) {
        res.status(400).json({ error: `Missing route param "${agentIdParam}"` });
        return;
      }

      if (PLATFORM_SUPERADMIN_ROLES.has(req.admin.role)) {
        next();
        return;
      }

      resolveAndCheck(req, res, next, agentId);
    });
  };
}

async function resolveAndCheck(req: Request, res: Response, next: NextFunction, agentId: string): Promise<void> {
  try {
    const orgMember = await OrgMember.findOne({ where: { email: req.admin!.email } });
    if (!orgMember) {
      res.status(403).json({ error: 'No linked org member record for this admin — cannot resolve a management relationship to this agent.' });
      return;
    }

    const inChain = await isAgentInHumanDownstream(orgMember.id, agentId);
    if (!inChain) {
      res.status(403).json({ error: 'This agent is not in your reporting chain.' });
      return;
    }

    req.agentManagerOrgMemberId = orgMember.id;
    next();
  } catch (err) {
    logAuthFailure('agent_manager_auth_failed', err, 'admin', req.ip, req);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}
