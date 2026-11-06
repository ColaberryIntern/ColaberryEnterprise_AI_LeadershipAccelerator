import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleAssignExistingTool } from '../../controllers/assignExistingToolController';

/**
 * AF11.4 — the one route that carries out an assignment decision.
 *
 * ## Why this is not a line in `toolRequestDecisionRoutes.ts`
 *
 * That file is one of the seven `toolRequestDecisionGrantsNothing.test.ts` reads by name to prove
 * the AF11.3 decision subtree cannot reach a grant. Mounting this handler there would route a
 * grant through a file whose whole claim is that it does not — and because the pin matches module
 * paths against a vocabulary, `assignExistingToolController` would not have tripped it. The test
 * would have stayed green while the property it protects quietly stopped holding, which is
 * exactly the "the gate becomes decoration" failure that test's own header warns about. A
 * separate file keeps the pin honest and keeps the seam visible.
 *
 * ## `requireAdmin`, not `requireSection`
 *
 * The same reasoning AF3.5's and AF11.3's routes record, and it binds hardest here because this
 * is the route that actually grants. `mgmtSectionGate.ts` notes that `dashboard` is the one
 * section every mgmt role carries, so any section grant wide enough to reach this path would hand
 * a mentor or a support rep the moment an agent stops observing and starts acting.
 *
 * And the route is the first of THREE gates, not two. The route decides who may call. The AF11.4
 * contract decides whether there is a decision to carry out and whether this caller is the person
 * who made it. AF3.5's grant contract decides whether the grant itself may stand — a recorded
 * human, a configured approver, not the proposer, a registered tool, a confirmed capability.
 * Widening the route therefore cannot widen who may grant.
 *
 * ## No new `PATH_SECTION` row
 *
 * `mgmtSectionGate` is deny-by-default and an unmapped prefix reaches its final 403 with nothing
 * in the response explaining why, so a new prefix has to be classified in the same change that
 * introduces it. This path is not new: `/api/admin/agent-domain-tool-requests` is already mapped
 * to `program`, which is what AF11.3's two routes ride on. Verified by reading that map rather
 * than assumed from the shape of the URL.
 */

const router = Router();

/**
 * POST — grant the tool a recorded `assign_existing_tool` decision already chose.
 *
 * Deliberately a sibling of `/decide` rather than something `/decide` does for you. The decision
 * is committed first and this carries it out, so a refused grant leaves the decision standing
 * with a reason attached, instead of erasing a decision Ali did make. It takes no body: the
 * tool, the agent, the capability and the approver all come from records that already exist.
 */
router.post(
  '/api/admin/agent-domain-tool-requests/:id/assign-tool',
  requireAdmin,
  handleAssignExistingTool,
);

export default router;
