import CohortMembership from '../../models/CohortMembership';
import Enrollment from '../../models/Enrollment';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipDocument from '../../models/InternshipDocument';
import InternshipRequirementAcknowledgement, {
  ACKNOWLEDGEMENT_STATES, REQUIREMENT_KEYS,
  type AcknowledgementState, type RequirementKey,
} from '../../models/InternshipRequirementAcknowledgement';
import { activeCompEnrollmentIds, getSubscription } from '../subscriptionService';
import { transition } from './internshipApplicationService';
import { stateAfterDocumentsVerified } from './internshipStateMachine';
import { outstandingRequirements } from './internshipDocumentService';
import { ensureInternshipCohort, internshipSettings } from './internshipCohortService';
import {
  activationBlockers, checklistProgress, nextStudentAction, resolveChecklist,
  type ChecklistEvidence, type ChecklistStepStatus,
} from './internshipOnboarding';
import { emitInternshipEvent } from './internshipAnalytics';

/**
 * Activation: the payment gate, then the secondary cohort membership.
 *
 * ── THE KEYSTONE, RESTATED WHERE IT HAPPENS ────────────────────────────────
 *
 * Activation adds a `cohort_memberships` row. It does NOT touch
 * `Enrollment.cohort_id`, and it does not create a second enrollment. The student
 * keeps their training cohort exactly as it was — which is AI_INTERNSHIP_SPEC.md
 * decision 3's stated outcome ("moving from a class KEEPS the class enrollment and
 * adds the internship on top") without the 12-site breakage
 * INTERNSHIP_ENROLLMENT_AUDIT.md costed for the two-enrollment mechanism.
 *
 * ── THE PAYMENT GATE READS THREE DISTINCT FACTS ────────────────────────────
 *
 * `requiresSubscription` (the cohort setting), `hasActiveSubscription` (they are
 * already paying — the membership-inclusion waiver) and `hasActiveComp` (an admin
 * granted them free access). Kept apart so an audit of "who got in free" is
 * answerable; see stateAfterDocumentsVerified's own header.
 */

export interface MembershipCheck {
  requires_subscription: boolean;
  has_active_subscription: boolean;
  has_active_comp: boolean;
  ok: boolean;
}

/**
 * Is this person's membership in order?
 *
 * A `comp` plan is NOT counted as an active paid subscription — it is counted as a
 * comp. Collapsing them would make the two indistinguishable in the very check
 * that decides whether someone paid.
 */
export async function checkMembership(params: {
  enrollmentId: string;
  requiresSubscription: boolean;
}): Promise<MembershipCheck> {
  const [view, compIds] = await Promise.all([
    getSubscription(params.enrollmentId),
    activeCompEnrollmentIds([params.enrollmentId]),
  ]);

  const sub = view.subscription;
  const hasActiveSubscription = !!sub
    && sub.status === 'active'
    && sub.plan !== 'comp'
    && !sub.canceled;
  const hasActiveComp = compIds.has(params.enrollmentId);

  return {
    requires_subscription: params.requiresSubscription,
    has_active_subscription: hasActiveSubscription,
    has_active_comp: hasActiveComp,
    ok: !params.requiresSubscription || hasActiveSubscription || hasActiveComp,
  };
}

/**
 * Move a documents-verified application to the right next state.
 *
 * Deliberately separate from `activate()`: this decides whether the person owes us
 * money, and activation decides whether they are in. Fusing them would mean the
 * only path to `active` also had to know about billing.
 */
export async function advanceAfterDocumentsVerified(params: {
  application: InternshipApplication;
  actorId: string;
}): Promise<{ state: string; membership: MembershipCheck }> {
  const { application } = params;
  const { cohort } = await ensureInternshipCohort();
  const settings = internshipSettings(cohort);

  const membership = await checkMembership({
    enrollmentId: application.enrollment_id,
    requiresSubscription: settings.requires_subscription,
  });

  const target = stateAfterDocumentsVerified({
    requiresSubscription: membership.requires_subscription,
    hasActiveSubscription: membership.has_active_subscription,
    hasActiveComp: membership.has_active_comp,
  });

  if (application.state === 'documents_verified') {
    await transition(application.id, target, {
      actor: 'system',
      actorId: params.actorId,
      reason: membership.ok ? 'membership in order' : 'membership required',
      evidenceSource: 'internship_activation_service',
    });
  }

  await application.reload();
  return { state: application.state, membership };
}

