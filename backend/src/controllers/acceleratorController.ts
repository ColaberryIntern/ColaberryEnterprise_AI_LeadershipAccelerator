import { Request, Response, NextFunction } from 'express';
import {
  listSessionsByCohort, getSession, createSession, updateSession, deleteSession,
  getSessionAttendance, markAttendance, bulkMarkAttendance, updateAttendanceRecord,
  listSubmissionsByEnrollment, listSubmissionsBySession, createSubmission, updateSubmission,
  computeReadinessScore, computeAllReadinessScores, getCohortDashboard,
  listCohortEnrollments, setPortalAccess, getPortalLoginUrl, getReadOnlyViewAsUrl,
} from '../services/acceleratorService';
import {
  skipSessionDate, unskipDate, getSessionCurriculum, getCohortSkippedDates,
} from '../services/sessionScheduleService';
import { generateMeetLink, generateCohortMeetLinks } from '../services/meetingService';
import { getEnrollmentHistory } from '../services/personHistoryService';
import { buildSessionKit } from '../services/sessionKitService';
import { renderSessionKitDoc, renderSessionOutline, renderSessionReadinessReport, KitDocMode } from '../services/sessionKitDocService';
import { getKitConfig, saveKitConfig } from '../services/sessionKitConfigService';
import { getKitConfigDefaults } from '../services/classKit/kitConfigDefaults';
import { generateQuestion, rewriteTeach, rewriteStoryBeats, rewritePrompts } from '../services/classKit/kitConfigAi';
import { weekBlueprint } from '../data/weekBlueprints';
import { LiveSession } from '../models';

// -- Sessions --

export async function handleListSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const cohortId = req.params.cohortId as string;
    const sessions = await listSessionsByCohort(cohortId);
    const skipped_dates = await getCohortSkippedDates(cohortId);
    res.json({ sessions, skipped_dates });
  } catch (err) { next(err); }
}

// -- Session schedule management (skip-a-day / un-skip / per-session curriculum) --

// Skip the day this session sits on: adds its date to the cohort's skipped_dates
// and reflows, pushing this + later sessions to the next open slots. 404 if missing.
export async function handleSkipSession(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await skipSessionDate(req.params.id as string);
    if (!result) return res.status(404).json({ error: 'Session not found' });
    res.json(result);
  } catch (err) { next(err); }
}

// Un-skip a previously skipped date for a cohort, then reflow so sessions compact back.
export async function handleUnskipDate(req: Request, res: Response, next: NextFunction) {
  try {
    const { date } = req.body || {};
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    }
    const result = await unskipDate(req.params.cohortId as string, date);
    if (!result) return res.status(404).json({ error: 'Cohort not found' });
    res.json(result);
  } catch (err) { next(err); }
}

// Per-session curriculum: the week blueprint parsed from the session title. Never
// throws on a missing blueprint (returns blueprint: null). 404 only if session missing.
export async function handleGetSessionCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getSessionCurriculum(req.params.id as string);
    if (!result) return res.status(404).json({ error: 'Session not found' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getSession(req.params.id as string);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) { next(err); }
}

export async function handleCreateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await createSession({
      cohort_id: req.params.cohortId as string,
      ...req.body,
    });
    res.status(201).json({ session });
  } catch (err) { next(err); }
}

export async function handleUpdateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await updateSession(req.params.id as string, req.body);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) { next(err); }
}

export async function handleDeleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const deleted = await deleteSession(req.params.id as string);
    if (!deleted) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function handleGenerateMeetLink(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await LiveSession.findByPk(req.params.id as string);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const link = await generateMeetLink(session);
    if (!link) return res.status(500).json({ error: 'Failed to generate Meet link' });
    res.json({ meeting_link: link });
  } catch (err) { next(err); }
}

// Class Kit: instructor-facing bundle for one session — session facts, meeting
// link, cohort name, roster count, and a student check-in QR (SVG) that encodes
// the absolute public check-in URL. 404 if the session does not exist.
export async function handleGetSessionKit(req: Request, res: Response, next: NextFunction) {
  try {
    const kit = await buildSessionKit(req.params.id as string);
    if (!kit) return res.status(404).json({ error: 'Session not found' });
    res.json(kit);
  } catch (err) { next(err); }
}

// Class Kit deck: the full interactive teaching deck (HTML) an instructor opens
// in a new tab and shares on screen to run the class. text/html, not JSON. The
// admin UI fetches this with the admin JWT and opens it in a new tab.
export async function handleGetSessionKitDoc(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query.mode;
    const mode: KitDocMode = q === 'rehearse' || q === 'standalone' ? q : 'live';
    const html = await renderSessionKitDoc(req.params.id as string, mode);
    if (!html) return res.status(404).json({ error: 'Session not found' });
    res.type('html').send(html);
  } catch (err) { next(err); }
}

