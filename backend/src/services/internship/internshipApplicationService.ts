import { Op } from 'sequelize';
import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipStatusEvent from '../../models/InternshipStatusEvent';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import InternshipCardDismissal from '../../models/InternshipCardDismissal';
import {
  assertTransition,
  isTerminal,
  type InternshipActor,
  type InternshipState,
} from './internshipStateMachine';
import {
  cardCopy, cardStateFor, isStudentActionable, mayPulse, shouldRenderCard,
  type InternshipCardState,
} from './internshipEligibility';
import { emitInternshipEvent } from './internshipAnalytics';

/**
 * The read/write layer for an internship application.
 *
 * ── THE ONE RULE ───────────────────────────────────────────────────────────
 *
 * `transition()` is the ONLY function in the codebase that writes
 * `internship_applications.state`. Everything else calls it. It asserts the move
 * against the state machine BEFORE writing and records the audit event in the
 * SAME transaction as the state change, so an application's state and its
 * history cannot disagree — a status event written after a separate commit is a
 * history that silently loses rows when the second write fails.
 *
 * That is also what makes "a frontend request must not be able to skip approval
 * or document verification" true: there is no other write path to bypass.
 */

/** States that mean "this person has a live application". */
const OPEN_STATES_EXCLUDED = ['rejected', 'withdrawn', 'removed', 'completed'] as const;

export interface TransitionOptions {
  actor: InternshipActor;
  actorId?: string | null;
  reason?: string | null;
  evidenceSource?: string | null;
  correlationId?: string | null;
}

/**
 * Move an application to `to`, or throw.
 *
 * Throws `InvalidInternshipTransitionError` when the state machine forbids the
 * move for this actor. Callers should let that propagate — a 4xx at the route
 * boundary is the correct answer, and swallowing it would turn a blocked
 * transition into a silent no-op.
 */
export async function transition(
  applicationId: string,
  to: InternshipState,
  opts: TransitionOptions,
): Promise<InternshipApplication> {
  return sequelize.transaction(async (tx) => {
    // Locked read: two concurrent reviewers (or a reviewer and a retried
    // webhook) must not both read `under_review` and both write a decision.
    const app = await InternshipApplication.findByPk(applicationId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!app) throw new Error(`InternshipApplication not found: ${applicationId}`);

    const from = app.state;

    // Idempotent no-op for a genuine repeat of a non-self-edge. A retried
    // webhook that already landed should succeed quietly rather than throw,
    // BUT self-edges (reschedule, resume) are real events and must still write.
    const isSelfEdge = from === to;
    if (isSelfEdge && !SELF_EDGE_STATES.has(to)) {
      return app;
    }

    assertTransition(from, to, opts.actor);

    app.state = to;
    if (to === 'under_review' && !app.submitted_at) app.submitted_at = new Date();
    if (to === 'active' && !app.activated_at) app.activated_at = new Date();
    await app.save({ transaction: tx });

    await InternshipStatusEvent.create({
      application_id: app.id,
      from_state: from,
      to_state: to,
      actor_type: opts.actor,
      actor_id: opts.actorId ?? null,
      reason: opts.reason ?? null,
      evidence_source: opts.evidenceSource ?? null,
      correlation_id: opts.correlationId ?? app.correlation_id ?? null,
    } as any, { transaction: tx });

    return app;
  });
}

/**
 * States where a transition to itself is meaningful rather than a duplicate.
 * Rescheduling a call and resuming an interview are both real events that must
 * appear in the audit trail; everything else self-edging is a retry.
 */
const SELF_EDGE_STATES: ReadonlySet<InternshipState> = new Set<InternshipState>([
  'interview_scheduled',
  'interview_in_progress',
]);

/** The live application for an enrollment, or null. */
export async function findOpenApplication(enrollmentId: string): Promise<InternshipApplication | null> {
  return InternshipApplication.findOne({
    where: {
      enrollment_id: enrollmentId,
      state: { [Op.notIn]: OPEN_STATES_EXCLUDED as unknown as string[] },
    },
    order: [['created_at', 'DESC']],
  });
}

