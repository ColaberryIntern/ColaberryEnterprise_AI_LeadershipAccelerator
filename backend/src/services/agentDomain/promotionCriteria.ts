/**
 * Evidence-based promotion: what a capability must show before it moves up the autonomy ladder.
 *
 * Run `20261007-school-agent-factory` (T07), session CC-20261006-a4k7.
 *
 * ## The four things that promote NOTHING
 *
 * The owner's instruction is explicit, and this module's main job is to make it structural:
 *
 *   > "Story completion, elapsed time, a successful conversation or passing mocked tests must not
 *   > automatically promote autonomy or authorize production actions."
 *
 * Each of those four is refused by name, and each has its own test. This is not theoretical. This
 * repository holds **106 `approval_requests` rows whose `decided_by` has exactly one distinct
 * value: `system:auto_approve_timeout`** — a 4.25-hour clock recorded as a human decision. Elapsed
 * time is the single most load-bearing refusal here because it is the one that already happened.
 *
 * ## Proposed is not accepted
 *
 * A threshold starts `proposed` and stays there until a named human accepts it. `renderThreshold`
 * cannot emit an accepted-looking value for a proposed threshold, and there is no code path that
 * promotes one without an `accepted_by` and an `accepted_at`.
 *
 * ## No fabricated evaluation results
 *
 * `recordEvidence` refuses a record with no source. This module **never generates an evaluation
 * result** — it only accepts one that something else produced and attributes it. A module that
 * could score its own promotion would be the whole failure in one function.
 */

import {
  autonomyIndex,
  isAutonomyStage,
  type AutonomyStage,
} from './autonomyLadder';

/** The four inputs that must never, on their own, promote a capability or authorize an action. */
export const NON_PROMOTING_SIGNALS = Object.freeze([
  'story_completed',
  'elapsed_time',
  'successful_conversation',
  'mocked_tests_passed',
] as const);

export type NonPromotingSignal = typeof NON_PROMOTING_SIGNALS[number];

/** Scenario classes every applicable capability/release pair must define. */
export const REQUIRED_SCENARIO_CLASSES = Object.freeze([
  'success',
  'ambiguity',
  'failure',
  'recovery',
  'permission_denial',
] as const);

export type ScenarioClass = typeof REQUIRED_SCENARIO_CLASSES[number];

export type ThresholdState = 'proposed' | 'accepted';

export interface QualityThreshold {
  readonly metric: string;
  /** How it is measured. A threshold with no measurement method is not a threshold. */
  readonly measured_by: string;
  readonly target: string;
  readonly state: ThresholdState;
  readonly accepted_by?: string | null;
  readonly accepted_at?: string | null;
}

export interface EvidenceRecord {
  readonly kind: string;
  /** Where it came from. A record without a source is refused — see `recordEvidence`. */
  readonly source: string;
  readonly observed_at: string;
  /** Who evaluates it. Never the agent, and never the proposer of the capability. */
  readonly evaluated_by: string;
  readonly summary: string;
}

export interface PromotionCriteria {
  readonly capability_id: string;
  readonly from_autonomy: AutonomyStage;
  readonly to_autonomy: AutonomyStage;
  readonly entry_prerequisites: ReadonlyArray<string>;
  readonly permitted_actions: ReadonlyArray<string>;
  /** Prohibited actions are asserted to be REFUSED, not merely absent from the permitted list. */
  readonly prohibited_actions: ReadonlyArray<string>;
  readonly scenarios: Readonly<Record<ScenarioClass, string>>;
  readonly thresholds: ReadonlyArray<QualityThreshold>;
  readonly required_evidence: ReadonlyArray<string>;
  readonly evaluated_by: string;
  readonly human_approval_required: boolean;
  readonly rollback_conditions: ReadonlyArray<string>;
  readonly suspension_conditions: ReadonlyArray<string>;
  readonly downgrade_conditions: ReadonlyArray<string>;
}

export type PromotionRefusal =
  | 'no_criteria_defined'
  | 'not_a_single_step'
  | 'missing_scenario_class'
  | 'threshold_not_accepted'
  | 'threshold_has_no_measurement'
  | 'evidence_missing'
  | 'evidence_without_source'
  | 'non_promoting_signal_only'
  | 'human_approval_missing'
  | 'self_evaluated'
  | 'human_decision_cannot_be_automated';