// Instructor readiness report (teaching-plan counts + source/evidence ledger + prep).
export async function handleGetSessionReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const html = await renderSessionReadinessReport(req.params.id as string);
    if (!html) return res.status(404).json({ error: 'Session not found' });
    res.type('html').send(html);
  } catch (err) { next(err); }
}

// Class Outline: a plain-language, one-page teaching plan (segments + time
// windows + the teaching points) to review/prepare/print. text/html. 404 if missing.
export async function handleGetSessionOutline(req: Request, res: Response, next: NextFunction) {
  try {
    const html = await renderSessionOutline(req.params.id as string);
    if (!html) return res.status(404).json({ error: 'Session not found' });
    res.type('html').send(html);
  } catch (err) { next(err); }
}

// Instructor Class Kit overrides (story-beat count/content, Live Decision
// Theater on/off, Build Bay detail, evidence sources) — see classKit/kitConfig.ts.
// GET always returns a full merged config (defaults filled in); PUT saves a
// full replace, not a patch — the Customize popup always submits the whole form.
export async function handleGetSessionKitConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await LiveSession.findByPk(req.params.id as string);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const config = await getKitConfig(req.params.id as string);
    const defaults = getKitConfigDefaults({
      id: session.id, session_number: session.session_number, title: session.title,
      session_date: session.session_date, start_time: session.start_time,
      end_time: session.end_time, status: session.status,
    });
    res.json({ config, defaults });
  } catch (err) { next(err); }
}

export async function handleSaveSessionKitConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await saveKitConfig(req.params.id as string, req.body?.config);
    if (!config) return res.status(404).json({ error: 'Session not found' });
    res.json({ config });
  } catch (err) { next(err); }
}

// Shared grounding context for every AI-generate/rewrite action: the week's
// blueprint purpose/objectives + the resolved Lessons text, joined into one
// summary string. Used by both handleGenerateInteraction and
// handleRewriteCategory so the two never drift apart on what "grounded in
// the week's real content" means.
async function loadGroundingContext(sessionId: string) {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;
  const defaults = getKitConfigDefaults({
    id: session.id, session_number: session.session_number, title: session.title,
    session_date: session.session_date, start_time: session.start_time,
    end_time: session.end_time, status: session.status,
  });
  const bp = defaults.week != null ? weekBlueprint(defaults.week) : undefined;
  const contentSummary = [
    bp?.purpose,
    (bp?.learning_objectives || []).join('; '),
    ...defaults.teach.map((t) => `${t.title}: ${t.body || ''}`),
  ].filter(Boolean).join('\n');
  return { session, contentSummary };
}

// AI-generate one survey question, grounded in the session's real week
// content — the "+ Add question" flow's default population. Always returns
// a usable question (falls back to a deterministic scaffold with or without
// an OpenAI key, or on any generation failure) so the button never dead-ends.
export async function handleGenerateInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const segment = req.body?.segment;
    if (typeof segment !== 'string' || !segment.trim()) {
      return res.status(400).json({ error: 'segment is required' });
    }
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction : undefined;

    const ctx = await loadGroundingContext(req.params.id as string);
    if (!ctx) return res.status(404).json({ error: 'Session not found' });

    const result = await generateQuestion({ segment, weekTitle: ctx.session.title, contentSummary: ctx.contentSummary, instruction });
    res.json(result);
  } catch (err) { next(err); }
}

const REWRITE_HANDLERS = { teach: rewriteTeach, storyBeats: rewriteStoryBeats, prompts: rewritePrompts } as const;
type RewriteCategory = keyof typeof REWRITE_HANDLERS;

// AI-rewrite an entire Lessons/Story Beats/Claude Code Examples list from a
// one-line instruction, grounded in the session's real week content — "write
// my own" means "type an instruction, get a draft, then edit it normally."
// Always returns a usable list (falls back to the CURRENT list unchanged
// with or without an OpenAI key, or on any generation failure).
export async function handleRewriteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const category = req.body?.category;
    if (typeof category !== 'string' || !(category in REWRITE_HANDLERS)) {
      return res.status(400).json({ error: 'category must be one of: ' + Object.keys(REWRITE_HANDLERS).join(', ') });
    }
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction : '';
    const currentItems = Array.isArray(req.body?.currentItems) ? req.body.currentItems : [];

    const ctx = await loadGroundingContext(req.params.id as string);
    if (!ctx) return res.status(404).json({ error: 'Session not found' });

    const rewrite = REWRITE_HANDLERS[category as RewriteCategory];
    const result = await (rewrite as (input: { weekTitle: string; contentSummary: string; currentItems: unknown[]; instruction: string }) => Promise<unknown>)({
      weekTitle: ctx.session.title, contentSummary: ctx.contentSummary, currentItems, instruction,
    });
    res.json(result);
  } catch (err) { next(err); }
}

