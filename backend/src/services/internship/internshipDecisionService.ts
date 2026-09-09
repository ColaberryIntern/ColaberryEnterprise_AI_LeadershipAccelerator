import Enrollment from '../../models/Enrollment';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipDecision, { type DecisionKind } from '../../models/InternshipDecision';
import InternshipInterviewResponse from '../../models/InternshipInterviewResponse';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import { transition } from './internshipApplicationService';
import { buildRecommendation } from './internshipRecommendation';
import { emitInternshipEvent } from './internshipAnalytics';
import { sendDecisionEmail, type InternshipEmailTemplate } from './internshipEmails';
import {
  isReasonCode, reapplyDate, reasonAppliesTo, requiresCustomMessage,
  type InternshipReasonCode,
} from './internshipReasonCodes';
import { REVIEWER_DECISIONS, type ReviewerDecision } from './internshipStateMachine';

/**
 * Recording a human decision.
 *
 * ── THE ORDER OF OPERATIONS IS THE DESIGN ──────────────────────────────────
 *
 * 1. Validate the reason (a rejection with no student-safe reason is refused).
 * 2. Transition the application — the state machine checks the actor is a reviewer.
 * 3. Write the decision row.
 * 4. THEN send the email.
 *
 * The email is last and its failure does not roll anything back. A decision that
 * happened must stay recorded even if the mail server was down: the alternative is
 * an applicant who was approved, wasn't told, and whose approval then silently
 * disappeared. A failed send is a thing to retry — and `sendOnce`'s ledger makes
 * the retry safe — not a reason to un-admit someone.
 *
 * ── WHY THE AI'S OPINION IS SNAPSHOT HERE ──────────────────────────────────
 *
 * The recommendation is rebuilt at decision time and stored on the decision row.
 * Not to justify the decision, but so the pair can be compared later: what did the
 * model say, and what did the human actually do? Storing it after the fact, or
 * recomputing it on read, would lose that — the answers may have changed since.
 */

export interface DecideParams {
  application: InternshipApplication;
  decision: ReviewerDecision;
  reasonCode: string;
  /** Written TO the applicant. Emailed verbatim. */
  studentMessage?: string | null;
  /** Internal. NEVER emailed — see internshipEmails.ts. */
  reviewerNotes?: string | null;
  /** For approve-with-conditions. Emailed, because they must know the condition. */
  conditions?: string | null;
  /** The authenticated admin. Never an AI actor. */
  decidedBy: string;
  nowMs?: number;
}

export type DecideResult =
  | {
    ok: true;
    decision_id: string;
    state: string;
    email: { attempted: boolean; outcome: string | null };
  }
  | { ok: false; error: string; field?: string };

/** Which email a decision sends, if any. */
const TEMPLATE_FOR: Partial<Record<ReviewerDecision, InternshipEmailTemplate>> = {
  approve: 'decision_approved',
  approve_with_conditions: 'decision_approved',
  reject: 'decision_rejected',
  waitlist: 'decision_waitlisted',
  request_information: 'information_requested',
  // A scheduled human follow-up is arranged by a person, in their own words. An
  // automated email here would either duplicate what they are about to say or
  // contradict it.
  schedule_human_follow_up: undefined,
};

const DECISION_KIND: Record<ReviewerDecision, DecisionKind> = {
  approve: 'approved',
  approve_with_conditions: 'approved_with_conditions',
  reject: 'rejected',
  waitlist: 'waitlisted',
  request_information: 'information_requested',
  schedule_human_follow_up: 'human_follow_up_scheduled',
};

/** Which reason-code family a decision validates against. */
function reasonScopeFor(decision: ReviewerDecision): 'rejected' | 'waitlisted' | 'information_requested' | null {
  if (decision === 'reject') return 'rejected';
  if (decision === 'waitlist') return 'waitlisted';
  if (decision === 'request_information' || decision === 'schedule_human_follow_up') return 'information_requested';
  // Approvals do not need a rejection reason; they carry a code for the record
  // but it is not validated against the reject/waitlist families.
  return null;
}

