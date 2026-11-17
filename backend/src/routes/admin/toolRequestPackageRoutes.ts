import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetToolRequestPackage,
  handlePutToolRequestPackage,
} from '../../controllers/toolRequestPackageController';

/**
 * AF11.8 — the ten-block decision package: writing it, and reading it back.
 *
 * ## Both are `requireAdmin`, and the write is the one worth explaining
 *
 * Writing a package grants nothing and decides nothing. It is the ARGUMENT for a decision, and
 * the decision routes next door are where the approver rules live. So the question here is not
 * "who may approve" but "who may put something in front of Ali", and `requireAdmin` is the same
 * answer AF11.3 gave for the console itself.
 *
 * A wider gate would let anybody who can open a dashboard page write the case Ali reads, which is
 * a quieter version of the thing AF11.3's own routes refuse: `mgmtSectionGate` records that
 * `dashboard` is "the one section every mgmt role carries", so a section grant wide enough to
 * reach this would hand a mentor or a support rep the ability to compose the argument for an
 * agent being allowed to act.
 *
 * ## NO NEW `PATH_SECTION` ROW LANDS WITH THIS CHANGE, and that is checked rather than assumed
 *
 * `mgmtSectionGate` is DENY-BY-DEFAULT, so an unmapped prefix reaches its final 403 with nothing
 * in the logs saying why — which is how a route ships looking broken. These paths sit under
 * `/api/admin/agent-domain-tool-requests`, already mapped to the `program` section at
 * `mgmtSectionGate.ts:178` by AF11.3. The prefix mapping covers them, so adding a row would be a
 * duplicate rather than a requirement.
 *
 * ## PUT, not POST
 *
 * One package per request, enforced by the primary key on the detail table's sibling. PUT says
 * "this is now the package" rather than "here is another one", which is the truthful verb for a
 * row that is replaced rather than appended. The decision log next door is POST for the opposite
 * reason: decisions accumulate and none of them replaces an earlier one.
 */

const router = Router();

/**
 * PUT — write or rewrite the package.
 *
 * 200 whether the package is complete or bounced: an incomplete one is SAVED and comes back with
 * the outstanding blocks named, because the ticket's word is "bounces", not "refuses". 400 only
 * for a payload of the wrong shape or one the row's constraints cannot hold at all. 409 once the
 * request has been decided, because rewriting then would change the argument after it was read.
 */
router.put(
  '/api/admin/agent-domain-tool-requests/:id/package',
  requireAdmin,
  handlePutToolRequestPackage,
);

/** GET — one request's package and its readiness. */
router.get(
  '/api/admin/agent-domain-tool-requests/:id/package',
  requireAdmin,
  handleGetToolRequestPackage,
);

export default router;
