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
 * ── READ-ONLY ───────────────────────────────────────────────────────────────
 *
 * Twelve GETs, no POST/PUT/PATCH/DELETE. §27 specifies seven write routes
 * (`/mode`, `/pause`, `/resume`, `/content/refresh`, `recalculate`,
 * `rerun-decision`, `suppress` + its DELETE); all are Phase B, where a human
 * sees the consequence as they flip it. A test asserts the router registers no
 * mutating verb, and `auditMiddleware` (`adminRoutes.ts:110`) corroborates
 * independently by logging mutating requests that never arrive.
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

export default router;
