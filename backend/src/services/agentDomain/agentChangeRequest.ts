/**
 * agentChangeRequest - AF4.2. A human, named, decides an intern's change request. PURE, no I/O.
 *
 * The ticket's objective: *"An intern can file a change request from the portal, Ali can approve
 * it, and the approval is recorded against the thing that gets built."* This module is the half
 * that decides whether a given decision is allowed to stand. The service persists; this refuses.
 *
 * ## Why this is not stored in `approval_requests`, decided by the schema rather than by taste
 *
 * `approval_requests` is the fleet governance table, and it has exactly ONE identity column:
 * `decided_by`. There is no `proposed_by`, `requested_by`, `created_by` or `submitted_by`
 * (`models/ApprovalRequest.ts`, DDL `db/ensureApprovalRequestsSchema.ts`). The ticket's first
 * acceptance criterion is "a CR records a named proposer", so that criterion is literally
 * **unstorable** there.
 *
 * The measured history makes it worse than merely unsuitable. All 106 rows in that table were
 * written by a four-hour timer: `decided_by` has one distinct value across every row,
 * `system:auto_approve_timeout`, so **no human has ever decided an approval request in this
 * system**. And `docs/architecture/ai-workforce-management/APPROVAL_DROP_QUEUE_2026-10-06.md`
 * records the sharper finding - the table asserted `approved` for work the domain table recorded
 * as `held`: *"The domain table is honest and the governance table is not."* A CR flow stored
 * there would inherit both the gap and the dishonesty.
 *
 * ## The denylist cannot establish humanity, so there are two gates
 *
 * `isNonHumanIdentity` and `humanityCheck` are IMPORTED from `promotionIdentity`, not restated.
 * That is deliberate and it is tested: a copy would drift, and this subsystem has already paid for
 * drift four times over (see that module's "Absence is not acceptance" header).
 *
 * The denylist alone is not enough, and two measured facts say why:
 *
 *   - `isNonHumanIdentity('unknown')` is **false**. `approvalRequestController.ts` writes the
 *     literal string `'unknown'` into `decided_by` when it cannot resolve the actor, and the
 *     denylist reads it as a person.
 *   - `isNonHumanIdentity('auto-approval')` is **false** - one letter off the real production
 *     identity. It is one of ten such identities enumerated in `promotionIdentity.ts`.
 *
 * So the allowlist is the gate that actually does the work: the approver must appear on a roster
 * the CALLER supplies from its own records. An absent roster is a refusal, never a pass.
 *
 * ## What this module deliberately does not contain
 *
 * No elapsed time, no attempt counting, no threshold acceptance, no timer. Door 3 of the three the
 * timer historically got in through is closed by **absence**, which is why its test reads this
 * file's own source: you cannot test a code path that does not exist, and without that assertion a
 * later edit adds a timer while every behavioural test still passes.
 */

import { humanityCheck, isNonHumanIdentity, norm } from './promotionIdentity';

export type AgentChangeRequestStatus = 'submitted' | 'approved' | 'declined' | 'withdrawn';

/**
 * No `draft`. The client-facing CR in `services/delivery/clientChangeRequest.ts` has one because a
 * client composes over time; an intern's CR is submitted by the act of filing, and a `draft` state
 * with no UI to leave it is a place for work to go missing rather than a feature.
 *
 * `approved` and `declined` are terminal. An approved CR that could be re-approved by somebody
 * else would make "which human approved this" ambiguous, which is the one question the ticket
 * exists to answer.
 */
const TRANSITIONS: Record<AgentChangeRequestStatus, readonly AgentChangeRequestStatus[]> = {
  submitted: ['approved', 'declined', 'withdrawn'],
  approved: [],
  declined: [],
  withdrawn: [],
};

export function canTransition(from: AgentChangeRequestStatus, to: AgentChangeRequestStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: AgentChangeRequestStatus): readonly AgentChangeRequestStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** A decision is a transition to one of these. Withdrawal is the intern's own act, not a decision. */
const DECISIONS: readonly AgentChangeRequestStatus[] = ['approved', 'declined'];

