import { Router } from 'express';
import { requireAdmin, requireSection } from '../../middlewares/authMiddleware';
import { handleGetDatasetDetail, handleSearchDatasetCatalog } from '../../controllers/datasetCatalogController';
import { handleListAgentDomainActors } from '../../controllers/agentDomainActorController';
import { handleListAgentDomainTasks } from '../../controllers/agentDomainTaskController';
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

/**
 * GET — the dataset picker's catalog. `?q=` to search, `?limit=` to page.
 *
 * `requireSection('dashboard')`, matching the FILING route rather than the deciding one, because
 * this is what a builder reads while filling the form that route accepts. Putting it behind
 * `requireAdmin` would mean the only people who can see the list are the ones who never fill in
 * the form — and `read_datasets_not_catalogued` would then be a refusal with no way to resolve it,
 * which is the shape of the problem that produced this change in the first place.
 *
 * Read-only, and it returns no row counts and no sampled values, so the widest thing a holder of
 * `dashboard` gains is the shape of the schema they are already filing requests against.
 */
router.get(
  '/api/admin/agent-domain-datasets',
  requireSection('dashboard'),
  handleSearchDatasetCatalog,
);

/**
 * GET one dataset's shape — the drill-in behind a click in the picker. AF12.2.
 *
 * Ali, 17 Nov 2026: *"If we are picking datasets we need to be able to see the data when we click
 * on it."* Same section as the list above it, for the same reason: this is read by the person
 * filling in the form, not by the person deciding it.
 *
 * `mgmtSectionGate` needs no new row. `matchesPrefix` matches on a `/` boundary, so
 * `/api/admin/agent-domain-datasets/enrollments` resolves through the row already classifying the
 * list — verified by reading that map rather than assumed from the shape of the URL.
 *
 * It returns the SHAPE of a table and never a row of it; `datasetDetail.ts` carries the boundary
 * and the reasoning, and the test beside it asserts that a sampled value cannot get through.
 */
router.get(
  '/api/admin/agent-domain-datasets/:tableName',
  requireSection('dashboard'),
  handleGetDatasetDetail,
);

/**
 * GET the queue grouped into TASKS. AF12.1.
 *
 * `requireAdmin`, matching the queue this projects rather than the filing routes above: it carries
 * every builder's requests across every domain, and a projection must not widen what it projects.
 * Optional `?request_id=` also returns that one request's task and its sibling tools.
 */
router.get(
  '/api/admin/agent-domain-tasks',
  requireAdmin,
  handleListAgentDomainTasks,
);

/**
 * GET — the people an `acts_on_output` address may name. AF11.11.
 *
 * `requireSection('dashboard')`, matching the FILING route and the dataset picker beside it, for
 * the reason the dataset picker records: a field whose refusal names a roster the filer cannot see
 * is a refusal with no way to resolve it. AF11.7 made `acts_on_output` required and refuses an
 * address that is not on this roster, so before this route a builder could only discover the
 * accepted addresses by guessing at them one submission at a time.
 *
 * Read-only, emails only, no names or roles. See the controller for why that is the whole payload.
 */
router.get(
  '/api/admin/agent-domain-actors',
  requireSection('dashboard'),
  handleListAgentDomainActors,
);

/** POST — approve or decline. 200, or 400/403/404/409. No build is started. */
router.post(
  '/api/admin/agent-domain-change-requests/:id/decide',
  requireAdmin,
  handleDecideChangeRequest,
);

export default router;
