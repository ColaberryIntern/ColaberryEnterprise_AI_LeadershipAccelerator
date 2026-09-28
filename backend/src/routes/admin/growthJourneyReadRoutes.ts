import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { env } from '../../config/env';
import {
  getJourneyByJourneyHandler,
  getJourneyMetricsHandler,
  getJourneyOutcomesHandler,
  getJourneyRatesHandler,
  getJourneyReceiptsHandler,
} from '../../controllers/growthJourneyPerformanceController';

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
const BASE = '/api/admin/growth-journey/performance';

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

export default router;