export interface AgentChangeRequestGateInput {
  status: AgentChangeRequestStatus;
  targetStatus: AgentChangeRequestStatus;
  /** Who filed it. Required at every transition, not just at filing. */
  proposedBy?: string | null;
  /** Who is deciding. Only consulted for a decision. */
  approver?: string | null;
  /**
   * The identities the CALLER knows to be people, from its own records. Absent or empty is a
   * refusal: this module cannot establish humanity on its own and must not pretend to.
   */
  recordedHumanApprovers?: ReadonlyArray<string> | null;
  /** Required when declining, so a decline is answerable to the person who filed it. */
  declinedReason?: string | null;
}

export interface AgentChangeRequestIssue {
  rule: string;
  detail: string;
}

/**
 * Gate one change-request transition. Returns every issue rather than stopping at the first, so a
 * caller can show an intern everything that is wrong in one pass.
 *
 * Empty array means allowed. The caller still has to persist it.
 */
export function gateAgentChangeRequest(
  input: AgentChangeRequestGateInput,
): AgentChangeRequestIssue[] {
  const issues: AgentChangeRequestIssue[] = [];

  if (!canTransition(input.status, input.targetStatus)) {
    issues.push({
      rule: 'illegal_transition',
      detail:
        `'${input.status}' cannot become '${input.targetStatus}'. Allowed: ` +
        `${allowedTransitions(input.status).join(', ') || '(none)'}.`,
    });
  }

  // Door 1. Checked at EVERY transition, not only at filing. An omitted proposer previously
  // "switched the self-approval defence off entirely" in the promotion path
  // (promotionCriteria.ts), because a missing value compares unequal to everything.
  if (norm(input.proposedBy).length === 0) {
    issues.push({
      rule: 'proposer_not_recorded',
      detail: 'A change request must record who filed it.',
    });
  }

  if (DECISIONS.includes(input.targetStatus)) {
    issues.push(...gateDecision(input));
  }

  return issues;
}

/**
 * The approver half. Split out to keep `gateAgentChangeRequest` readable, not because it is
 * independently useful - it assumes the target status is already known to be a decision.
 */
function gateDecision(input: AgentChangeRequestGateInput): AgentChangeRequestIssue[] {
  const issues: AgentChangeRequestIssue[] = [];
  const humans = humanityCheck(input.recordedHumanApprovers);

  // Door 2, first gate. The denylist gives a precise reason for an obvious machine, and
  // `system:auto_approve_timeout` matches it three separate ways: the `system:` prefix,
  // `auto_approve`, and the `timeout$` anchor. An empty identity counts as non-human here, which
  // is why a blank approver does not need its own rule.
  if (isNonHumanIdentity(input.approver)) {
    issues.push({
      rule: 'approver_is_not_human',
      detail: 'A change request can only be decided by a person.',
    });
  } else if (!humans.hasRoster) {
    // Absence is not approval. With no roster the allowlist cannot answer the question, so this
    // refuses explicitly instead of degrading to the denylist - the mistake this subsystem has
    // now made four times.
    issues.push({
      rule: 'approver_not_a_recorded_human',
      detail: 'No recorded people were supplied to check the decider against.',
    });
  } else if (humans.isNotHuman(input.approver)) {
    issues.push({
      rule: 'approver_not_a_recorded_human',
      detail: 'The decider is not one of the people on record for this domain.',
    });
  }

  // Only on approval. Declining your own request is harmless and withdrawing is the normal path,
  // but approving your own is the governance hole: it would let an intern grant themselves a
  // platform change. Compared after norm(), because a zero-width character has defeated exactly
  // this check before.
  if (
    input.targetStatus === 'approved'
    && norm(input.proposedBy).length > 0
    && norm(input.approver) === norm(input.proposedBy)
  ) {
    issues.push({
      rule: 'self_approved',
      detail: 'The person who filed a change request cannot be the person who approves it.',
    });
  }

  if (input.targetStatus === 'declined' && norm(input.declinedReason).length === 0) {
    issues.push({
      rule: 'declined_without_reason',
      detail: 'Declining a change request requires a reason the person who filed it can read.',
    });
  }

  return issues;
}
