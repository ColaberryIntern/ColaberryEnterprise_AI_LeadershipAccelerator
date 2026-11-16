import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { careerPrepEnabled } from '../services/careerPrep/careerPrepFlag';
import { loadPrepData } from '../services/careerPrep/prepData';
import { addInterview, createPractice, linkHireInterviews } from '../services/careerPrep/interviews';
import { buildDashboard, buildSummary } from '../services/careerPrep/prepViews';
import { askCora } from '../services/careerPrep/coraService';
import { activePlan, createPlan, NotYoursError, PastInterviewError } from '../services/careerPrep/plans';
import { currentSession, NotFoundError, startSession, updateSession } from '../services/careerPrep/sessions';
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

const TYPE = z.enum(['recruiter', 'hiring_manager', 'technical', 'behavioral']);
export const InterviewBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('add'), company: z.string().trim().min(1).max(120), role: z.string().trim().min(1).max(120), type: TYPE,
    startsAt: z.string().datetime().nullable(), jdText: z.string().max(20_000).optional() }).strict(),
  z.object({ mode: z.literal('practice'), role: z.string().trim().min(1).max(120), type: TYPE }).strict(),
]);

/** Real interviews from Hire are linked before every read; idempotent, and a failure never blocks the read. */
async function linkQuietly(enrollmentId: string): Promise<void> {
  try { await linkHireInterviews(enrollmentId); } catch (err) { logFailure('career_prep_link_hire_failed', err); }
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  try {
    await linkQuietly(req.participant!.sub);
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
    await linkQuietly(req.participant!.sub);
    const now = new Date();
    const data = await loadPrepData(req.participant!.sub, now);
    if (q.data.interviewId && !data.interviews.some((i) => i.id === q.data.interviewId)) { res.status(404).json({ error: 'Not found' }); return; }
    sendValidated(res, DashboardResponse, buildDashboard(data, now, q.data.interviewId), 'career_prep_dashboard');
  } catch (err) {
    logFailure('career_prep_dashboard_failed', err);
    res.status(500).json({ error: 'Could not load Career Prep.' });
  }
}

export async function postInterview(req: Request, res: Response): Promise<void> {
  const b = InterviewBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Check the interview details and try again.' }); return; }
  try {
    const me = req.participant!.sub;
    if (b.data.mode === 'practice') {
      const r = await createPractice(me, { role: b.data.role, type: b.data.type });
      res.status(r.duplicate ? 200 : 201).json({ id: r.id, source: 'practice', practiceUntil: r.practiceUntil });
      return;
    }
    const r = await addInterview(me, { company: b.data.company, role: b.data.role, type: b.data.type, startsAt: b.data.startsAt, jdText: b.data.jdText });
    res.status(r.duplicate ? 200 : 201).json({ id: r.id, source: 'added', questions: r.questions ?? null });
  } catch (err) {
    logFailure('career_prep_interview_create_failed', err);
    res.status(500).json({ error: 'Could not save the interview.' });
  }
}

/** When Cora cannot answer, the student still gets something to do (kit P4.8: "answered with cards"). */
export const SUGGESTION_CARDS = [
  { id: 'suggest:plan', icon: 'calendar-check-line', title: 'Suggest a plan', line: 'A short session a day until your interview.' },
  { id: 'suggest:weak', icon: 'focus-2-line', title: 'What should I work on?', line: 'Your lowest skills right now.' },
  { id: 'suggest:quick', icon: 'timer-line', title: 'I have 10 minutes', line: 'One quick session.' },
] as const;

const CoraBody = z.object({ message: z.string().trim().min(1).max(2000), interviewId: z.string().uuid().optional() }).strict();

/** A free question to Cora, answered from the student's own computed metrics only (number guard in coraService). */
export async function postCora(req: Request, res: Response): Promise<void> {
  const b = CoraBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Type a question for Cora.' }); return; }
  try {
    const now = new Date();
    const data = await loadPrepData(req.participant!.sub, now);
    if (b.data.interviewId && !data.interviews.some((i) => i.id === b.data.interviewId)) { res.status(404).json({ error: 'Not found' }); return; }
    const r = await askCora(b.data.message, buildDashboard(data, now, b.data.interviewId));
    res.json({ messages: r.messages, cards: r.unavailable ? SUGGESTION_CARDS : [] });
  } catch (err) {
    logFailure('career_prep_cora_route_failed', err);
    res.status(500).json({ error: 'Cora could not answer just now.' });
  }
}

