import { Router } from 'express';
import { requireAdmin, requireSection } from '../../middlewares/authMiddleware';
import {
  handleDecideChangeRequest,
  handleFileChangeRequest,
  handleListAllChangeRequests,
  handleListMyChangeRequests,
} from '../../controllers/agentChangeRequestController';

/**
 * AF4.2 — an intern files a change request; a named human decides it.
 *
 * ## The guard is NOT the same on both halves, and that is the whole design
 *
 * Filing is self-scoped: `requireSection('dashboard')`, the same grant
 * `/api/admin/agent-domains-mine` sits on, because the service resolves the caller's identity from
 * their verified token and 403s on a domain they do not own.
 *
 * Deciding is `requireAdmin`, which checks the ROLE on the token rather than a section. Two
 * reasons, and the second is the one that matters:
 *
 *   - `dashboard` is, per `mgmtSectionGate.ts`, "the one section every mgmt role carries". So the
 *     grant that stops six interns getting a 403 on the filing route would also hand a mentor, a
 *     support rep and a community organizer the ability to approve platform changes.
 *   - the acceptance criterion is about a NAMED HUMAN approver, and the route is only the first of
 *     two gates. The service additionally requires the approver to appear in `admin_users` or
 *     `org_members`, refuses the four-hour timer identity, and refuses self-approval. The route
 *     decides who may call; the service decides whose decision may stand.
 *
 * ## Two `PATH_SECTION` rows land in the same change as these routes
 *
 * `mgmtSectionGate` is DENY-BY-DEFAULT: an unmapped prefix reaches its final 403 with nothing in
 * the response explaining why. Classifying the paths later rather than now is how a surface ships
 * broken for exactly the audience it was built for.
 *
 * The `-mine` row is listed before the broader one for consistency with the
 * `agent-domains-mine` / `agent-domains` pair. Note that `matchesPrefix` requires an exact match or
 * a `/` boundary, so the broader row could not have swallowed `-mine` in any case - the ordering is
 * house style here, not a shadowing fix.
 *
 * ## Nothing here triggers a build
 *
 * An approval records a decision and stops. That is the ticket's fourth acceptance criterion, and
 * `agentChangeRequestNoTrigger.test.ts` asserts it against this file and the service by name rather
 * than leaving it to a reader.
 */

const router = Router();

/** POST — an intern files one against a domain they own. 201, or 400/403. */
router.post(
  '/api/admin/agent-domain-change-requests-mine',
  requireSection('dashboard'),
  handleFileChangeRequest,
);

/** GET — an intern's own requests, across every domain they own. */
router.get(
  '/api/admin/agent-domain-change-requests-mine',
  requireSection('dashboard'),
  handleListMyChangeRequests,
);

/** GET — the whole queue, for the person who triages it. Optional `?status=`. */
router.get(
  '/api/admin/agent-domain-change-requests',
  requireAdmin,
  handleListAllChangeRequests,
);

/** POST — approve or decline. 200, or 400/403/404/409. No build is started. */
router.post(
  '/api/admin/agent-domain-change-requests/:id/decide',
  requireAdmin,
  handleDecideChangeRequest,
);

export default router;
