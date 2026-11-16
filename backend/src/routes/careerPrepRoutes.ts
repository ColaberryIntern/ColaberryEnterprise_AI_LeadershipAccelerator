import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { careerPrepEnabled } from '../services/careerPrep/careerPrepFlag';
import { logFailure, sendValidated } from './campusRoutes';

/**
 * Career Prep (v27) learner routes. Participant-authed per route (never an unscoped router.use),
 * mounted with the other learner-portal routers in mountLearnerPortalRoutes, above adminRoutes.
 *
 * CP1.1 ships the flag read. Career Prep lives inside the campus, so it is on only when the campus
 * is on for this participant AND their enrollment is on the career_prep allow-list. Fails closed.
 */
export const CareerPrepFlagsResponse = z.object({ careerPrep: z.boolean() }).strict();

export async function getCareerPrepFlags(req: Request, res: Response): Promise<void> {
  let careerPrep = false;
  try {
    careerPrep = campusOnFor(req) && (await careerPrepEnabled(req.participant?.sub));
  } catch (err) {
    logFailure('career_prep_flags_failed', err);
  }
  sendValidated(res, CareerPrepFlagsResponse, { careerPrep }, 'career_prep_flags');
}

const router = Router();
router.get('/api/portal/career-prep/flags', requireParticipant, getCareerPrepFlags);

export default router;
