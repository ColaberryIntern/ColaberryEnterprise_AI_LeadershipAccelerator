import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { getWeekdaySessions } from '../services/campus/campusWeekdaySessions';
import { mayPreviewAudiences } from '../services/campus/campusAudienceSwitch';
import { logFailure, sendValidated } from './campusRoutes';

/**
 * GET /api/portal/campus/weekday-sessions -> { intern, sessions } (Basecamp C63). The weekly sessions the campus shows on the
 * Schedule and alerts about (C64): the public Tue / Wed / Fri sessions for every member, plus the Monday interns-only call for an
 * active intern only (decided server-side, campusWeekdaySessions). Participant-authed, campus pilot only. The learner comes ONLY from
 * the token. ?as=intern is a staff preview of the intern view (the account chip's Intern option): honored only for an account the
 * server lets preview (mayPreviewAudiences), otherwise ignored, so nobody else can ask for the Monday call. FAILURE: a database
 * error answers 500 (classified); the campus shows no weekday sessions and does not retry until the next page load.
 */
const Session = z.object({
  day: z.string(), time: z.string(), title: z.string(), audience: z.enum(['interns_only', 'public']),
  room_id: z.string().nullable(), room_name: z.string().nullable(), join_url: z.string().nullable(), registration_url: z.string().nullable(),
}).strict();
export const WeekdaySessionsQuery = z.object({ as: z.enum(['intern']).optional() }).strict();
export const WeekdaySessionsResponse = z.object({ intern: z.boolean(), sessions: z.array(Session) }).strict();

export async function getWeekdaySessionsRoute(req: Request, res: Response): Promise<void> {
  const q = WeekdaySessionsQuery.safeParse(req.query ?? {});
  if (!q.success) { res.status(400).json({ error: 'Invalid query', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  try {
    const sub = req.participant!.sub;
    const previewIntern = q.data.as === 'intern' && await mayPreviewAudiences(sub);
    sendValidated(res, WeekdaySessionsResponse, await getWeekdaySessions(sub, { previewIntern }), 'campus_weekday_sessions');
  } catch (err) {
    logFailure('campus_weekday_sessions_failed', err);
    res.status(500).json({ error: 'Could not load the weekday sessions', error_class: 'WeekdaySessionsUnavailable' });
  }
}

const router = Router();
router.get('/api/portal/campus/weekday-sessions', requireParticipant, getWeekdaySessionsRoute);
export default router;
