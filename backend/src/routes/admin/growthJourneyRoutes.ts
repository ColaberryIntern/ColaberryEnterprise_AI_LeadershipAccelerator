import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  getParticipationHandler,
  listParticipationsHandler,
} from '../../controllers/growthJourneyController';

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

router.get(`${BASE}/participations`, listParticipationsHandler);
router.get(`${BASE}/participations/:id`, getParticipationHandler);

export default router;
