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
// Identity lives in ./promotionIdentity: this file was 515 lines against the 500-line ceiling, so
// the change split before adding. Re-exported because the suite imports these names from here.
import {
  NON_HUMAN_APPROVER, norm, isNonHumanIdentity, isThresholdAccepted, humanityCheck,
} from './promotionIdentity';

export { NON_HUMAN_APPROVER, isNonHumanIdentity, isThresholdAccepted };

export const NON_PROMOTING_SIGNALS = Object.freeze([
  'story_completed',
  'elapsed_time',
  'successful_conversation',
  'mocked_tests_passed',
] as const);

export type NonPromotingSignal = typeof NON_PROMOTING_SIGNALS[number];

// The denylist, the normaliser and the threshold shape-check live in `promotionIdentity.ts`,
// with the full account of which ten identities walked through the threshold acceptor.
/**
 * Signals that CAN support a promotion. An allowlist, deliberately.
 *
 * The previous check was `signals.filter((s) => !isNonPromotingSignal(s))`, which treats anything
 * not on the four-item denylist as promoting. So it failed OPEN on every unrecognised value: a
 * verifier promoted a capability whose only signal was `Elapsed_Time`, `elapsed_time_2` or
 * ` elapsed_time ` -- three near-misses of the one signal the owner named. Fail-open on an
 * unrecognised value is the exact failure `autonomyLadder.ts` documents in the risk sinks.
 */
export const PROMOTING_SIGNALS = Object.freeze([
  'pilot_outcomes_reviewed',
  'manager_review_completed',
  'scenario_suite_passed_against_real_systems',
  'refusal_log_reviewed',
  'rollback_exercised',
]);


/**
 * True when an evidence record is itself one of the non-promoting signals, by ANY of its fields.
 *
 * The signal can arrive as the `kind`, or hidden in the `source` or `evaluated_by` of a record
 * whose kind looks innocent. Checking only `kind` leaves two open doors, which is how
 * `{kind: 'elapsed_time', source: 'system:auto_approve_timeout'}` previously promoted.
 */
export function isNonPromotingEvidence(e: EvidenceRecord): boolean {
  const fields = [e.kind, e.source, e.evaluated_by].map(norm);
  return NON_PROMOTING_SIGNALS.some((sig) => fields.some((f) => f.includes(sig)));
}

