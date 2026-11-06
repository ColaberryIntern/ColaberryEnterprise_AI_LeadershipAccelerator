import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGrantTool,
  handleListAgentGrants,
} from '../../controllers/agentToolGrantController';

/**
 * AF3.5 — the grant endpoint, and the read of what an agent has been granted.
 *
 * ## `requireAdmin`, not `requireSection`
 *
 * Same reasoning as AF11.3's decide route, and it matters more here because this one actually
 * writes. `mgmtSectionGate.ts` records that `dashboard` is the one section every mgmt role
 * carries, so any section grant wide enough to reach this route would hand a mentor or a support
 * rep the moment an agent stops observing and starts acting.
 *
 * The route is the first of two gates. The service additionally requires the approver to resolve
 * to a recorded human, to be one of the configured approvers, and not to be the person who asked
 * for the capability. **The route decides who may call; the service decides whose decision may
 * stand.** Widening the route later therefore cannot quietly widen who may grant.
 *
 * ## One `PATH_SECTION` row lands in the same change as these routes
 *
 * `mgmtSectionGate` is deny-by-default, and an unmapped prefix reaches its final 403 with
 * nothing in the response explaining why. Classifying the path later rather than now is how a
 * surface ships broken for exactly the audience it was built for.
 *
 * ## This is the only route in the repository that writes `tools_granted`
 *
 * `aiOpsController` refuses the column by name with a 400. The boot seed writes it from source
 * literals and now unions in what is recorded here. `agentToolGrantWritesOneColumn.test.ts`
 * pins the importer set, so a second writer cannot appear without a visible line in a diff.
 */

const router = Router();

/** POST — grant one registered tool to one agent for one confirmed capability. 200/400/409. */
router.post('/api/admin/agent-tool-grants', requireAdmin, handleGrantTool);

/** GET — every grant recorded against one agent, oldest first. An audit trail. */
router.get('/api/admin/agent-tool-grants/:agentId', requireAdmin, handleListAgentGrants);

export default router;
