import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleDecideToolRequest,
  handleListToolRequestDecisions,
} from '../../controllers/toolRequestDecisionController';

/**
 * AF11.3 — the review console's routes. Both are `requireAdmin`, and both halves of that matter.
 *
 * ## Why not `requireSection`, when the console is a page
 *
 * `mgmtSectionGate.ts` records that `dashboard` is "the one section every mgmt role carries". A
 * section grant wide enough to let the console open would hand a mentor, a support rep and a
 * community organizer the ability to settle a tool grant — the moment an agent stops observing and
 * starts acting. `requireAdmin` checks the ROLE on the token instead.
 *
 * And the route is only the first of two gates. The service additionally requires the decider to
 * resolve to a recorded human, to be one of the configured approvers, and not to be the person who
 * filed the request. **The route decides who may call; the service decides whose decision may
 * stand.** That division is the same one AF4.2's routes record, and it is why widening the route
 * later could not quietly widen who may approve.
 *
 * The history route is `requireAdmin` too, deliberately. It names who decided what, which is an
 * audit trail rather than a status, and a wider grant on the read would let anybody who can open a
 * dashboard page read Ali's decision log.
 *
 * ## Two `PATH_SECTION` rows land in the same change as these routes
 *
 * `mgmtSectionGate` is DENY-BY-DEFAULT: an unmapped prefix reaches its final 403 with nothing in
 * the response explaining why. Classifying a path later rather than now is how a surface ships
 * broken for exactly the audience it was built for.
 *
 * ## Nothing here grants anything
 *
 * `assign_existing_tool` records an INTENT. The grant against `ai_agents.tools_granted` is AF11.4,
 * and `toolRequestDecisionGrantsNothing.test.ts` asserts against this file and the service by name
 * that neither of them so much as mentions that column, or `autonomy_level`, or `enabled`, or
 * `abac_mode_override`. AF11.3's sharpest warning is that a console which grants a tool and lifts
 * an autonomy level in one action means nobody separately decided the agent may act more freely.
 */

const router = Router();

/** POST — approve to build, deny, assign an existing tool, or send it back. 200/400/404/409. */
router.post(
  '/api/admin/agent-domain-tool-requests/:id/decide',
  requireAdmin,
  handleDecideToolRequest,
);

/** GET — the decisions already made on one request, oldest first. */
router.get(
  '/api/admin/agent-domain-tool-requests/:id/decisions',
  requireAdmin,
  handleListToolRequestDecisions,
);

export default router;
