import { Request, Response } from 'express';
import { z } from 'zod';
import {
  administrativeIntakeSchema, cardImpressionSchema, dismissCardSchema,
  selectChannelSchema, startApplicationSchema,
} from '../schemas/internshipSchema';
import {
  dismissCard, findOpenApplication, getStatus, saveAdministrativeIntake,
  selectInterviewChannel, startApplication,
} from '../services/internship/internshipApplicationService';
import { emitInternshipEvent } from '../services/internship/internshipAnalytics';
import { InvalidInternshipTransitionError } from '../services/internship/internshipStateMachine';
import { isInternshipEnabled } from '../services/portalFlagsService';

/**
 * Participant-facing internship endpoints.
 *
 * ── AUTHORIZATION IS STRUCTURAL, NOT CHECKED ───────────────────────────────
 *
 * "Participant endpoints may access only their own application/documents."
 *
 * No handler here accepts an application id from the client. Every one derives
 * the enrollment from `req.participant.sub` — the JWT subject — and looks the
 * application up BY that enrollment. There is therefore no id to tamper with:
 * reading someone else's application is not forbidden, it is unrepresentable.
 * A check ("does this application belong to you?") would be one forgotten call
 * away from an IDOR; this shape has nowhere to forget it.
 */

/** The caller's own enrollment id, or null when the token is unusable. */
function callerEnrollmentId(req: Request): string | null {
  const sub = req.participant?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

function zodDetails(err: z.ZodError): Array<{ path: string; message: string }> {
  // Zod v4: `.issues` (not `.errors`).
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Shared failure handling so every route answers the same way. */
function respondToError(res: Response, err: unknown, event: string): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: zodDetails(err) });
    return;
  }
  if (err instanceof InvalidInternshipTransitionError) {
    // A blocked transition is a client error, not a server fault: the caller
    // asked for something the lifecycle does not allow from where they are.
    res.status(409).json({
      error: 'That step is not available from your current status.',
      error_class: err.error_class,
    });
    return;
  }
  const e = err as any;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event,
    outcome: 'failure',
    error_class: e?.constructor?.name ?? 'Error',
    context: { message: e?.message },
  }));
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

/** GET /api/portal/internship/status */
export async function handleGetInternshipStatus(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const view = await getStatus({ enrollmentId, flagEnabled: isInternshipEnabled() });
    res.json(view);
  } catch (err) {
    respondToError(res, err, 'internship_status_failed');
  }
}

/** POST /api/portal/internship/application — start or resume. Idempotent. */
export async function handleStartInternshipApplication(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return; }

  try {
    const body = startApplicationSchema.parse(req.body ?? {});
    const { application, created } = await startApplication({
      enrollmentId,
      cohortId: body.cohort_id ?? req.participant?.cohort_id ?? null,
    });
    res.status(created ? 201 : 200).json({
      application_id: application.id,
      state: application.state,
      created,
    });
  } catch (err) {
    respondToError(res, err, 'internship_start_failed');
  }
}

/** PUT /api/portal/internship/intake — Group A only. */
export async function handleSaveInternshipIntake(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return; }

  try {
    const body = administrativeIntakeSchema.parse(req.body ?? {});
    const application = await findOpenApplication(enrollmentId);
    if (!application) { res.status(404).json({ error: 'No open application' }); return; }

    const {
      completes, attests_not_employed_fulltime, commitment_acknowledged, ...values
    } = body;

    await saveAdministrativeIntake({
      application,
      enrollmentId,
      values,
      attestsNotEmployedFulltime: attests_not_employed_fulltime,
      commitmentAcknowledged: commitment_acknowledged,
      completes,
    });

    const view = await getStatus({ enrollmentId, flagEnabled: true });
    res.json(view);
  } catch (err) {
    respondToError(res, err, 'internship_intake_failed');
  }
}

/** POST /api/portal/internship/interview/channel */
export async function handleSelectInternshipChannel(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return; }

  try {
    const { channel } = selectChannelSchema.parse(req.body ?? {});
    const application = await findOpenApplication(enrollmentId);
    if (!application) { res.status(404).json({ error: 'No open application' }); return; }

    await selectInterviewChannel({ application, enrollmentId, channel });
    const view = await getStatus({ enrollmentId, flagEnabled: true });
    res.json(view);
  } catch (err) {
    respondToError(res, err, 'internship_channel_failed');
  }
}

/** POST /api/portal/internship/card/dismiss */
export async function handleDismissInternshipCard(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const { days } = dismissCardSchema.parse(req.body ?? {});
    const reappearAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await dismissCard({ enrollmentId, reappearAt });
    res.json({ dismissed: true, reappear_at: reappearAt.toISOString() });
  } catch (err) {
    respondToError(res, err, 'internship_dismiss_failed');
  }
}

/**
 * POST /api/portal/internship/card/impression
 *
 * The one endpoint that records a view rather than an action, which is why it is
 * separate: everywhere else, "emit only after the authoritative action
 * succeeds." Best-effort — a failure here never surfaces to the student.
 */
export async function handleInternshipCardImpression(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const body = cardImpressionSchema.parse(req.body ?? {});
    await emitInternshipEvent({
      enrollmentId,
      event: 'internship_card_impression',
      meta: { card_state: body.card_state },
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: zodDetails(err) });
      return;
    }
    // Analytics must never break the page.
    res.status(204).end();
  }
}

/** POST /api/portal/internship/card/opened */
export async function handleInternshipCardOpened(req: Request, res: Response): Promise<void> {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const body = cardImpressionSchema.parse(req.body ?? {});
    await emitInternshipEvent({
      enrollmentId,
      event: 'internship_card_opened',
      meta: { card_state: body.card_state },
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: zodDetails(err) });
      return;
    }
    res.status(204).end();
  }
}
