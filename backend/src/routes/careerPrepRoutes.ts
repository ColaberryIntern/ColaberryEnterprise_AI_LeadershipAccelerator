import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { careerPrepEnabled } from '../services/careerPrep/careerPrepFlag';
import { loadPrepData } from '../services/careerPrep/prepData';
import { buildDashboard, buildSummary } from '../services/careerPrep/prepViews';
import { DashboardResponse, SummaryResponse } from './careerPrepSchemas';
import { logFailure, sendValidated } from './campusRoutes';

/**
 * Career Prep (v27) learner routes. Participant-authed per route (never an unscoped router.use),
 * mounted with the other learner-portal routers in mountLearnerPortalRoutes, above adminRoutes.
 *
 * Every data route: the signed-in student only (their enrollment comes from the token, never the
 * request); Zod on query and params; 404 when Career Prep is off for them, so the feature does not
 * reveal itself; 404 for an interview that is not theirs, so existence does not leak.
 */
export const CareerPrepFlagsResponse = z.object({ careerPrep: z.boolean() }).strict();

async function isOn(req: Request): Promise<boolean> {
  return campusOnFor(req) && (await careerPrepEnabled(req.participant?.sub));
}

export async function getCareerPrepFlags(req: Request, res: Response): Promise<void> {
  let careerPrep = false;
  try { careerPrep = await isOn(req); } catch (err) { logFailure('career_prep_flags_failed', err); }
  sendValidated(res, CareerPrepFlagsResponse, { careerPrep }, 'career_prep_flags');
}

/** 404 unless Career Prep is on for this student. A failing flag read is also 404 (fail closed). */
export async function requireCareerPrep(req: Request, res: Response, next: NextFunction): Promise<void> {
  let on = false;
  try { on = await isOn(req); } catch (err) { logFailure('career_prep_flags_failed', err); }
  if (!on) { res.status(404).json({ error: 'Not found' }); return; }
  next();
}

const DashboardQuery = z.object({ interviewId: z.string().uuid().optional() }).strict();

export async function getSummary(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    sendValidated(res, SummaryResponse, buildSummary(await loadPrepData(req.participant!.sub, now), now), 'career_prep_summary');
  } catch (err) {
    logFailure('career_prep_summary_failed', err);
    res.status(500).json({ error: 'Could not load Career Prep.' });
  }
}

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const q = DashboardQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
  try {
    const now = new Date();
    const data = await loadPrepData(req.participant!.sub, now);
    if (q.data.interviewId && !data.interviews.some((i) => i.id === q.data.interviewId)) { res.status(404).json({ error: 'Not found' }); return; }
    sendValidated(res, DashboardResponse, buildDashboard(data, now, q.data.interviewId), 'career_prep_dashboard');
  } catch (err) {
    logFailure('career_prep_dashboard_failed', err);
    res.status(500).json({ error: 'Could not load Career Prep.' });
  }
}

const router = Router();
router.get('/api/portal/career-prep/flags', requireParticipant, getCareerPrepFlags);
router.get('/api/portal/career-prep/summary', requireParticipant, requireCareerPrep, getSummary);
router.get('/api/portal/career-prep/dashboard', requireParticipant, requireCareerPrep, getDashboard);

export default router;
