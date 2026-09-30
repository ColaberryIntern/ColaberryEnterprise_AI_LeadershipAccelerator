import { Request, Response } from 'express';
import { z } from 'zod';
import { findOpenApplication } from '../services/internship/internshipApplicationService';
import {
  activeInternView, advanceAfterDocumentsVerified, recordAcknowledgement,
} from '../services/internship/internshipActivationService';
import { ACKNOWLEDGEMENT_STATES, REQUIREMENT_KEYS } from '../models/InternshipRequirementAcknowledgement';
import { InvalidInternshipTransitionError } from '../services/internship/internshipStateMachine';
import { isInternshipEnabled } from '../services/portalFlagsService';
import { recordMeetingJoin } from '../services/internship/internshipAttendanceService';
import { internDashboard } from '../services/internship/internshipStudentDashboard';
import { internProjectPortfolio } from '../services/internship/internshipProjectPortfolio';
import { listReleasedFeedback } from '../services/mentorFeedbackService';
import { internCertification } from '../services/internship/internshipCertification';

/**
 * Participant activation endpoints: the onboarding checklist and the tool
 * acknowledgements.
 *
 * NOTE WHAT IS ABSENT: there is no participant route that activates anyone.
 * Activation is reviewer- or system-driven only, so a student cannot put
 * themselves in the cohort by calling an endpoint. The state machine would refuse
 * it anyway; not offering the route means it is never even attempted.
 */

const ackSchema = z.object({
  requirement_key: z.enum(REQUIREMENT_KEYS as [string, ...string[]]),
  state: z.enum(ACKNOWLEDGEMENT_STATES as [string, ...string[]]),
  // How it was checked. NEVER a key value — there is no field for one, and
  // `.strict()` rejects any extra property that tried to be one.
  verification_method: z.string().max(80).nullish(),
}).strict();

function callerEnrollmentId(req: Request): string | null {
  const sub = req.participant?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

async function requireOpenApplication(req: Request, res: Response) {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return null; }
  const application = await findOpenApplication(enrollmentId);
  if (!application) { res.status(404).json({ error: 'No open application' }); return null; }
  return { enrollmentId, application };
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request' }); return; }
  if (err instanceof InvalidInternshipTransitionError) { res.status(409).json({ error: 'Not available yet.' }); return; }
  const e = err as any;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: e?.constructor?.name ?? 'Error', context: { message: e?.message },
  }));
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

/**
 * GET /api/portal/internship/onboarding
 *
 * The checklist, the internship's own terms, and the single next action.
 *
 * Reading it also advances a documents-verified application through the payment
 * gate, because that transition is mechanical and the student opening this page is
 * the natural moment to evaluate it. It never activates anyone.
 */
export async function handleGetInternshipOnboarding(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    if (ctx.application.state === 'documents_verified') {
      await advanceAfterDocumentsVerified({
        application: ctx.application,
        actorId: 'internship_onboarding_read',
      });
    }

    const view = await activeInternView(ctx.application);
    await ctx.application.reload();
    res.json({ state: ctx.application.state, ...view });
  } catch (err) {
    fail(res, err, 'internship_onboarding_failed');
  }
}

/**
 * GET /api/portal/internship/dashboard
 *
 * The student "My Internship" dashboard: the active-intern view plus their own
 * training/project/cert/attendance activity and an attention queue split by whose
 * turn it is. Owner-scoped to the session; a read, never a mutation.
 */
export async function handleGetInternshipDashboard(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;
    const dashboard = await internDashboard(ctx.application);
    res.json({ state: ctx.application.state, ...dashboard });
  } catch (err) {
    fail(res, err, 'internship_dashboard_failed');
  }
}

/**
 * GET /api/portal/internship/projects
 *
 * The intern's own project portfolio: every owned project with the shared admin
 * readiness calculation, the verified-vs-self-reported story split, repo, stage,
 * risk and Command Center link. Scoped to the caller's enrollment server-side; a
 * read, never a mutation.
 */
export async function handleGetInternshipProjects(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;
    const portfolio = await internProjectPortfolio(ctx.enrollmentId);
    res.json({ state: ctx.application.state, ...portfolio });
  } catch (err) {
    fail(res, err, 'internship_projects_failed');
  }
}

/**
 * GET /api/portal/internship/feedback
 *
 * The intern's released mentor feedback on their submissions — auto-approved or
 * mentor-approved only, never unvetted or dismissed. Scoped to the caller's
 * enrollment server-side; a read, never a mutation.
 */
export async function handleGetInternshipFeedback(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;
    const feedback = await listReleasedFeedback(ctx.enrollmentId);
    res.json({ state: ctx.application.state, feedback });
  } catch (err) {
    fail(res, err, 'internship_feedback_failed');
  }
}

/**
 * GET /api/portal/internship/certification
 *
 * The intern's certification headline: practice readiness (a Colaberry estimate)
 * and the official certificate claim, kept separate. Scoped to the caller's
 * enrollment; a read, never a mutation.
 */
export async function handleGetInternshipCertification(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;
    const certification = await internCertification(ctx.enrollmentId);
    res.json({ state: ctx.application.state, ...certification });
  } catch (err) {
    fail(res, err, 'internship_certification_failed');
  }
}

/** POST /api/portal/internship/acknowledgements */
export async function handleRecordAcknowledgement(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const body = ackSchema.parse(req.body ?? {});
    const result = await recordAcknowledgement({
      applicationId: ctx.application.id,
      requirementKey: body.requirement_key,
      state: body.state,
      verificationMethod: body.verification_method ?? null,
    });

    if (!result.ok) { res.status(400).json({ error: result.error }); return; }

    const view = await activeInternView(ctx.application);
    res.json({ state: ctx.application.state, ...view });
  } catch (err) {
    fail(res, err, 'internship_acknowledgement_failed');
  }
}

const meetingJoinSchema = z.object({ meeting_key: z.string().min(1).max(60) }).strict();

/**
 * POST /api/portal/internship/meetings/join
 *
 * Record that this intern joined a required meeting today, idempotent per
 * (enrollment, meeting, occurrence date). Called when they open the meeting's room
 * from their internship view — the join click is the capture point. Keyed on the
 * enrollment, not an open application, so an ACTIVE intern's attendance still
 * records after their application has closed.
 */
export async function handleRecordMeetingJoin(req: Request, res: Response): Promise<void> {
  try {
    const enrollmentId = callerEnrollmentId(req);
    if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return; }
    const { meeting_key } = meetingJoinSchema.parse(req.body ?? {});
    const result = await recordMeetingJoin(enrollmentId, meeting_key);
    res.json({ ok: true, already: result.already });
  } catch (err) {
    fail(res, err, 'internship_meeting_join_failed');
  }
}
