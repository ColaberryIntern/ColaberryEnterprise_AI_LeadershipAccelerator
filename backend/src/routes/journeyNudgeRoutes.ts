import { Router } from 'express';
import { dismissJourneyNudge, listJourneyNudges } from '../controllers/journeyNudgeController';
import { requireParticipant } from '../middlewares/participantAuth';
import { makeGrowthJourneyLimiter } from './growthJourneyRateLimit';

/**
 * The learner's journey nudges (Phase 5 T514): the portal dashboard's read of
 * the in-app channel, and the one action a learner has on it. Both routes are
 * participant-authed; `requireParticipant` also refuses every non-GET from a
 * read-only "view as member" token, so an admin looking at a learner's
 * dashboard cannot dismiss on their behalf. Mounted with the other
 * learner-portal routers (`mountLearnerPortalRoutes`), above `adminRoutes`.
 */

const router = Router();

// T612. Its OWN bucket: a learner surface on a different prefix, where an admin id
// means nothing and sharing the admin instance would let one caller exhaust the
// other's budget. Placed AFTER `requireParticipant` in each chain rather than as a
// `router.use`, because these guards are per-route: mounted ahead of them the
// limiter would key on `req.ip`, which on this deployment is the Cloudflare edge
// node and not a learner (`growthJourneyRateLimit.ts`). After the guard it keys on
// the participant's own `sub`.
const nudgeLimiter = makeGrowthJourneyLimiter('journey-nudges');

router.get('/api/portal/journey-nudges', requireParticipant, nudgeLimiter, listJourneyNudges);
router.post('/api/portal/journey-nudges/:id/dismiss', requireParticipant, nudgeLimiter, dismissJourneyNudge);

export default router;
