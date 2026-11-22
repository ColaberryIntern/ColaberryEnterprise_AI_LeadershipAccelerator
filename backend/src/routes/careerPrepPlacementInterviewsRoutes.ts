import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireCareerPrep } from './careerPrepRoutes';
import { logFailure, sendValidated } from './campusRoutes';
import { INTERVIEW_STATES } from '../services/placement/interviewStates';
import { listPlacementInterviews } from '../services/placement/placementInterviewsView';

/**
 * Career Prep v27, CP8.3 (kit F4): the learner's interviews from the job-search inbox, for the Interviews sheet.
 *
 *   GET /api/portal/career-prep/interviews/placement   every one of the caller's OWN placement interviews, KPIs first
 *
 * Behind the same two gates as every Career Prep route (a participant session, Career Prep on for that enrollment; 404
 * otherwise). The enrollment comes only from the token; the route takes no parameters (anything sent is a 400). The
 * response never carries the meeting provider's link: "Join" is the consent-room page (placementInterviewsView.ts), and
 * the declared shape below is strict, so an extra field fails loud in development. Mounted through boot/placementBoot.ts.
 */
const iso = z.string().datetime();
const View = z.object({
  id: z.string(), company: z.string().nullable(), role: z.string().nullable(), state: z.enum(INTERVIEW_STATES), stateLabel: z.string(),
  startsAt: iso.nullable(), minutes: z.number().int().positive(), readAs: z.string().nullable(), confidence: z.number().min(0).max(1).nullable(),
  roomPage: z.string().regex(/^\/portal\/career\/interview\/[^/?#]+$/).nullable(), joinOpensAt: iso.nullable(), joinClosesAt: iso.nullable(),
  prepId: z.string().nullable(), history: z.array(z.object({ at: iso, label: z.string() }).strict()),
  replay: z.object({ status: z.enum(['not_held', 'not_recorded', 'waiting', 'scored', 'no_score', 'unavailable']), note: z.string(),
    score: z.number().int().min(0).max(100).nullable() }).strict().nullable(),
}).strict();
const count = z.number().int().min(0);
export const PlacementInterviewsResponse = z.object({
  kpis: z.object({ upcoming: count, waiting: count, recruiter: count, held: count, scored: count }).strict(),
  interviews: z.array(View),
}).strict();
const NoQuery = z.object({}).strict();

export async function getPlacementInterviewsRoute(req: Request, res: Response): Promise<void> {
  if (!NoQuery.safeParse(req.query).success) { res.status(400).json({ error: 'This list takes no parameters.' }); return; }
  try {
    sendValidated(res, PlacementInterviewsResponse, await listPlacementInterviews(req.participant!.sub), 'career_prep_placement_interviews');
  } catch (err) {
    logFailure('career_prep_placement_interviews_failed', err);
    res.status(500).json({ error: 'Could not load your interviews. Try again in a moment.' });
  }
}

const router = Router();
router.get('/api/portal/career-prep/interviews/placement', requireParticipant, requireCareerPrep, getPlacementInterviewsRoute);
export default router;
