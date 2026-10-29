import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  getContentHandler,
  getDecisionsHandler,
  getDistributionHandler,
  getEligibilityHandler,
  getLearnerDecisionsHandler,
  getLearnerHandler,
  getLearnerScoresHandler,
  getLearnerSignalsHandler,
  getLearnersHandler,
  getShadowHandler,
  getSummaryHandler,
  getWhyHandler,
  getCampusActivityHandler,
  getOutreachHandler,
  postContentRefreshHandler,
} from '../../controllers/explorerGrowthController';

/**
 * Explorer Growth OS — Command Center read API (spec §27).
 *
 * PATH PREFIX. Every route declares the FULL path including `/api/admin`,
 * because `adminRoutes` mounts its children with `router.use(child)` and NO
 * prefix. Every sibling file does the same; see `organizationRoutes.ts` for the
 * outage this convention prevents.
 *
 * ── PATH-SCOPED GUARD, NEVER A BARE router.use(requireAdmin) ────────────────
 *
 * `router.use('/api/admin/explorer-growth', requireAdmin)` binds the guard to
 * this prefix only. A bare `router.use(requireAdmin)` applies to every route
 * registered AFTER this router in `adminRoutes`, including public ones — which
 * has caused two production outages in this repo, most recently the calendar
 * booking endpoints 401ing for logged-out visitors. It also satisfies
 * `scripts/lint-route-auth.js`, which fails CI on an admin route file with no
 * recognised guard.
 *
 * ── FOURTEEN READS AND EXACTLY ONE WRITE (Phase 2, 2026-10-28) ──────────────
 *
 * This router was read-only by contract until Phase 2. It now registers ONE
 * mutating route, `POST /content/refresh`, and the test that used to assert "no
 * mutating verb at all" was deliberately amended in the same change to assert
 * exactly one POST at exactly that path. That is a narrower claim than it looks:
 * a second write appearing here still fails it.
 *
 * WHY THIS ONE AND NOT THE OTHER SIX. §27 specifies seven writes — `/mode`,
 * `/pause`, `/resume`, `/content/refresh`, `recalculate`, `rerun-decision`,
 * `suppress` + its DELETE. Six of them change what the system WILL DO to real
 * learners; `/mode` in particular is the governance boundary whose upper values
 * begin sending to 153 people, and a kill switch that looks clickable but does
 * nothing is worse than none. This one only re-runs a rendering stage whose output
 * cannot be sent: the drafts it writes carry a status the sender's claim predicate
 * excludes, asserted against the sender's own source. Its blast radius is model
 * spend, capped in both the body schema and the service.
 *
 * The other six remain absent, and the Settings tab still says so on the page.
 * `auditMiddleware` (`adminRoutes.ts:110`) logs mutating requests, so this one is
 * recorded when it is used rather than merely permitted.
 *
 * ── OUT OF SCOPE, DECLARED RATHER THAN OMITTED ──────────────────────────────
 *
 * §27 lists fourteen GETs. `/forecast` and `/experiments` belong to EPIC 12 and
 * have nothing behind them — `explorer_experiment_assignments` is empty and no
 * forecast exists. Building them now would produce endpoints that return
 * nothing, which is the failure this programme keeps finding. A test asserts
 * they are ABSENT, so they cannot appear without a deliberate change.
 */

const router = Router();

const BASE = '/api/admin/explorer-growth';

/** Path-scoped, mounted before any route below it. */
router.use(BASE, requireAdmin);

// Overview
router.get(`${BASE}/summary`, getSummaryHandler);
router.get(`${BASE}/distribution`, getDistributionHandler);

// Campus activity + the staff outreach list (2026-10-26)
router.get(`${BASE}/campus`, getCampusActivityHandler);
router.get(`${BASE}/outreach`, getOutreachHandler);

// Journey + the learner drawer
router.get(`${BASE}/learners`, getLearnersHandler);
router.get(`${BASE}/learners/:enrollmentId`, getLearnerHandler);
router.get(`${BASE}/learners/:enrollmentId/signals`, getLearnerSignalsHandler);
router.get(`${BASE}/learners/:enrollmentId/decisions`, getLearnerDecisionsHandler);
router.get(`${BASE}/learners/:enrollmentId/scores`, getLearnerScoresHandler);

// Decisions + the Why drilldown
router.get(`${BASE}/decisions`, getDecisionsHandler);
router.get(`${BASE}/decisions/:id`, getWhyHandler);

// Shadow + Content
router.get(`${BASE}/shadow`, getShadowHandler);
router.get(`${BASE}/content`, getContentHandler);

// Eligibility
router.get(`${BASE}/eligibility/:enrollmentId`, getEligibilityHandler);

// The one write. Registered last so the read surface above stays readable as a
// block, and so a reviewer scanning this file sees the reads end before it begins.
router.post(`${BASE}/content/refresh`, postContentRefreshHandler);

export default router;