/** The most recent application of any kind, live or terminal. */
export async function findLatestApplication(enrollmentId: string): Promise<InternshipApplication | null> {
  return InternshipApplication.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Start an application, or return the one already open.
 *
 * IDEMPOTENT BY CONSTRUCTION. A double-clicked button, a retried request or two
 * tabs must not open two applications for one person — the reviewer would then
 * see the same applicant twice with divergent answers. The partial unique index
 * `uq_internship_applications_open` is the real guarantee; this catches the
 * resulting unique violation and returns the winner, so the loser's request
 * still succeeds rather than showing an error for a thing that did happen.
 */
export async function startApplication(params: {
  enrollmentId: string;
  cohortId?: string | null;
  correlationId?: string;
}): Promise<{ application: InternshipApplication; created: boolean }> {
  const existing = await findOpenApplication(params.enrollmentId);
  if (existing) return { application: existing, created: false };

  const correlationId = params.correlationId ?? randomUUID();

  try {
    const app = await sequelize.transaction(async (tx) => {
      const created = await InternshipApplication.create({
        enrollment_id: params.enrollmentId,
        cohort_id: params.cohortId ?? null,
        state: 'started',
        correlation_id: correlationId,
      } as any, { transaction: tx });

      await InternshipStatusEvent.create({
        application_id: created.id,
        from_state: 'not_started',
        to_state: 'started',
        actor_type: 'applicant',
        actor_id: params.enrollmentId,
        evidence_source: 'portal',
        correlation_id: correlationId,
      } as any, { transaction: tx });

      return created;
    });

    await emitInternshipEvent({
      enrollmentId: params.enrollmentId,
      event: 'internship_application_started',
      meta: { application_id: app.id, correlation_id: correlationId },
    });

    return { application: app, created: true };
  } catch (err: any) {
    // Lost the race against the unique index — the other request created it.
    const again = await findOpenApplication(params.enrollmentId);
    if (again) return { application: again, created: false };
    throw err;
  }
}

/**
 * Save Group A. Upsert, so a student can come back and correct it.
 *
 * `completes` distinguishes "saving as I go" from "I am done with this step".
 * Only the latter advances the lifecycle, so an autosave cannot push someone
 * into the interview before they meant to go.
 */
export async function saveAdministrativeIntake(params: {
  application: InternshipApplication;
  enrollmentId: string;
  values: Record<string, unknown>;
  attestsNotEmployedFulltime?: boolean;
  commitmentAcknowledged?: boolean;
  completes: boolean;
}): Promise<InternshipAdministrativeIntake> {
  const { application } = params;

  const [intake] = await InternshipAdministrativeIntake.findOrCreate({
    where: { application_id: application.id },
    defaults: { application_id: application.id } as any,
  });
  await intake.update(params.values as any);

  // The two attestations live on the application, not the intake, because they
  // are decisions about the programme rather than contact details — and the
  // reviewer queue reads them from the application row.
  const patch: Record<string, unknown> = {};
  if (typeof params.attestsNotEmployedFulltime === 'boolean') {
    patch.attests_not_employed_fulltime = params.attestsNotEmployedFulltime;
  }
  if (params.commitmentAcknowledged && !application.commitment_acknowledged_at) {
    patch.commitment_acknowledged_at = new Date();
  }
  if (Object.keys(patch).length) await application.update(patch);

  if (params.completes && application.state === 'started') {
    await transition(application.id, 'administrative_intake_complete', {
      actor: 'applicant',
      actorId: params.enrollmentId,
      evidenceSource: 'portal',
    });
    await emitInternshipEvent({
      enrollmentId: params.enrollmentId,
      event: 'internship_administrative_intake_completed',
      meta: { application_id: application.id },
    });
  }

  return intake;
}

/**
 * Record the interview channel the applicant chose.
 *
 * Choosing is not committing: the state machine deliberately allows moving back
 * to `interview_channel_selected` and between channels, because the contract
 * requires being able to start in one and finish in the other.
 */
export async function selectInterviewChannel(params: {
  application: InternshipApplication;
  enrollmentId: string;
  channel: 'form' | 'phone';
}): Promise<InternshipApplication> {
  const { application } = params;
  await application.update({ interview_channel: params.channel });

  if (application.state === 'administrative_intake_complete') {
    await transition(application.id, 'interview_channel_selected', {
      actor: 'applicant',
      actorId: params.enrollmentId,
      reason: `channel=${params.channel}`,
      evidenceSource: 'portal',
    });
  }

  await emitInternshipEvent({
    enrollmentId: params.enrollmentId,
    event: 'internship_interview_channel_selected',
    meta: { application_id: application.id, channel: params.channel },
  });

  return application;
}

/** Hide the recruiting card until `reappearAt`. Upsert — one row per enrollment. */
export async function dismissCard(params: {
  enrollmentId: string;
  reappearAt: Date;
}): Promise<void> {
  const [row, created] = await InternshipCardDismissal.findOrCreate({
    where: { enrollment_id: params.enrollmentId },
    defaults: {
      enrollment_id: params.enrollmentId,
      dismissed_at: new Date(),
      reappear_at: params.reappearAt,
    } as any,
  });
  if (!created) {
    await row.update({ dismissed_at: new Date(), reappear_at: params.reappearAt });
  }
}

export interface InternshipStatusView {
  card_state: InternshipCardState;
  render: boolean;
  may_pulse: boolean;
  actionable: boolean;
  title: string;
  cta: string | null;
  application: null | {
    id: string;
    state: InternshipState;
    interview_channel: 'form' | 'phone' | null;
    submitted_at: string | null;
    is_terminal: boolean;
  };
}

/**
 * Everything the Today card needs, in one call.
 *
 * Read-only and side-effect free apart from nothing — the impression event is
 * emitted by the route, not here, so that calling this to render an admin
 * preview does not inflate the student's funnel numbers.
 */
export async function getStatus(params: {
  enrollmentId: string;
  flagEnabled: boolean;
  nowMs?: number;
}): Promise<InternshipStatusView> {
  const nowMs = params.nowMs ?? Date.now();

  const [app, dismissal] = await Promise.all([
    findLatestApplication(params.enrollmentId),
    InternshipCardDismissal.findOne({ where: { enrollment_id: params.enrollmentId } }),
  ]);

  const state: InternshipState = app ? app.state : 'not_started';
  const card = cardStateFor(state);
  const copy = cardCopy(card, { state });

  const dismissedUntilMs = dismissal?.reappear_at
    ? new Date(dismissal.reappear_at).getTime()
    : null;

  return {
    card_state: card,
    render: shouldRenderCard({ card, flagEnabled: params.flagEnabled, dismissedUntilMs, nowMs }),
    may_pulse: mayPulse(card),
    actionable: isStudentActionable(card),
    title: copy.title,
    cta: copy.cta,
    application: app
      ? {
        id: app.id,
        state: app.state,
        interview_channel: app.interview_channel,
        submitted_at: app.submitted_at ? new Date(app.submitted_at).toISOString() : null,
        is_terminal: isTerminal(app.state),
      }
      : null,
  };
}
