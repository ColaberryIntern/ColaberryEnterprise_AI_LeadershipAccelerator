import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getStatusRegistryHandler } from '../../controllers/growthJourneyStatusController';

/**
 * The Growth Journey's always-readable status surface (Phase 6, T604).
 *
 * ─── THE MOUNT ORDER IS THE MECHANISM, NOT A DETAIL ─────────────────────────
 *
 * `growthJourneyRoutes.ts` applies `requireGrowthJourneyEnabled` with
 * `router.use(BASE, ...)` over the WHOLE `/api/admin/growth-journey` prefix, so
 * with the master flag off every path under it - including anything this file
 * declares - answers 404. Express matches middleware in mount order, so this
 * router escapes that 404 only while `adminRoutes.ts` mounts it BEFORE
 * `router.use(growthJourneyRoutes)`. That is a property of a line's position in
 * another file, which is exactly the kind of thing that gets reordered by
 * accident, so two tests hold it: the access suite mounts both routers in
 * `adminRoutes` order and asserts 200 here while `/participations` is 404 with
 * the same token, and `adminRoutes.order.test.ts` asserts the source index of
 * the status mount is above the journey mount.
 *
 * ─── SAME GUARD SHAPE AS ITS SIBLINGS ───────────────────────────────────────
 *
 * `router.use(BASE, requireAdmin)`, never a bare `router.use(requireAdmin)`:
 * `adminRoutes` mounts children with no prefix, so a bare guard would bind to
 * every route registered after this file - including public ones. Path-scoped,
 * it binds here only. There is no brand scoping and no `requireBrandAccess`,
 * because nothing this router returns belongs to a brand's subjects: it is the
 * platform's own configuration (see the controller's header for the rule about
 * what may and may not appear in the response).
 *
 * ─── WHAT WILL JOIN IT ──────────────────────────────────────────────────────
 *
 * `GET /readiness` (T610) and `GET /health` (T609) mount here, for the same
 * reason and behind the same guard: a readiness score and a health verdict that
 * only appear once the system is live would answer the question too late. They
 * are separate tasks; this file ships with the registry alone rather than with
 * a placeholder that returns nothing.
 */

const router = Router();
const BASE = '/api/admin/growth-journey/status';

router.use(BASE, requireAdmin);

router.get(`${BASE}/registry`, getStatusRegistryHandler);

export default router;