export async function decide(params: DecideParams): Promise<DecideResult> {
  const nowMs = params.nowMs ?? Date.now();
  const { application } = params;

  if (!isReasonCode(params.reasonCode)) {
    return { ok: false, error: 'Pick a reason.', field: 'reason_code' };
  }
  const code: InternshipReasonCode = params.reasonCode;

  const scope = reasonScopeFor(params.decision);
  if (scope && !reasonAppliesTo(code, scope)) {
    return {
      ok: false,
      error: `That reason cannot be used for this decision.`,
      field: 'reason_code',
    };
  }

  // The rule that stops "Other" becoming the default rejection.
  if (requiresCustomMessage(code) && !(params.studentMessage || '').trim()) {
    return {
      ok: false,
      error: 'This reason needs a message for the applicant — they will receive exactly what you write.',
      field: 'student_message',
    };
  }

  const targetState = REVIEWER_DECISIONS[params.decision];

  // Snapshot what the model thought, at the moment the human decided.
  let aiRecommendation: string | null = null;
  let aiFactors: unknown = null;
  try {
    const rows = await InternshipInterviewResponse.findAll({
      where: { application_id: application.id },
    });
    const rec = buildRecommendation({
      answers: rows.map((r) => ({
        question_key: r.question_key,
        answer_text: r.answer_text,
        answer_value: r.answer_value,
        state: r.state,
      })),
      attests_not_employed_fulltime: application.attests_not_employed_fulltime,
      commitment_acknowledged: !!application.commitment_acknowledged_at,
    });
    aiRecommendation = rec.suggested_action;
    aiFactors = rec.factors;
  } catch {
    // A missing snapshot must not block a human decision. Recorded as absent
    // rather than as an empty recommendation, which would read as "the model had
    // no concerns".
    aiRecommendation = null;
    aiFactors = null;
  }

  // Throws InvalidInternshipTransitionError if this actor cannot make this move,
  // which the route surfaces as 409. `actor: 'reviewer'` is what the state
  // machine requires for every admission outcome.
  await transition(application.id, targetState, {
    actor: 'reviewer',
    actorId: params.decidedBy,
    reason: `${params.decision}:${code}`,
    evidenceSource: 'admin_ui',
  });

  const row = await InternshipDecision.create({
    application_id: application.id,
    decision: DECISION_KIND[params.decision],
    reason_code: code,
    student_message: (params.studentMessage || '').trim() || null,
    reviewer_notes: (params.reviewerNotes || '').trim() || null,
    conditions: (params.conditions || '').trim() || null,
    reapply_after: params.decision === 'reject' ? reapplyDate(code, nowMs) : null,
    decided_by: params.decidedBy,
    decided_at: new Date(nowMs),
    ai_recommendation: aiRecommendation,
    ai_factors: aiFactors,
  } as any);

  await application.update({ decided_at: new Date(nowMs) });

  const eventFor: Partial<Record<ReviewerDecision, 'internship_approved' | 'internship_rejected' | 'internship_information_requested'>> = {
    approve: 'internship_approved',
    approve_with_conditions: 'internship_approved',
    reject: 'internship_rejected',
    request_information: 'internship_information_requested',
  };
  const analyticsEvent = eventFor[params.decision];
  if (analyticsEvent) {
    await emitInternshipEvent({
      enrollmentId: application.enrollment_id,
      event: analyticsEvent,
      meta: { application_id: application.id, state: targetState },
    });
  }

  // ── The email. Last, and non-blocking. ────────────────────────────────────
  const template = TEMPLATE_FOR[params.decision];
  let emailOutcome: string | null = null;

  if (template) {
    try {
      const [enrollment, intake] = await Promise.all([
        Enrollment.findByPk(application.enrollment_id, { attributes: ['email', 'full_name'] }),
        InternshipAdministrativeIntake.findOne({ where: { application_id: application.id } }),
      ]);

      const to = (enrollment as any)?.email as string | undefined;
      if (!to) {
        emailOutcome = 'no_recipient';
      } else {
        const firstName = (intake?.preferred_name
          || intake?.legal_name
          || (enrollment as any)?.full_name
          || '').split(' ')[0] || null;

        const result = await sendDecisionEmail({
          template,
          to,
          firstName,
          applicationId: application.id,
          reasonCode: code,
          studentMessage: params.studentMessage,
          conditions: params.conditions,
          correlationId: application.correlation_id ?? undefined,
          nowMs,
        });
        emailOutcome = result.outcome;
      }
    } catch (err: any) {
      // Recorded, never thrown. The decision stands.
      emailOutcome = 'error';
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'internship_decision_email_failed',
        outcome: 'failure',
        error_class: err?.constructor?.name ?? 'Error',
        context: { application_id: application.id, template },
      }));
    }
  }

  return {
    ok: true,
    decision_id: row.id,
    state: targetState,
    email: { attempted: !!template, outcome: emailOutcome },
  };
}

/** Decision history for an application, oldest first. */
export async function decisionHistory(applicationId: string): Promise<InternshipDecision[]> {
  return InternshipDecision.findAll({
    where: { application_id: applicationId },
    order: [['decided_at', 'ASC']],
  });
}
