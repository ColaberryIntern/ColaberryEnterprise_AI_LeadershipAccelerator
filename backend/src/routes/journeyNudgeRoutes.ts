import { Router } from 'express';
import { dismissJourneyNudge, listJourneyNudges } from '../controllers/journeyNudgeController';
import { requireParticipant } from '../middlewares/participantAuth';

/**
 * The learner's journey nudges (Phase 5 T514): the portal dashboard's read of
 * the in-app channel, and the one action a learner has on it. Both routes are
 * participant-authed; `requireParticipant` also refuses every non-GET from a
 * read-only "view as member" token, so an admin looking at a learner's
 * dashboard cannot dismiss on their behalf. Mounted with the other
 * learner-portal routers (`mountLearnerPortalRoutes`), above `adminRoutes`.
 */

const router = Router();

router.get('/api/portal/journey-nudges', requireParticipant, listJourneyNudges);
router.post('/api/portal/journey-nudges/:id/dismiss', requireParticipant, dismissJourneyNudge);

export default router;