const PlanBody = z.object({
  interviewId: z.string().uuid(),
  kind: z.enum(['days', 'tonight', 'full', 'custom']),
  minutes: z.union([z.literal(10), z.literal(20), z.literal(45)]).optional(),
  focusSkill: z.string().max(40).optional(),
}).strict();
const PlanQuery = z.object({ interviewId: z.string().uuid() }).strict();

/** Build and store a plan; the server runs planBuilder. */
export async function postPlan(req: Request, res: Response): Promise<void> {
  const b = PlanBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Pick a plan for one of your interviews.' }); return; }
  try {
    res.status(201).json(await createPlan(req.participant!.sub, b.data));
  } catch (err) {
    if (err instanceof NotYoursError) { res.status(404).json({ error: 'Not found' }); return; }
    if (err instanceof PastInterviewError) { res.status(409).json({ error: 'That interview has already started. Add your next one to plan for it.' }); return; }
    logFailure('career_prep_plan_failed', err);
    res.status(500).json({ error: 'Could not build the plan.' });
  }
}

export async function getPlan(req: Request, res: Response): Promise<void> {
  const q = PlanQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
  try {
    res.json({ plan: await activePlan(req.participant!.sub, q.data.interviewId) });
  } catch (err) {
    if (err instanceof NotYoursError) { res.status(404).json({ error: 'Not found' }); return; }
    logFailure('career_prep_plan_read_failed', err);
    res.status(500).json({ error: 'Could not load the plan.' });
  }
}

const SessionStart = z.object({ planId: z.string().uuid() }).strict();
const SessionPatch = z.object({
  action: z.enum(['segment_done', 'pause', 'resume', 'finish', 'end']),
  segmentIndex: z.number().int().min(0).max(20).optional(),
  secondsActive: z.number().int().min(0).max(24 * 3600),
}).strict().refine((b) => b.action !== 'segment_done' || b.segmentIndex !== undefined, { message: 'segmentIndex is required' });
const SessionParams = z.object({ id: z.string().uuid() }).strict();

function sessionError(res: Response, err: unknown, event: string): void {
  if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'Could not save your session. Your practice is not lost; try again.' });
}

/** Start (or resume) today's session of the student's active plan. */
export async function postSession(req: Request, res: Response): Promise<void> {
  const b = SessionStart.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: 'Pick a plan first.' }); return; }
  try {
    const r = await startSession(req.participant!.sub, b.data.planId);
    res.status(r.resumed ? 200 : 201).json(r);
  } catch (err) { sessionError(res, err, 'career_prep_session_start_failed'); }
}

export async function patchSession(req: Request, res: Response): Promise<void> {
  const p = SessionParams.safeParse(req.params);
  const b = SessionPatch.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: 'That session update is not valid.' }); return; }
  try {
    res.json({ session: await updateSession(req.participant!.sub, p.data.id, b.data) });
  } catch (err) { sessionError(res, err, 'career_prep_session_update_failed'); }
}

export async function getCurrentSession(req: Request, res: Response): Promise<void> {
  const q = SessionStart.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'planId must be a plan id.' }); return; }
  try { res.json({ session: await currentSession(req.participant!.sub, q.data.planId) }); } catch (err) { sessionError(res, err, 'career_prep_session_read_failed'); }
}

const router = Router();
router.get('/api/portal/career-prep/flags', requireParticipant, getCareerPrepFlags);
router.get('/api/portal/career-prep/summary', requireParticipant, requireCareerPrep, getSummary);
router.get('/api/portal/career-prep/dashboard', requireParticipant, requireCareerPrep, getDashboard);
router.post('/api/portal/career-prep/interviews', requireParticipant, requireCareerPrep, postInterview);
router.post('/api/portal/career-prep/cora', requireParticipant, requireCareerPrep, postCora);
router.post('/api/portal/career-prep/plans', requireParticipant, requireCareerPrep, postPlan);
router.get('/api/portal/career-prep/plans', requireParticipant, requireCareerPrep, getPlan);
router.post('/api/portal/career-prep/sessions', requireParticipant, requireCareerPrep, postSession);
router.patch('/api/portal/career-prep/sessions/:id', requireParticipant, requireCareerPrep, patchSession);
router.get('/api/portal/career-prep/sessions/current', requireParticipant, requireCareerPrep, getCurrentSession);

export default router;
