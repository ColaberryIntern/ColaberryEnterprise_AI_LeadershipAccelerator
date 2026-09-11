import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import {
  confirmSummarySchema, saveAnswersSchema, scheduleCallSchema,
} from '../schemas/internshipSchema';
import { findOpenApplication, getStatus, transition } from '../services/internship/internshipApplicationService';
import {
  answerMap, buildSummary, completeInterviewIfDone, markInterviewStarted,
  openSession, progress, remainingQuestions, saveAnswers,
} from '../services/internship/internshipInterviewService';
import { callNow, cancelScheduledCall, scheduleCall } from '../services/internship/internshipCallService';
import { reconcileInternshipCall } from '../services/internship/internshipCallReconcile';
import { buildRecommendation } from '../services/internship/internshipRecommendation';
import { InvalidInternshipTransitionError } from '../services/internship/internshipStateMachine';
import { SECTION_TITLES } from '../services/internship/internshipQuestionBank';
import InternshipInterviewResponse from '../models/InternshipInterviewResponse';
import InternshipInterviewSession from '../models/InternshipInterviewSession';
import { emitInternshipEvent } from '../services/internship/internshipAnalytics';
import { isInternshipEnabled } from '../services/portalFlagsService';

/**
 * The interview endpoints, both channels.
 *
 * Same authorization shape as `internshipController`: no handler accepts an
 * application id, session id, or question-set version from the client. Everything
 * is derived from `req.participant.sub`, so an applicant cannot read or write
 * another applicant's interview — there is no identifier to tamper with.
 *
 * The one thing a client DOES send is a `question_key`, and that is validated
 * against the active bank in `saveAnswers`, which rejects anything else. So a
 * client cannot invent a question either.
 */

function callerEnrollmentId(req: Request): string | null {
  const sub = req.participant?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

function zodDetails(err: z.ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

function respondToError(res: Response, err: unknown, event: string): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: zodDetails(err) });
    return;
  }
  if (err instanceof InvalidInternshipTransitionError) {
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

/** Resolve the caller's open application, answering 401/404/503 as appropriate. */
async function requireOpenApplication(req: Request, res: Response) {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return null; }

  const application = await findOpenApplication(enrollmentId);
  if (!application) { res.status(404).json({ error: 'No open application' }); return null; }
  return { enrollmentId, application };
}

/**
 * GET /api/portal/internship/interview
 *
 * The guided form's whole state: what is left, in order, with progress. Channel
 * agnostic — the phone path reads the same list through the same service.
 */
export async function handleGetInterview(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    // Complete a finished phone call from Synthflow's record before reading state,
    // so the applicant's own poll drives their interview forward even when the
    // call-complete webhook never arrives. Best-effort: a reconcile failure must
    // never stop the interview loading. See internshipCallReconcile.
    try {
      await reconcileInternshipCall(ctx.application.id);
      await ctx.application.reload();
    } catch { /* the poll still returns the live view below */ }

    const [remaining, p, scheduled, live] = await Promise.all([
      remainingQuestions(ctx.application.id),
      progress(ctx.application.id),
      InternshipInterviewSession.findOne({
        where: { application_id: ctx.application.id, channel: 'phone', status: 'scheduled' },
        order: [['created_at', 'DESC']],
      }),
      // A call that is placed but not yet reconciled to a terminal state. The client
      // shows the "on the call" overlay while this is present and advances when it
      // clears. Bounded to the last 30 minutes so a call whose completion we never
      // learn of (webhook lost AND the record unreadable) cannot trap the overlay.
      InternshipInterviewSession.findOne({
        where: {
          application_id: ctx.application.id,
          channel: 'phone',
          status: 'in_progress',
          started_at: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) },
        },
        order: [['created_at', 'DESC']],
      }),
    ]);

    res.json({
      state: ctx.application.state,
      channel: ctx.application.interview_channel,
      progress: p,
      scheduled_call: scheduled?.scheduled_for
        ? { session_id: scheduled.id, scheduled_for: new Date(scheduled.scheduled_for).toISOString() }
        : null,
      live_call: live
        ? { session_id: live.id, started_at: new Date(live.started_at ?? live.created_at).toISOString() }
        : null,
      // The client renders one at a time, but gets the list so it can show a
      // section heading and a truthful "3 of 21" without a round trip per answer.
      questions: remaining.map((q) => ({
        question_key: q.question_key,
        section: q.section,
        section_title: SECTION_TITLES[q.section],
        prompt: q.prompt_form,
        answer_type: q.answer_type,
        options: q.options ?? null,
        required: q.required,
        is_confirmation: !!q.is_confirmation,
      })),
    });
  } catch (err) {
    respondToError(res, err, 'internship_get_interview_failed');
  }
}

/**
 * PUT /api/portal/internship/interview/answers
 *
 * Autosave. Advances the lifecycle into `interview_in_progress` on the first
 * answer, and closes the interview when the last question is resolved — but never
 * on a partial set, so a dropped connection cannot complete an interview.
 */
export async function handleSaveAnswers(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const body = saveAnswersSchema.parse(req.body ?? {});
    const session = await openSession({ applicationId: ctx.application.id, channel: 'form' });

    await markInterviewStarted({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
      channel: 'form',
    });

    const { saved, rejected } = await saveAnswers({
      application: ctx.application,
      session,
      answers: body.answers,
      isCorrection: body.is_correction,
    });

    await ctx.application.reload();
    await completeInterviewIfDone({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
      session,
    });

    const p = await progress(ctx.application.id);
    await ctx.application.reload();

    res.json({
      saved,
      // Named rather than silently dropped: a rejected key is a client bug or a
      // stale bank version, and hiding it would make that undiagnosable.
      rejected,
      progress: p,
      state: ctx.application.state,
    });
  } catch (err) {
    respondToError(res, err, 'internship_save_answers_failed');
  }
}