/** True when a signal is on the promoting allowlist. Anything else supports nothing. */
export function isPromotingSignal(signal: unknown): boolean {
  return PROMOTING_SIGNALS.includes(norm(signal));
}

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
  | 'human_decision_cannot_be_automated'
  | 'non_promoting_evidence_only'
  | 'approver_is_not_human'
  | 'no_thresholds_defined'
  | 'required_evidence_not_supplied'
  | 'prohibited_action_requested'
  | 'proposer_not_recorded'
  | 'approver_not_a_recorded_human'
  | 'evaluator_is_not_human'
  | 'automating_level_without_human_approval'
  | 'signal_not_recognised'
  // 22nd, AF7.2. The allowlist was applied to the approver and to evidence evaluators, and NEVER
  // to the acceptor of the quality threshold the whole promotion rests on -- so the acceptor was
  // guarded by the denylist alone. `accepted_by: 'auto-approval'`, one letter off the production
  // identity, promoted with zero refusals. So did `Mallory`, whom this module already refuses as
  // an APPROVER on the grounds that a denylist cannot establish humanity.
  | 'threshold_acceptor_not_a_recorded_human';

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
  /**
   * Actions this attempt is asking to be allowed to take. Compared against the criteria's
   * `prohibited_actions` and REFUSED on a match -- the point being that a prohibited action is
   * actively refused, rather than merely left off the permitted list, which is the difference
   * between a rule and a hope.
   */
  readonly requested_actions?: ReadonlyArray<string>;
  /**
   * The human identities on record who may approve. REQUIRED when `human_approval_required`.
   *
   * A denylist cannot establish that an approver is a person: there is no pattern separating a
   * name from a model's name, and a verifier proved it by approving a promotion as `claude`, as
   * `Autonomous Agent` and as `automation`, all of which the denylist read as human. So the
   * approver must be PRESENT in a set the caller supplies from its own records. Absent or empty,
   * the promotion is refused -- absence is not approval, which is the mistake this module has now
   * made three times in three different fields.
   */
  readonly recorded_human_approvers?: ReadonlyArray<string>;
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
  // THE ACCEPTOR MUST BE A RECORDED HUMAN, not merely not-obviously-a-machine.
  // `isThresholdAccepted` can only see one threshold, so it can only ever apply the denylist --
  // and a denylist cannot establish humanity. Ten machine-ish identities walked through here,
  // including `auto-approval` (one letter off the production timer) and `Mallory`, who this module
  // already refuses as an approver for exactly this reason.
  //
  // ABSENCE IS NOT ACCEPTANCE -- the fourth instance of that mistake in this module, after the
  // empty signals array, the empty thresholds list and the omitted proposed_by. A threshold that
  // claims `accepted` with NO roster to check it against is refused rather than waved through.
  const humans = humanityCheck(attempt.recorded_human_approvers);
  const claimsAccepted = c.thresholds.filter((t) => t.state === 'accepted');
  if (claimsAccepted.length > 0
      && (!humans.hasRoster || claimsAccepted.some((t) => humans.isNotHuman(t.accepted_by)))) {
    refusals.push('threshold_acceptor_not_a_recorded_human');
  }
  // ABSENCE IS NOT APPROVAL. `some()` over an empty array is false, so a criteria object with no
  // thresholds at all previously sailed past the acceptance gate -- promotion by having nothing to
  // measure. Refused explicitly.
  if (c.thresholds.length === 0) {
    refusals.push('no_thresholds_defined');
  }

  // Evidence must exist, and every record must carry a source.
  if (attempt.evidence.length === 0) {
    refusals.push('evidence_missing');
  } else if (attempt.evidence.some((e) => !e.source || String(e.source).trim().length === 0)) {
    refusals.push('evidence_without_source');
  }

  // The four signals that promote nothing, refused on EVERY channel they can arrive by.
  //
  // The `signals` array was the only channel checked, and the check was gated on the array being
  // non-empty -- so an attempt offering no signals at all switched the whole defence off, and the
  // same four signals routed through `evidence[].kind` were never examined. Both are closed here.
  const promoting = attempt.signals.filter((s) => isPromotingSignal(s));
  if (promoting.length === 0) {
    refusals.push('non_promoting_signal_only');
  }
  // A signal nobody recognises supports nothing, and is NAMED rather than silently ignored.
  const unrecognised = attempt.signals.filter(
    (s) => !isPromotingSignal(s) && !isNonPromotingSignal(s),
  );
  if (unrecognised.length > 0) refusals.push('signal_not_recognised');
  if (attempt.evidence.length > 0 && attempt.evidence.every(isNonPromotingEvidence)) {
    refusals.push('non_promoting_evidence_only');
  }

  // Required evidence must actually be SUPPLIED, not merely listed. Declaring what is needed and
  // never comparing it against what arrived is a checklist nobody reads.
  if (c.required_evidence.length > 0) {
    const supplied = attempt.evidence.map((e) => `${e.kind} ${e.summary} ${e.source}`.toLowerCase());
    const missing = c.required_evidence.filter(
      (need) => !supplied.some((got) => got.includes(String(need).toLowerCase())),
    );
    if (missing.length > 0) refusals.push('required_evidence_not_supplied');
  }

  // A prohibited action is REFUSED, not merely absent from the permitted list.
  if (attempt.requested_actions && attempt.requested_actions.length > 0) {
    // Normalised, so a trailing space is not a different action. String matching cannot catch a
    // PARAPHRASE of a prohibition, and this does not pretend to: that limit is real and is stated
    // rather than papered over. A prohibition list is a floor, not a semantic guarantee.
    const prohibited = attempt.requested_actions.filter(
      (a) => c.prohibited_actions.some((p) => norm(p) === norm(a)),
    );
    if (prohibited.length > 0) refusals.push('prohibited_action_requested');
  }

  // `human_approval_required: false` cannot buy an automating level. A verifier promoted R6 -> R7
  // with no human approval at all by setting that flag, which turns the entire human gate into an
  // opt-out. Above R5 the flag is a contradiction, and the contradiction is refused.
  if (!c.human_approval_required && isAutonomyStage(c.to_autonomy)
      && autonomyIndex(c.to_autonomy) > autonomyIndex('autonomy:R5')) {
    refusals.push('automating_level_without_human_approval');
  }

  if (c.human_approval_required) {
    const a = attempt.human_approval;
    if (!a || !a.approver || !a.approved_at) {
      refusals.push('human_approval_missing');
    } else {
      // THE PROPOSER MUST BE RECORDED. `proposed_by` was optional, so omitting it switched the
      // self-approval defence off entirely and an agent approved its own promotion with zero
      // refusals. This is the same "absence is not approval" mistake as the empty `signals` array
      // and the empty `thresholds` list -- the third instance of it in this module.
      if (!attempt.proposed_by || String(attempt.proposed_by).trim().length === 0) {
        refusals.push('proposer_not_recorded');
      } else if (norm(a.approver) === norm(attempt.proposed_by)) {
        // approver != proposer, per the ADR and govQualification's SelfApprovalError pattern.
        refusals.push('self_evaluated');
      }
      // A timer, a scheduler or the agent itself is not a human, whatever the field is called.
      if (isNonHumanIdentity(a.approver)) {
        refusals.push('approver_is_not_human');
      }
      // And a denylist cannot establish humanity, so the approver must be ON RECORD.
      const recorded = (attempt.recorded_human_approvers ?? []).map(norm);
      if (recorded.length === 0 || !recorded.includes(norm(a.approver))) {
        refusals.push('approver_not_a_recorded_human');
      }
    }
  }

  // The evaluator is held to the same standard as the approver. `EvidenceRecord.evaluated_by`'s
  // own doc comment promises "Never the agent, and never the proposer" -- an unenforced documented
  // contract until now, and `criteria.evaluated_by` was never checked at all.
  // The evaluator is held to the SAME standard as the approver: a denylist cannot establish that
  // an identity is a person, so where a recorded set is supplied the evaluator must be in it.
  // Applying the denylist here and the allowlist only to the approver was the inconsistency a
  // verifier used to pass 'agent self', 'timeout handler', 'robot' and 'the-agent' as evaluators.
  // Reuses the same roster-aware check as the threshold acceptor above. The previous inline
  // version returned `recordedHumans.length > 0 && ...`, so omitting the roster silently DEGRADED
  // every evaluator check back to the denylist -- which composed with the hole above into a
  // promotion carrying no human identity anywhere. Where evidence exists, the roster is required.
  const notHuman = (identity: unknown): boolean => humans.isNotHuman(identity);
  if (attempt.evidence.length > 0 && !humans.hasRoster) {
    refusals.push('evaluator_is_not_human');
  }
  // `evidence[].evaluated_by` is a PERSON who looked at a specific piece of evidence, so the
  // recorded-human allowlist applies. `criteria.evaluated_by` holds a ROLE in the shipped data
  // ("the accountable human"), so only the machine denylist applies there -- running an identity
  // allowlist over a role description is a category error, and the first version of this did
  // exactly that and refused the legitimate fixture.
  const machineEvaluators = [
    ...attempt.evidence.filter((e) => notHuman(e.evaluated_by)).map((e) => e.kind),
    ...(isNonHumanIdentity(c.evaluated_by) ? ['criteria'] : []),
  ];
  if (machineEvaluators.length > 0) refusals.push('evaluator_is_not_human');

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
// `Object.freeze<PromotionCriteria>` rather than a bare `Object.freeze`: the call breaks the
// contextual type from the annotation, so `state: 'proposed'` inside the thresholds array widens
// to `string` and stops being a `ThresholdState`. The type argument puts the contextual type back.
export const INTERNSHIP_REMINDER_EXAMPLE: PromotionCriteria = Object.freeze<PromotionCriteria>({
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