export type ActivationResult =
  | { ok: true; membership_id: string; created: boolean; state: string; cohort_id: string }
  | { ok: false; reason: 'blocked'; blockers: ChecklistStepStatus[] }
  | { ok: false; reason: 'wrong_state'; state: string };

/**
 * Activate an intern.
 *
 * IDEMPOTENT AT THE DATABASE. The partial unique index
 * `uq_cohort_memberships_active` on
 * `(enrollment_id, cohort_id, membership_type) WHERE status='active'` is what makes
 * "webhook retries do not duplicate cohort memberships" true under concurrency, so
 * this catches the unique violation and returns the winning row rather than
 * pretending to have created a second one.
 */
export async function activate(params: {
  application: InternshipApplication;
  actor: 'system' | 'reviewer';
  actorId: string;
  nowMs?: number;
}): Promise<ActivationResult> {
  const nowMs = params.nowMs ?? Date.now();
  const { application } = params;

  if (!['activation_pending', 'payment_pending', 'documents_verified'].includes(application.state)) {
    return { ok: false, reason: 'wrong_state', state: application.state };
  }

  const steps = await buildChecklist(application);
  const blockers = activationBlockers(steps);
  if (blockers.length) return { ok: false, reason: 'blocked', blockers };

  const { cohort } = await ensureInternshipCohort();

  // Walk the lifecycle properly rather than jumping. Each hop writes its own audit
  // event, so the trail shows the payment gate being satisfied rather than an
  // application teleporting from documents_verified to active.
  if (application.state === 'documents_verified' || application.state === 'payment_pending') {
    await transition(application.id, 'activation_pending', {
      actor: params.actor,
      actorId: params.actorId,
      reason: 'activation checks passed',
      evidenceSource: 'internship_activation_service',
    });
    await application.reload();
  }

  let membershipRow: CohortMembership | null = null;
  let created = false;

  try {
    const [row, wasCreated] = await CohortMembership.findOrCreate({
      where: {
        enrollment_id: application.enrollment_id,
        cohort_id: cohort.id,
        membership_type: 'internship',
        status: 'active',
      },
      defaults: {
        enrollment_id: application.enrollment_id,
        cohort_id: cohort.id,
        membership_type: 'internship',
        status: 'active',
        joined_at: new Date(nowMs),
        approved_by: params.actorId,
        source_application_id: application.id,
      } as any,
    });
    membershipRow = row;
    created = wasCreated;
  } catch {
    // Lost the race against the unique index — the other writer created it.
    membershipRow = await CohortMembership.findOne({
      where: {
        enrollment_id: application.enrollment_id,
        cohort_id: cohort.id,
        membership_type: 'internship',
        status: 'active',
      },
    });
    created = false;
    if (!membershipRow) throw new Error('cohort membership could not be created or found');
  }

  if (application.state === 'activation_pending') {
    await transition(application.id, 'active', {
      actor: params.actor,
      actorId: params.actorId,
      reason: `cohort membership ${membershipRow.id}`,
      evidenceSource: 'internship_activation_service',
    });
    // Only on the first activation — a retried webhook must not re-emit.
    if (created) {
      await emitInternshipEvent({
        enrollmentId: application.enrollment_id,
        event: 'internship_activated',
        meta: { application_id: application.id },
      });
    }
  }

  await application.reload();
  return {
    ok: true,
    membership_id: membershipRow.id,
    created,
    state: application.state,
    cohort_id: cohort.id,
  };
}

/** Gather evidence and resolve the checklist for an application. */
export async function buildChecklist(application: InternshipApplication): Promise<ChecklistStepStatus[]> {
  const { cohort } = await ensureInternshipCohort();
  const settings = internshipSettings(cohort);

  const [docs, requirements, acks, membership, enrollment] = await Promise.all([
    InternshipDocument.findAll({ where: { application_id: application.id } }),
    outstandingRequirements(application.id),
    InternshipRequirementAcknowledgement.findAll({ where: { application_id: application.id } }),
    checkMembership({
      enrollmentId: application.enrollment_id,
      requiresSubscription: settings.requires_subscription,
    }),
    Enrollment.findByPk(application.enrollment_id, { attributes: ['id'] }),
  ]);

  const ackMap = new Map<RequirementKey, AcknowledgementState>(
    acks.map((a) => [a.requirement_key, a.state]),
  );

  const evidence: ChecklistEvidence = {
    offer_letter_generated: docs.some((d) => d.kind === 'generated'),
    signed_documents_uploaded: docs.some((d) => d.kind === 'signed_upload'),
    all_documents_verified: requirements.all_verified,
    membership_ok: membership.ok,
    // Orientation attendance and community membership are read by the tracking
    // phase, which owns the attendance aggregation. Reporting them as FALSE here
    // is honest — neither is a blocking step, so an intern is never held up by a
    // signal this phase cannot yet read.
    orientation_attended: false,
    acknowledgements: ackMap,
    joined_community: false,
    active_project_count: 0,
    first_week_checkin_submitted: false,
  };

  void enrollment;
  return resolveChecklist(evidence);
}

