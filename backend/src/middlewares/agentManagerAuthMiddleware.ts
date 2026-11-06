import { Request, Response, NextFunction } from 'express';
import { requireAdmin } from './authMiddleware';
import { logAuthFailure } from './authFailureLog';
import OrgMember from '../models/OrgMember';
import { isAgentInHumanDownstream } from '../services/workforce/orgChartHierarchyService';
import { isVerifiedDomainBuilderOfAgent } from '../services/agentDomain/domainBuilderAgentAccess';

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
      /** Set by requireAgentManagerOrDomainBuilder when the caller passed as the
       * verified intended BUILDER of this agent's domain rather than as its
       * manager. Present only on the read path, so a handler can tell the two
       * apart without re-deriving either. */
      agentDomainBuilderEmail?: string;
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

      resolveAndCheck(req, res, next, agentId, false);
    });
  };
}

/**
 * requireAgentManagerOrDomainBuilder — the same gate, plus a READ-ONLY path for the person
 * assigned to build this agent.
 *
 * ## Why a second named export rather than an option on the first
 *
 * This gate is registered on 32 routes, and most of them are writes: approving the agent's
 * memory proposals, approving or rejecting manager-inbox items, revoking directives, sending
 * manager messages, flipping behaviour switches, replacing the role charter. A boolean buried in
 * an options object on the existing factory would make those call sites look identical to these
 * ones, and the difference between them is who may change an agent.
 *
 * A separate name means a reviewer reading a route file sees which routes a builder can reach
 * without opening this file. `__tests__/agentManagerOrDomainBuilderRoster.test.ts` pins the exact
 * set and fails if anyone adds a fifth — the same reviewer-forcing move the `ensure*` boot roster
 * uses, and for the same reason.
 *
 * ## The GET restriction is enforced HERE, not by convention
 *
 * Every route that opts in today is a `router.get`, and the roster test asserts that. This gate
 * ALSO refuses the builder path on any non-GET method, so adding this gate to a POST route
 * tomorrow grants nothing. Two independent guards, because "we only put it on GETs" is a habit
 * and habits are not access control.
 */
export function requireAgentManagerOrDomainBuilder(agentIdParam = 'id') {
  return function agentManagerOrDomainBuilderGate(req: Request, res: Response, next: NextFunction): void {
    requireAdmin(req, res, (err?: unknown) => {
      if (err) { next(err); return; }
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

      resolveAndCheck(req, res, next, agentId, true);
    });
  };
}

async function resolveAndCheck(
  req: Request,
  res: Response,
  next: NextFunction,
  agentId: string,
  allowDomainBuilder: boolean,
): Promise<void> {
  try {
    // THE MANAGER PATH, unchanged. Note the org_member lookup no longer refuses immediately when
    // it finds nothing: being a builder does not require an org_members row, because
    // `intended_builder` resolves through community_members instead. The original refusal still
    // happens, just after the builder path has had its turn, so the message a manager sees is
    // byte-identical to what it was before.
    const orgMember = await OrgMember.findOne({ where: { email: req.admin!.email } });

    if (orgMember) {
      const inChain = await isAgentInHumanDownstream(orgMember.id, agentId);
      if (inChain) {
        req.agentManagerOrgMemberId = orgMember.id;
        next();
        return;
      }
    }

    // THE BUILDER PATH. Read only, opted into per route, and GET only.
    //
    // ## Why this has its own try/catch instead of riding on the outer one
    //
    // The builder lookup is a SECOND database read, added to a path that already decided it was
    // going to refuse. If it throws, the outer catch turns what would have been a clean 403 for
    // an unrelated admin into a 500 — a new failure mode for callers who are not builders and
    // never were. The four `agent*Controller` tests caught exactly that, which is the reason
    // this block exists in this shape.
    //
    // So it fails CLOSED and LOUD: the error is logged with its class (never swallowed — that is
    // a production defect in this repo), the caller is treated as not-a-builder, and the refusal
    // below is the same one they got before this path existed. A database problem can cost a
    // builder their read access; it must not change what anyone else sees, and it must not pass
    // anyone through.
    if (allowDomainBuilder && req.method === 'GET') {
      let isBuilder = false;
      try {
        isBuilder = await isVerifiedDomainBuilderOfAgent(req.admin!.email, agentId);
      } catch (builderErr) {
        logAuthFailure('agent_domain_builder_lookup_failed', builderErr, 'admin', req.ip, req);
      }
      if (isBuilder) {
        req.agentDomainBuilderEmail = req.admin!.email;
        next();
        return;
      }
    }

    if (!orgMember) {
      res.status(403).json({ error: 'No linked org member record for this admin — cannot resolve a management relationship to this agent.' });
      return;
    }
    res.status(403).json({ error: 'This agent is not in your reporting chain.' });
  } catch (err) {
    logAuthFailure('agent_manager_auth_failed', err, 'admin', req.ip, req);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}