export interface PromotionDecision {
  readonly capability_id: string;
  readonly promoted: boolean;
  readonly refusals: ReadonlyArray<PromotionRefusal>;
}

export interface PromotionAttempt {
  readonly criteria: PromotionCriteria | null;
  readonly evidence: ReadonlyArray<EvidenceRecord>;
  /** Signals offered in support. Any of the four non-promoting ones are ignored. */
  readonly signals: ReadonlyArray<string>;
  readonly human_approval?: { readonly approver: string; readonly approved_at: string } | null;
  /** The identity that proposed the capability. An approver equal to this is self-approval. */
  readonly proposed_by?: string | null;
  /** True when the underlying decision is human-required at every level. */
  readonly human_decision: boolean;
}

/** A threshold is only usable once a named human has accepted it. */
export function isThresholdAccepted(t: QualityThreshold): boolean {
  return t.state === 'accepted'
    && typeof t.accepted_by === 'string' && t.accepted_by.trim().length > 0
    && typeof t.accepted_at === 'string' && t.accepted_at.trim().length > 0;
}

/**
 * Renders a threshold for display. A `proposed` threshold ALWAYS renders with its label, so it
 * cannot be read as accepted anywhere downstream.
 */
export function renderThreshold(t: QualityThreshold): string {
  const body = `${t.metric} ${t.target} (measured by ${t.measured_by})`;
  return isThresholdAccepted(t) ? `${body} [accepted]` : `${body} [PROPOSED - not accepted]`;
}

/**
 * Accepts an evidence record. Refuses one with no source, and never produces a result itself.
 * Returns null rather than throwing so a caller collects refusals instead of aborting a sweep.
 */
export function recordEvidence(input: Partial<EvidenceRecord>): EvidenceRecord | null {
  if (!input.source || String(input.source).trim().length === 0) return null;
  if (!input.kind || !input.observed_at || !input.evaluated_by) return null;
  return {
    kind: String(input.kind),
    source: String(input.source),
    observed_at: String(input.observed_at),
    evaluated_by: String(input.evaluated_by),
    summary: String(input.summary ?? ''),
  };
}

export function isNonPromotingSignal(signal: string): boolean {
  return (NON_PROMOTING_SIGNALS as ReadonlyArray<string>).includes(signal);
}

/**
 * Decides whether one capability may move one step up the ladder.
 *
 * Refusal is the default. Nothing here is permissive: every branch adds a refusal, and promotion
 * happens only when the refusal list is empty.
 */
export function evaluatePromotion(attempt: PromotionAttempt): PromotionDecision {
  const refusals: PromotionRefusal[] = [];
  const c = attempt.criteria;

  if (!c) {
    return { capability_id: 'unknown', promoted: false, refusals: ['no_criteria_defined'] };
  }

  // Promotion is one step at a time. A jump is not a promotion.
  if (!isAutonomyStage(c.from_autonomy) || !isAutonomyStage(c.to_autonomy)
      || autonomyIndex(c.to_autonomy) !== autonomyIndex(c.from_autonomy) + 1) {
    refusals.push('not_a_single_step');
  }

  for (const cls of REQUIRED_SCENARIO_CLASSES) {
    const s = c.scenarios?.[cls];
    if (!s || String(s).trim().length === 0) {
      refusals.push('missing_scenario_class');
      break;
    }
  }

  for (const t of c.thresholds) {
    if (!t.measured_by || String(t.measured_by).trim().length === 0) {
      refusals.push('threshold_has_no_measurement');
      break;
    }
  }
  if (c.thresholds.some((t) => !isThresholdAccepted(t))) {
    refusals.push('threshold_not_accepted');
  }

  // Evidence must exist, and every record must carry a source.
  if (attempt.evidence.length === 0) {
    refusals.push('evidence_missing');
  } else if (attempt.evidence.some((e) => !e.source || String(e.source).trim().length === 0)) {
    refusals.push('evidence_without_source');
  }

  // The four signals that promote nothing. If the ONLY support offered is non-promoting, say so.
  const promoting = attempt.signals.filter((s) => !isNonPromotingSignal(s));
  if (attempt.signals.length > 0 && promoting.length === 0) {
    refusals.push('non_promoting_signal_only');
  }

  if (c.human_approval_required) {
    const a = attempt.human_approval;
    if (!a || !a.approver || !a.approved_at) {
      refusals.push('human_approval_missing');
    } else if (attempt.proposed_by && a.approver === attempt.proposed_by) {
      // approver != proposer, per the ADR and govQualification's SelfApprovalError pattern.
      refusals.push('self_evaluated');
    }
  }

  // A human-required decision is never automated, so it can never promote INTO an automating level.
  if (attempt.human_decision && isAutonomyStage(c.to_autonomy)
      && autonomyIndex(c.to_autonomy) > autonomyIndex('autonomy:R5')) {
    refusals.push('human_decision_cannot_be_automated');
  }

  return { capability_id: c.capability_id, promoted: refusals.length === 0, refusals };
}

