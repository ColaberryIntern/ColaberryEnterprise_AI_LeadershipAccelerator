import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleConfirmCapability,
  handleGetConfirmation,
} from '../../controllers/capabilityConfirmationController';

/**
 * AF11.0 — the missing half of the confirmation step.
 *
 * ## Authorization is two-layered on purpose. Do not collapse it.
 *
 * `requireAdmin` admits both `admin` and `super_admin`. The service then refuses anything but
 * `super_admin` — `CONFIRMING_ROLE`, Ali's ruling of 4 Nov 2026 — and refuses it by NAME, as
 * `confirmer_not_super_admin`, beside any other reason the confirmation would not stand.
 *
 * Putting a role guard here instead would turn that into a bare 403 and throw the sentence away.
 * An `admin` would learn they were rejected without learning that the rule is about who may
 * confirm, and if their evidence were also incomplete they would discover that only on a second
 * attempt. The layering costs nothing and the legibility is the whole point of the contract.
 *
 * ## The gate row is not optional
 *
 * `/api/admin/agent-domain-capability-confirmations` gets its own `mgmtSectionGate` row in this
 * change, mapped to `program` alongside `agent-domain-capability-board` and `agent-tool-grants`.
 * That gate is DENY-BY-DEFAULT: an unmapped prefix reaches a 403 with nothing in the logs
 * saying why, which is how a route ships looking broken while every unit test passes.
 * `capabilityConfirmationRoutes.access.test.ts` asserts the row exists for exactly that reason.
 */

const router = Router();

/** POST — record a confirmation. The only way a row enters `agent_domain_capability_confirmations`. */
router.post(
  '/api/admin/agent-domain-capability-confirmations',
  requireAdmin,
  handleConfirmCapability,
);

/** GET — read one capability's confirmation, so the write above is checkable without a grant attempt. */
router.get(
  '/api/admin/agent-domain-capability-confirmations/:capabilityId',
  requireAdmin,
  handleGetConfirmation,
);

export default router;