/**
 * Record a tool-readiness acknowledgement.
 *
 * The value of the key is never a parameter. There is nothing to pass and nowhere
 * to store it — see InternshipRequirementAcknowledgement's header.
 */
export async function recordAcknowledgement(params: {
  applicationId: string;
  requirementKey: string;
  state: string;
  verificationMethod?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(REQUIREMENT_KEYS as readonly string[]).includes(params.requirementKey)) {
    return { ok: false, error: 'Unknown requirement.' };
  }
  if (!(ACKNOWLEDGEMENT_STATES as readonly string[]).includes(params.state)) {
    return { ok: false, error: 'Unknown state.' };
  }

  const state = params.state as AcknowledgementState;
  const verified = state === 'setup_verified_without_secret_collection';

  const [row] = await InternshipRequirementAcknowledgement.findOrCreate({
    where: { application_id: params.applicationId, requirement_key: params.requirementKey },
    defaults: {
      application_id: params.applicationId,
      requirement_key: params.requirementKey,
      state,
      acknowledged_at: new Date(),
      verified_at: verified ? new Date() : null,
      verification_method: verified ? (params.verificationMethod ?? 'setup_exercise') : null,
    } as any,
  });

  // Only ever move FORWARD. A later "I just acknowledge it" must not downgrade a
  // verified setup — otherwise a stray click erases evidence.
  const rank: Record<AcknowledgementState, number> = {
    acknowledged_requirement: 1,
    self_attested_ready: 2,
    setup_verified_without_secret_collection: 3,
  };
  if (rank[state] > rank[row.state]) {
    await row.update({
      state,
      acknowledged_at: new Date(),
      ...(verified
        ? { verified_at: new Date(), verification_method: params.verificationMethod ?? 'setup_exercise' }
        : {}),
    });
  }

  return { ok: true };
}

export interface ActiveInternView {
  is_active: boolean;
  cohort_id: string | null;
  joined_at: string | null;
  week: number | null;
  minimum_weekly_hours: number;
  max_active_projects: number;
  required_meetings: readonly { day: string; kind: string }[];
  checklist: ChecklistStepStatus[];
  progress: { done: number; total: number };
  next_action: ChecklistStepStatus | null;
  membership: MembershipCheck;
}

/**
 * Everything the active-intern command card needs.
 *
 * `week` is derived from `joined_at` rather than stored, so it cannot go stale —
 * and it is 1-based, because an intern in their first week is in week 1, not week 0.
 */
export async function activeInternView(application: InternshipApplication): Promise<ActiveInternView> {
  const { cohort } = await ensureInternshipCohort();
  const settings = internshipSettings(cohort);

  const [row, steps, membership] = await Promise.all([
    CohortMembership.findOne({
      where: {
        enrollment_id: application.enrollment_id,
        cohort_id: cohort.id,
        membership_type: 'internship',
        status: 'active',
      },
    }),
    buildChecklist(application),
    checkMembership({
      enrollmentId: application.enrollment_id,
      requiresSubscription: settings.requires_subscription,
    }),
  ]);

  const joinedAt = row?.joined_at ? new Date(row.joined_at) : null;
  const week = joinedAt
    ? Math.floor((Date.now() - joinedAt.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    : null;

  return {
    is_active: !!row,
    cohort_id: row ? cohort.id : null,
    joined_at: joinedAt ? joinedAt.toISOString() : null,
    week,
    minimum_weekly_hours: settings.minimum_weekly_hours,
    max_active_projects: settings.max_active_projects,
    required_meetings: settings.required_meetings,
    checklist: steps,
    progress: checklistProgress(steps),
    next_action: nextStudentAction(steps),
    membership,
  };
}
