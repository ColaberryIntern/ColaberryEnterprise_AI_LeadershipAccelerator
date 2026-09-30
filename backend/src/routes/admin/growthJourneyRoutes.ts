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
import {
  getDecisionWhyHandler,
  listDecisionsHandler,
} from '../../controllers/growthJourneyDecisionController';
import {
  acceptHandoffHandler,
  dispositionHandoffHandler,
  getHandoffHandler,
  listHandoffsHandler,
  releaseHandoffHandler,
} from '../../controllers/growthJourneyHandoffController';
import { getPersonJourneyHandler } from '../../controllers/growthJourneyPersonController';
import {
  clearPauseHandler,
  clearRolloutHandler,
  createPauseHandler,
  createRolloutHandler,
  listControlsHandler,
} from '../../controllers/growthJourneyExecutionController';

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
 * ─── READS, AND THE AUDITED WRITES ──────────────────────────────────────────
 *
 * Ten GETs and eight POSTs. The participation, decision, person and control-list
 * routes perform no write at all; the classification override, the three handoff
 * moves (accept, disposition, release - Phase 4) and the four execution-control
 * writes (a pause, a rollout, their clears - Phase 5) are the writes, each audited
 * through `requireBrandAccessAudited` or, where the scope spans brands or raises
 * a mode, `requirePlatformSuperAdminAudited`, before the row changes. The scope
 * every read enforces comes from the caller's memberships, never from a header
 * the client controls — see each controller's header for the full status matrix
 * and the refuse-never-widen rule.
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

// Phase 3 (T312): the shadow decision queue and its Why, read from the stored
// row only. Two GETs, no write. Same guards, same master-flag 404, same matrix.
router.get(`${BASE}/decisions`, listDecisionsHandler);
router.get(`${BASE}/decisions/:id/why`, getDecisionWhyHandler);

// Phase 4 (T405): the human's handoff queue and their three moves. Two GETs,
// three audited POSTs through the state machine in dispositionService. Same
// guards, same master-flag 404, same matrix; an illegal transition is a 409.
router.get(`${BASE}/handoffs`, listHandoffsHandler);
router.get(`${BASE}/handoffs/:id`, getHandoffHandler);
router.post(`${BASE}/handoffs/:id/accept`, acceptHandoffHandler);
router.post(`${BASE}/handoffs/:id/disposition`, dispositionHandoffHandler);
router.post(`${BASE}/handoffs/:id/release`, releaseHandoffHandler);

// Phase 4 (T410): Person 360 - one lead's journey across the brands the caller
// may see, stored rows only, scoped collection by collection. A lead the caller
// can see nothing of is the byte-identical 404.
router.get(`${BASE}/people/:leadId`, getPersonJourneyHandler);

// Phase 5 (T518): the operator's switchboard. One GET (the controls in the
// caller's scope), four audited POSTs: a pause on a brand is the brand's admins'
// (`requireBrandAccessAudited`); a pause with no brand, and any rollout, is the
// platform's (`requirePlatformSuperAdminAudited`); a clear needs the guard its
// row's scope needed to set it. A second active control for a scope is a 409
// from the database's own index. Nothing here sends: a control is a row the
// executor reads on its next run.
router.get(`${BASE}/execution/controls`, listControlsHandler);
router.post(`${BASE}/execution/pauses`, createPauseHandler);
router.post(`${BASE}/execution/pauses/:id/clear`, clearPauseHandler);
router.post(`${BASE}/execution/rollouts`, createRolloutHandler);
router.post(`${BASE}/execution/rollouts/:id/clear`, clearRolloutHandler);

export default router;
