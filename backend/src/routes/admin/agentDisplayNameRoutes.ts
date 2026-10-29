import { Router } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { handleSetAgentDisplayName } from '../../controllers/agentDisplayNameController';

/**
 * AF10.6 — the one route that lets an intern name their own agent.
 *
 * ## Why this is its own router and not another handler in `agentDomainRoutes`
 *
 * The same reason `agentNudgeRoutes` is separate, and the file says it in its own header:
 * `agentDomainRoutes` "provisions nothing, approves nothing, and writes nothing". This route
 * writes. Folding a write into a file that documents itself as a pure read surface would make the
 * next reader of that header wrong.
 *
 * ## The section is `dashboard`, matching the surface the intern is already on
 *
 * `/api/admin/agent-domains-mine` sits on `requireSection('dashboard')` because it is
 * self-scoped: it resolves the caller's identity from their verified token and returns only what
 * they own. This route has the same property — the service checks the agent against that same
 * ownership chain and 403s otherwise — so it belongs on the same grant. Not `program`, which is
 * the wider audience that reads the ten domains without learning who builds them.
 *
 * Deliberately NOT `internship`: that wider grant exists for surfaces carrying a builder's name
 * and address. This one carries neither.
 *
 * ## `scripts/lint-route-auth.js` is per FILE, not per route
 *
 * So a file whose single route carried no guard would still pass if any route in it did. There is
 * one route here and it is guarded, and `__tests__/agentDisplayNameRoutes.access.test.ts`
 * enumerates it explicitly rather than trusting the file-level lint — the same thing
 * `agentNudgeRoutes.access.test.ts` does for its three.
 */

const router = Router();

/**
 * PATCH /api/admin/agents/:agentId/display-name
 *
 * Body `{ display_name }`. 200 stored, 400 unusable name, 403 not your agent, 409 name taken.
 */
router.patch(
  '/api/admin/agents/:agentId/display-name',
  requireSection('dashboard'),
  handleSetAgentDisplayName,
);

export default router;