/**
 * The owner's worked example, encoded so it is testable rather than aspirational:
 * an internship agent may eventually send approved routine document reminders, while internship
 * acceptance remains a human decision.
 */
export const INTERNSHIP_REMINDER_EXAMPLE: PromotionCriteria = Object.freeze({
  capability_id: 'internship.routine_document_reminder',
  from_autonomy: 'autonomy:R6',
  to_autonomy: 'autonomy:R7',
  entry_prerequisites: [
    'a supervised production pilot completed at autonomy:R6 with recorded outcomes',
    'the reminder template accepted by the accountable human',
    'an idempotency key on (template, application, day) proven against a replay',
  ],
  permitted_actions: [
    'send an approved reminder template to an applicant with an outstanding document',
  ],
  prohibited_actions: [
    'accept, reject or advance an application',
    'self-approve an applicant',
    'contact an applicant who has opted out or is contact-restricted',
    'send a second reminder for the same document on the same day',
    'compose reminder text outside the approved template',
  ],
  scenarios: {
    success: 'one applicant with one outstanding document receives exactly one reminder',
    ambiguity: 'the document record is present but its state is unreadable; the agent escalates and sends nothing',
    failure: 'the record is missing or malformed; the agent escalates and sends nothing',
    recovery: 'a retry after a transport error sends no duplicate, proven by the idempotency key',
    permission_denial: 'the action class is not granted; the attempt is refused and logged with a reason',
  },
  thresholds: [
    {
      metric: 'duplicate reminders per applicant per document per day',
      measured_by: 'count over the email send ledger keyed on (template, application, day)',
      target: '= 0',
      state: 'proposed',
      accepted_by: null,
      accepted_at: null,
    },
    {
      metric: 'reminders sent to a contact-restricted applicant',
      measured_by: 'join of send ledger against the contact-restriction list',
      target: '= 0',
      state: 'proposed',
      accepted_by: null,
      accepted_at: null,
    },
  ],
  required_evidence: [
    'the pilot send ledger with per-send outcome',
    'a replay test showing no duplicate under retry',
    'a refusal log entry for a contact-restricted applicant',
  ],
  evaluated_by: 'the accountable human for the internship domain',
  human_approval_required: true,
  rollback_conditions: [
    'any duplicate reminder observed',
    'any reminder to a contact-restricted applicant',
  ],
  suspension_conditions: [
    'the send ledger becomes unreadable, so duplicates cannot be ruled out',
    'the approved template changes without re-acceptance',
  ],
  downgrade_conditions: [
    'an escalation path stops being monitored',
    'the idempotency key stops being enforced',
  ],
});

/**
 * The same domain's acceptance decision, which must NEVER reach an automating level however much
 * evidence accumulates. Kept beside the reminder so the split is visible in one place.
 */
export const INTERNSHIP_ACCEPTANCE_IS_HUMAN: Readonly<{
  capability_id: string; human_decision: true; max_permitted_autonomy: AutonomyStage; rationale: string;
}> = Object.freeze({
  capability_id: 'internship.admission_decision',
  human_decision: true,
  max_permitted_autonomy: 'autonomy:R5',
  rationale:
    'Accepting or rejecting an applicant is a human decision at every level. An agent may prepare a '
    + 'decision packet and may evaluate in shadow mode against approved reference outcomes, but it '
    + 'may never make the decision and may never self-approve an applicant.',
});
