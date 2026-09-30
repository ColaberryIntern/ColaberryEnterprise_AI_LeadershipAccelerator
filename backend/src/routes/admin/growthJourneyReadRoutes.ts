import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { growthJourneyAdminLimiter } from '../growthJourneyRateLimit';
import { env } from '../../config/env';
import {
  getJourneyByJourneyHandler,
  getJourneyMetricsHandler,
  getJourneyOutcomesHandler,
  getJourneyRatesHandler,
  getJourneyReceiptsHandler,
} from '../../controllers/growthJourneyPerformanceController';
import {
  getJourneyContentRulesHandler,
  getJourneyExperimentsHandler,
  getJourneyOfferPoliciesHandler,
  getJourneyOwnershipHandler,
  getJourneyQueuePoliciesHandler,
  getJourneyShadowRunsHandler,
  getJourneySnapshotsHandler,
  getJourneyTransitionsHandler,
} from '../../controllers/growthJourneyInspectController';

/**
 * The journey's performance reads (Phase 6, T605).
 *
 * ─── BEHIND THE MASTER FLAG, UNLIKE THE STATUS REGISTRY ─────────────────────
 *
 * T604's `growthJourneyStatusRoutes` deliberately escapes the master-flag 404,
 * because configuration is what an operator needs BEFORE deciding to flip
 * anything. These routes are the opposite case and carry the flag: they read
 * decisions, receipts and handoffs, so with the journey dark there is nothing to
 * report, and a 404 says that more honestly than a page of nulls. The guard is
 * the same one `growthJourneyRoutes` applies, applied the same way, so the
 * three routers' matrix reads: status always, performance and queues only once
 * the master flag is on.
 *
 * Mounted like its siblings - `adminRoutes` uses `router.use(child)` with no
 * prefix, so the guards here are PATH-SCOPED (`router.use(BASE, …)`). A bare
 * `router.use(requireAdmin)` would bind to every route registered after this
 * file, public ones included.
 *
 * `GET …/performance/rates`, `…/receipts`, `…/outcomes` and `…/by-journey` are
 * T606's and mount here beside this one.
 */

const router = Router();
const JOURNEY = '/api/admin/growth-journey';
const BASE = `${JOURNEY}/performance`;

// T612. Path-scoped (never bare - it would gate unrelated routers) and ahead of
// `requireAdmin` so unauthenticated floods count too. Why one shared instance:
// `growthJourneyRateLimit.ts`.
// Scoped at JOURNEY rather than BASE: eight routes in this file sit directly on the
// bare prefix, and a limiter on `/performance` would leave every one of them unbounded.
router.use(JOURNEY, growthJourneyAdminLimiter);
router.use(BASE, requireAdmin);

/** Master off => these paths do not exist. Resolved per request so a test can flip it. */
function requireGrowthJourneyEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!env.growthJourney.growthJourneyEnabled) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}
router.use(BASE, requireGrowthJourneyEnabled);

// Five GETs, no write path. `/metrics` is the registry's figures (T605); the other four are what
// those figures drill into (T606): the per-brand handoff rates behind the pooled ones, the receipts,
// the outcomes, and the Marketing Ops brand x programme x path roll-up through its own service.
router.get(`${BASE}/metrics`, getJourneyMetricsHandler);
router.get(`${BASE}/rates`, getJourneyRatesHandler);
router.get(`${BASE}/receipts`, getJourneyReceiptsHandler);
router.get(`${BASE}/outcomes`, getJourneyOutcomesHandler);
router.get(`${BASE}/by-journey`, getJourneyByJourneyHandler);

/* ── T607: the inspect reads, four more groups under the same journey prefix ─── */

/**
 * The guards are registered per GROUP, not once over `/api/admin/growth-journey`.
 *
 * A single `router.use('/api/admin/growth-journey', …)` here would be shorter and would also run
 * for every request that falls THROUGH this router to the ones mounted after it - `growthJourneyRoutes`
 * (harmless, it applies the same two itself) but also anything a later task mounts under this prefix
 * expecting to set its own rules. T604's status registry is only exempt from the master-flag 404
 * because it is mounted ABOVE this file; a broad guard here is one mount-order change away from
 * taking that exemption back. Four narrow prefixes cannot.
 */
const INSPECT_GROUPS = [
  '/api/admin/growth-journey/decisions',
  '/api/admin/growth-journey/shadow',
  '/api/admin/growth-journey/content',
  '/api/admin/growth-journey/handoffs',
  '/api/admin/growth-journey/experiments',
] as const;
for (const prefix of INSPECT_GROUPS) {
  router.use(prefix, requireAdmin);
  router.use(prefix, requireGrowthJourneyEnabled);
}

/**
 * MOUNT ORDER IS NOW LOAD-BEARING between this router and `growthJourneyRoutes`.
 *
 * That router registers `GET /api/admin/growth-journey/handoffs/:id` (Phase 4). Express matches in
 * mount order, so if this file were mounted after it, `/handoffs/policies` and `/handoffs/ownership`
 * would both be swallowed as a handoff id - a 404 for a route that exists, or worse a 200 for the
 * wrong thing. `adminRoutes.ts` mounts this file first and `adminRoutes.order.test.ts` pins it.
 */
router.get(`${JOURNEY}/decisions/snapshots`, getJourneySnapshotsHandler);
router.get(`${JOURNEY}/decisions/transitions`, getJourneyTransitionsHandler);
router.get(`${JOURNEY}/shadow/runs`, getJourneyShadowRunsHandler);
router.get(`${JOURNEY}/content/policies`, getJourneyOfferPoliciesHandler);
router.get(`${JOURNEY}/content/rules`, getJourneyContentRulesHandler);
router.get(`${JOURNEY}/handoffs/policies`, getJourneyQueuePoliciesHandler);
router.get(`${JOURNEY}/handoffs/ownership`, getJourneyOwnershipHandler);
// T608. A read: the policies in scope and the lift each has measured. Nothing here writes one.
router.get(`${JOURNEY}/experiments`, getJourneyExperimentsHandler);

export default router;
