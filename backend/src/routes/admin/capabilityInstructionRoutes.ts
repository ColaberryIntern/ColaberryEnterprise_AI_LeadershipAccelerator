import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetCapabilityInstructions,
  handleSetCapabilityInstructions,
} from '../../controllers/capabilityInstructionController';

/**
 * AF11.14 — Ali's standing instructions for one capability on one agent.
 *
 * ## `requireAdmin`, and deliberately NOT a builder section
 *
 * This is the opposite call from AF11.12's drafter, for the opposite reason. Setting standing
 * instructions is part of APPROVING how an agent behaves in production: it is the condition
 * attached to a permission. `mgmtSectionGate.ts` notes that `dashboard` is the one section every
 * mgmt role carries, so putting this on a section wide enough for builders would let the person
 * who requested a capability also write the rules it runs under, which is the one thing the
 * approval step exists to prevent.
 *
 * It sits under `/api/admin/agents/:id`, which the gate already maps, so there is no new
 * `PATH_SECTION` prefix to classify. Verified by reading that map rather than assumed from the
 * shape of the URL.
 *
 * ## POST, not PUT, because the record is a LOG
 *
 * PUT would say "replace what is there", and nothing here is ever replaced: an edit appends a row
 * and the newest one is what is in force. POST is the honest verb for that, and it keeps the
 * route from implying an idempotency the table does not have — posting the same text twice
 * records two entries, which is correct, because somebody said it twice.
 */

const router = Router();

/** GET — what is in force, and every edit behind it with its author. */
router.get(
  '/api/admin/agents/:id/capabilities/:capabilityId/instructions',
  requireAdmin,
  handleGetCapabilityInstructions,
);

/** POST — set them. An empty body clears them, and that is recorded as an action. */
router.post(
  '/api/admin/agents/:id/capabilities/:capabilityId/instructions',
  requireAdmin,
  handleSetCapabilityInstructions,
);

export default router;