// Batch: generate teaching Meet links for every upcoming session in a cohort
// that lacks one (backfill + on-demand). Idempotent; best-effort per session.
export async function handleGenerateCohortMeetLinks(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await generateCohortMeetLinks(req.params.cohortId as string);
    res.json(result);
  } catch (err) { next(err); }
}

// -- Attendance --

export async function handleGetAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const records = await getSessionAttendance(req.params.id as string);
    res.json({ records });
  } catch (err) { next(err); }
}

export async function handleMarkAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.records && Array.isArray(req.body.records)) {
      const results = await bulkMarkAttendance(req.params.id as string, req.body.records);
      return res.json({ records: results });
    }
    const record = await markAttendance({
      session_id: req.params.id as string,
      ...req.body,
    });
    res.json({ record });
  } catch (err) { next(err); }
}

export async function handleUpdateAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await updateAttendanceRecord(req.params.id as string, req.body);
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ record });
  } catch (err) { next(err); }
}

// -- Submissions --

export async function handleListEnrollmentSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const submissions = await listSubmissionsByEnrollment(req.params.enrollmentId as string);
    res.json({ submissions });
  } catch (err) { next(err); }
}

export async function handleListSessionSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const submissions = await listSubmissionsBySession(req.params.id as string);
    res.json({ submissions });
  } catch (err) { next(err); }
}

export async function handleCreateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const submission = await createSubmission(req.body);
    res.status(201).json({ submission });
  } catch (err) { next(err); }
}

export async function handleUpdateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const submission = await updateSubmission(req.params.id as string, req.body);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (err) { next(err); }
}

export async function handleUploadSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const submission = await updateSubmission(req.params.id as string, {
      file_path: file.path,
      file_name: file.originalname,
      status: 'submitted',
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (err) { next(err); }
}

// -- Readiness --

export async function handleGetReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const scores = await computeReadinessScore(req.params.enrollmentId as string);
    if (!scores) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(scores);
  } catch (err) { next(err); }
}

export async function handleComputeReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const scores = await computeReadinessScore(req.params.enrollmentId as string);
    if (!scores) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(scores);
  } catch (err) { next(err); }
}

export async function handleComputeAllReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const results = await computeAllReadinessScores(req.params.cohortId as string);
    res.json({ results });
  } catch (err) { next(err); }
}

// -- Dashboard --

export async function handleGetDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getCohortDashboard(req.params.cohortId as string);
    if (!dashboard) return res.status(404).json({ error: 'Cohort not found' });
    res.json(dashboard);
  } catch (err) { next(err); }
}

// -- Admin Enrollment --

export async function handleCreateEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const { full_name, email, company, title, phone, company_size, notes } = req.body;
    if (!full_name || !email || !company) {
      return res.status(400).json({ error: 'full_name, email, and company are required' });
    }
    const { createAdminEnrollment } = await import('../services/enrollmentService');
    const enrollment = await createAdminEnrollment({
      full_name, email, company, title, phone, company_size,
      cohort_id: req.params.cohortId as string,
      notes,
    });
    res.status(201).json({ enrollment });
  } catch (err) { next(err); }
}

// -- Enrollment Management --

export async function handleListCohortEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollments = await listCohortEnrollments(req.params.cohortId as string);
    res.json({ enrollments });
  } catch (err) { next(err); }
}

export async function handleSetPortalAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const { portal_enabled } = req.body;
    if (typeof portal_enabled !== 'boolean') {
      return res.status(400).json({ error: 'portal_enabled (boolean) is required' });
    }
    const enrollment = await setPortalAccess(req.params.id as string, portal_enabled);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ enrollment });
  } catch (err) { next(err); }
}

// Returns a one-click login URL to view the portal as this participant.
export async function handleGetPortalLink(req: Request, res: Response, next: NextFunction) {
  try {
    const url = await getPortalLoginUrl(req.params.id as string);
    if (!url) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ url });
  } catch (err) { next(err); }
}

// Returns a READ-ONLY "View as member" URL — mints a read_only participant token
// (server blocks every write) so an admin can see exactly the member's portal
// without being able to change anything about their data/progress/recordings.
export async function handleGetViewAsToken(req: Request, res: Response, next: NextFunction) {
  try {
    const admin: any = req.admin;
    const impersonatedBy = admin?.email || admin?.sub || 'admin';
    const url = await getReadOnlyViewAsUrl(req.params.id as string, String(impersonatedBy));
    if (!url) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ url });
  } catch (err) { next(err); }
}

// Person 360: full drill-down history for one participant (profile, acquisition,
// communications, campaigns, portal activity, learning, timeline).
export async function handleGetPersonHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await getEnrollmentHistory(req.params.id as string);
    if (!history) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(history);
  } catch (err) { next(err); }
}
