import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { recordTourStep } from '../services/campus/campusActivityService';
import { logFailure } from './campusRoutes';

/**
 * POST /api/portal/campus/tour/progress { tour, stop, total, finished? } -> 204 (Explorer Growth, Ali 2026-10-26: "how many tours have
 * been taken and how many steps of how many completed"). The campus sends it as a learner reaches each stop and when they finish.
 * Participant-authed and behind the campus pilot like every campus route; the learner comes ONLY from the token, and read-only
 * "view as" tokens are refused for every POST by requireParticipant, so staff previews never count. Idempotent (campusActivityService).
 * A stop past the total is refused (400); the furthest stop never moves back. FAILURE: a database error answers 500; the browser does
 * not retry (the next stop, or the finish, carries the same information).
 */
export const TourProgressBody = z.object({
  tour: z.enum(['member', 'explorer', 'business']),
  stop: z.number().int().min(1).max(30),
  total: z.number().int().min(1).max(30),
  finished: z.boolean().optional(),
}).strict().refine((b) => b.stop <= b.total, { message: 'stop is past the end of the tour' });

export async function postTourProgressRoute(req: Request, res: Response): Promise<void> {
  const parsed = TourProgressBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  try {
    await recordTourStep(req.participant!.sub, { ...parsed.data, finished: parsed.data.finished === true });
    res.status(204).end();
  } catch (err) {
    logFailure('campus_tour_progress_failed', err);
    res.status(500).json({ error: 'Could not record the tour step', error_class: 'TourProgressUnavailable' });
  }
}

const router = Router();
router.post('/api/portal/campus/tour/progress', requireParticipant, postTourProgressRoute);
export default router;
