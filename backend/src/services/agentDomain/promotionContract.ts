/**
 * The promotion contract: the shapes a promotion attempt is made of, and every way it can be
 * refused.
 *
 * ## Why this is its own module
 *
 * `promotionCriteria.ts` reached exactly 500 lines, CLAUDE.md's hard ceiling, so AF6.3's
 * second-signature gate had to split the file before adding to it. This is the second such split;
 * `promotionIdentity.ts` records the first, at 515 lines.
 *
 * The seam was forced by a dependency, not chosen for tidiness. The examples looked like the
 * obvious thing to move, but they ARE `PromotionCriteria` values, so an examples module would have
 * to import the type back from `promotionCriteria.ts` while that file re-exported the examples --
 * the A-imports-B-imports-A shape CLAUDE.md names as "a code smell that signals a missing third
 * module C that both depend on". This is module C. The types move; the engine and its worked data
 * stay together, and the new `promotionSecondSignature.ts` depends on this file alone.
 *
 * Everything here is re-exported from `promotionCriteria.ts`, because two test suites and the
 * rest of the subtree import these names from there and a split should not be a rename.
 */

import type { AutonomyStage } from './autonomyLadder';

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

/** One human putting their name to a promotion at a point in time. */
export interface Signature {
  readonly approver: string;
  readonly approved_at: string;
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
  | 'threshold_acceptor_not_a_recorded_human'
  // 23rd-27th, AF6.3. The owner ruled that an agent-model level of `act_audited` or `communicate`
  // needs a SECOND human signature, while `suggest` needs one. `human_approval` held exactly one
  // approver, so a second signature was not representable and the ruling could not be enforced
  // whatever anyone recorded. See `promotionSecondSignature.ts` for the mapping onto R0-R9 and
  // for why these five and not one.
  | SecondSignatureRefusal;

/**
 * The five ways a second signature fails.
 *
 * One code would have been cheaper and useless. A two-signature rule has exactly one interesting
 * failure -- the SAME person signing twice -- and collapsing that into "missing" would report the
 * defect this gate exists to catch as an absence. Each is named so a refusal says which.
 */
export type SecondSignatureRefusal =
  | 'second_signature_missing'
  | 'second_signature_repeats_the_first_approver'
  | 'second_approver_is_not_human'
  | 'second_approver_not_a_recorded_human'
  | 'second_approver_is_the_proposer';

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
  readonly human_approval?: Signature | null;
  /**
   * The SECOND signature, required from `autonomy:R6` up — see `promotionSecondSignature.ts`.
   *
   * A separate field rather than a second entry in `human_approval`, because the first signature
   * is load-bearing for `self_evaluated` and for `approver_not_a_recorded_human` and those checks
   * read one approver. Widening the existing field to an array would have changed the meaning of
   * every one of them in a commit about something else.
   */
  readonly second_approval?: Signature | null;
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
