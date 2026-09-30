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
const NUDGES = '/api/portal/journey-nudges';

// T612. Path-scoped over both routes, with its OWN bucket: this is a learner
// surface on a different prefix, so an admin id means nothing here and sharing the
// admin instance would let one caller exhaust the other's budget.
const nudgeLimiter = makeGrowthJourneyLimiter('journey-nudges');
router.use(NUDGES, nudgeLimiter);

router.get('/api/portal/journey-nudges', requireParticipant, listJourneyNudges);
router.post('/api/portal/journey-nudges/:id/dismiss', requireParticipant, dismissJourneyNudge);

export default router;
