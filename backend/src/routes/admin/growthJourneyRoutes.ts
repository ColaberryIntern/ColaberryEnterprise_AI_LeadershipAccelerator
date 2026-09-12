import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { env } from '../../config/env';
import {
  getParticipationHandler,
  listParticipationsHandler,
} from '../../controllers/growthJourneyController';
import {
  getClassificationWhyHandler,
  listClassificationsHandler,
  overrideClassificationHandler,
} from '../../controllers/growthJourneyClassificationController';

/**
 * Growth Journey admin read routes (T207).
 *
 * ─── PATH-SCOPED GUARD, NEVER A BARE router.use(requireAdmin) ────────────────
 *
 * Copied from `explorerGrowthRoutes.ts`, and the reason is the same:
 * `adminRoutes` mounts its children with `router.use(child)` and NO prefix, so
 * a bare `router.use(requireAdmin)` here would bind the admin guard to every
 * route registered after this file in `adminRoutes` — including public ones.
 * `router.use(BASE, requireAdmin)` binds it to this prefix only. The access
 * test proves the guard fires on these paths and on nothing outside them.
 *
 * ─── FLAG-GATED ON THE MASTER, AND 404 WHEN OFF ─────────────────────────────
 *
 * The plan's rollback paragraph calls this "the new route (flag-gated)", and
 * the first version read no flag at all — an inconsistency the T209 verifier
 * found. Now: `GROWTH_JOURNEY_ENABLED` off means these paths do not exist.
 *
 * 404, not 503 or 403, for the same anti-enumeration reason the brand guard
 * uses: a distinct "feature disabled" status would tell a caller the route is
 * there. The gate reads the MASTER only — the dark-launch guard in
 * `growthJourneyFlags.test.ts` forbids a direct sub-flag read anywhere outside
 * the flags module, and the master is the one property it exempts. It runs
 * AFTER `requireAdmin`, so an unauthenticated caller still sees 401 and learns
 * nothing about the flag either way.
 *
 * ─── READS ONLY ─────────────────────────────────────────────────────────────
 *
 * Two GETs. No POST, PUT, PATCH or DELETE, and the controller performs no write.
 * The scope those reads enforce comes from the caller's memberships, never from
 * a header the client controls — see the controller header for the full status
 * matrix and the refuse-never-widen rule.
 */

const router = Router();
const BASE = '/api/admin/growth-journey';

router.use(BASE, requireAdmin);

/** Master off => the routes do not exist. Resolved per request so a test can flip it. */
function requireGrowthJourneyEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!env.growthJourney.growthJourneyEnabled) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}
router.use(BASE, requireGrowthJourneyEnabled);

router.get(`${BASE}/participations`, listParticipationsHandler);
router.get(`${BASE}/participations/:id`, getParticipationHandler);

// Phase 2 (T229): the classification queue, its Why, and the one write — a
// human override, audited, append-only, policy-checked. Same guards, same
// master-flag 404, same status matrix as the participation routes above.
router.get(`${BASE}/classifications`, listClassificationsHandler);
router.get(`${BASE}/classifications/:id/why`, getClassificationWhyHandler);
router.post(`${BASE}/classifications/:id/override`, overrideClassificationHandler);

export default router;