/**
 * GET /api/portal/internship/interview/summary
 *
 * What the applicant reviews before submitting — their own words, per question,
 * with which channel captured each. Anything extracted from a call arrives as
 * `needs_followup` and is flagged for confirmation.
 */
export async function handleGetSummary(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const [summary, p] = await Promise.all([
      buildSummary(ctx.application.id),
      progress(ctx.application.id),
    ]);

    res.json({
      state: ctx.application.state,
      progress: p,
      needs_confirmation: summary.filter((l) => l.state === 'needs_followup').map((l) => l.question_key),
      lines: summary,
    });
  } catch (err) {
    respondToError(res, err, 'internship_get_summary_failed');
  }
}

/**
 * POST /api/portal/internship/interview/summary/confirm
 *
 * Promotes every `needs_followup` answer to `confirmed`.
 *
 * This is the step that makes transcript extraction safe. Extraction never writes
 * a confident answer, so nothing captured from a call counts until the applicant
 * has seen it written down and said it is right. Confirming is therefore an act by
 * the applicant, not a default — hence the `confirmed: true` literal in the schema.
 */
export async function handleConfirmSummary(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    confirmSummarySchema.parse(req.body ?? {});

    const answers = await answerMap(ctx.application.id);
    const toConfirm = [...answers.values()].filter((a) => a.state === 'needs_followup');

    for (const row of toConfirm) {
      await row.update({ state: 'confirmed', corrected_at: row.corrected_at ?? new Date() });
    }

    await ctx.application.reload();
    const completed = await completeInterviewIfDone({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
      session: null,
    });

    await ctx.application.reload();
    res.json({
      confirmed: toConfirm.length,
      interview_complete: completed,
      state: ctx.application.state,
      progress: await progress(ctx.application.id),
    });
  } catch (err) {
    respondToError(res, err, 'internship_confirm_summary_failed');
  }
}

/**
 * POST /api/portal/internship/submit
 *
 * Hands the application to the review queue. Refuses while questions are
 * outstanding — submitting an incomplete interview would put an application in
 * front of a reviewer that nobody can decide on.
 */
export async function handleSubmitApplication(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const p = await progress(ctx.application.id);
    if (!p.complete) {
      res.status(409).json({
        error: 'There are still questions to answer.',
        progress: p,
      });
      return;
    }

    await transition(ctx.application.id, 'under_review', {
      actor: 'applicant',
      actorId: ctx.enrollmentId,
      evidenceSource: 'portal',
    });

    await emitInternshipEvent({
      enrollmentId: ctx.enrollmentId,
      event: 'internship_application_submitted',
      meta: { application_id: ctx.application.id },
    });

    const view = await getStatus({ enrollmentId: ctx.enrollmentId, flagEnabled: true });
    res.json(view);
  } catch (err) {
    respondToError(res, err, 'internship_submit_failed');
  }
}

/** POST /api/portal/internship/interview/call — "Have AI Call Me", now. */
export async function handleCallNow(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const outcome = await callNow({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
    });

    if (!outcome.placed) {
      // 200, not an error: none of these are faults, they are answers. The client
      // shows `message` and offers the online route.
      res.status(200).json({ placed: false, reason: outcome.reason, message: outcome.message });
      return;
    }
    res.status(202).json(outcome);
  } catch (err) {
    respondToError(res, err, 'internship_call_now_failed');
  }
}

/** POST /api/portal/internship/interview/call/schedule */
export async function handleScheduleCall(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const { scheduled_for } = scheduleCallSchema.parse(req.body ?? {});
    const when = new Date(scheduled_for);

    // Lower bound against the real clock rather than in the schema, which cannot
    // know "now". Five minutes of slack absorbs clock skew between client and server.
    if (when.getTime() < Date.now() - 5 * 60 * 1000) {
      res.status(400).json({ error: 'Pick a time in the future.' });
      return;
    }
    const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
    if (when.getTime() > Date.now() + MAX_AHEAD_MS) {
      res.status(400).json({ error: 'Pick a time within the next 90 days.' });
      return;
    }

    const result = await scheduleCall({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
      scheduledFor: when,
    });
    res.json(result);
  } catch (err) {
    respondToError(res, err, 'internship_schedule_call_failed');
  }
}

/** POST /api/portal/internship/interview/call/cancel */
export async function handleCancelCall(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const result = await cancelScheduledCall({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
    });
    res.json(result);
  } catch (err) {
    respondToError(res, err, 'internship_cancel_call_failed');
  }
}

/**
 * GET /api/portal/internship/interview/recommendation
 *
 * Exposed to the APPLICANT deliberately narrowly: they see only their own
 * completeness, never the factors. Factors name contradictions in their answers
 * and are written for a reviewer; showing them to the applicant would turn the
 * review into a coaching exercise on how to answer, which is not what it is for.
 *
 * The reviewer-facing view (with factors) belongs to the admin surface in Phase 4.
 */
export async function handleGetApplicantCompleteness(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const rows = await InternshipInterviewResponse.findAll({
      where: { application_id: ctx.application.id },
    });

    const rec = buildRecommendation({
      answers: rows.map((r) => ({
        question_key: r.question_key,
        answer_text: r.answer_text,
        answer_value: r.answer_value,
        state: r.state,
      })),
      attests_not_employed_fulltime: ctx.application.attests_not_employed_fulltime,
      commitment_acknowledged: !!ctx.application.commitment_acknowledged_at,
    });

    res.json({
      completeness: rec.completeness,
      requires_human_decision: rec.requires_human_decision,
    });
  } catch (err) {
    respondToError(res, err, 'internship_completeness_failed');
  }
}
