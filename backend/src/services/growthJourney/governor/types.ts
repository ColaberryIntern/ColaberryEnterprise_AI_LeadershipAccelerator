import type { FreshnessInput } from '../../explorerGrowth/governor/freshness';
import type {
  Candidate,
  ContactPolicyInput,
  ContentAssetQuery,
  HardStopFlags,
} from '../../explorerGrowth/governor/types';
import type {
  ExplorerAffinity,
  ExplorerAssetPurpose,
  ExplorerOverlay,
  ExplorerPrimaryState,
  ExplorerSignalReadout,
} from '../../../types/explorerGrowth';
import type { EligibilityDecision } from '../offerEligibility';

/**
 * The shared Governor contract (§15 "shared Governor interface and strategy
 * adapters"; Phase 3 T303). Every type the later tasks compile against lives
 * here, so a change to the contract is one edit in one file.
 *
 * ─── ONE ARBITRATION POINT, NOT A SECOND GOVERNOR ───────────────────────────
 *
 * §7.3 requires one arbitration point across every journey programme. This
 * module does not re-implement one: `decideForSubject` imports and calls the
 * EXISTING `arbitrate` in `explorerGrowth/governor/arbiter`, along with
 * `hardStopReason`, `evaluateContact` and `evaluateFreshness`. The dependency
 * runs this way — growthJourney depends on the Governor's pure primitives, not
 * the reverse — because the Governor's own import whitelist forbids it reaching
 * into growthJourney, and because inverting it would have meant a second
 * arbiter, a second tier order and a second suppression vocabulary.
 *
 * ─── WHY EXPLORER'S `Candidate` IS REUSED VERBATIM ──────────────────────────
 *
 * A journey candidate IS an `explorerGrowth/governor/types.Candidate`. §8 says
 * the programmes "share an action vocabulary where appropriate", and they do:
 * `SEND_EMAIL`, `SHOW_IN_APP_NUDGE`, `RECOMMEND_LESSON`, `CREATE_HUMAN_TASK`,
 * `WAIT` and `SUPPRESS_CONTACT` cover every Layer 0/1 action Phase 3 may
 * produce. Reusing the type means `evaluateContact` — which reads a candidate's
 * `channel` — works unchanged, and it means there is exactly one candidate
 * shape in the system rather than two that must be kept in step.
 *
 * Where a B2B action has no distinct member (capability education, a case-study
 * send), it is a `SEND_EMAIL` whose content purpose is recorded on the decision.
 * Adding members to `ExplorerActionType` would be a second, undeclared edit to
 * the Explorer types, which the hard-stop list forbids — T302's widening was
 * declared and bounded, and this stays inside it.
 *
 * Worth saying plainly: T302 widened both the candidate side and the context
 * side of arbitration. Only the CONTEXT side was strictly required — `arbitrate`
 * demanded a full learner `GovernorContext`, and `hardStopReason` with it. The
 * candidate-side generic is what lets a future programme carry its own fields,
 * and its typecheck guard is what stops that generic decaying to `any`; T303
 * itself does not need it, because it reuses `Candidate`.
 */

/**
 * The §8 Layer-1 content purposes a B2B programme can ask for (T310).
 *
 * NOT members of Explorer's `EXPLORER_ASSET_PURPOSES`: Explorer's own tests pin
 * that list at eight and its `PURPOSE_SPECS` is exhaustive over it, so adding a
 * B2B purpose there would be an edit to Explorer's suite. They live here, and
 * the content gate (`governor/contentGate.ts`) answers them BEFORE a query can
 * reach Explorer's resolver — which would not know what to do with one.
 */
export const JOURNEY_CONTENT_PURPOSES = ['capability_education', 'case_study', 'clarification_question'] as const;
export type JourneyContentPurpose = (typeof JOURNEY_CONTENT_PURPOSES)[number];

/** Explorer's asset query, whose purpose may also be a journey purpose. */
export type JourneyContentQuery = Omit<ContentAssetQuery, 'asset_type'> & {
  asset_type: ExplorerAssetPurpose | JourneyContentPurpose;
};

/**
 * A journey candidate IS Explorer's `Candidate` except that its asset queries
 * may name a journey purpose. Every Explorer `Candidate` is assignable to this
 * — Explorer's purposes are a subset of the union — so T309's learner strategy
 * hands Explorer's own candidates through unchanged, and the four fields the
 * arbiter reads are untouched.
 */
export type JourneyCandidate = Omit<Candidate, 'required_assets'> & {
  required_assets: JourneyContentQuery[];
};
export type { HardStopFlags };

export type JourneyProgramKind = 'learner' | 'business' | 'consulting';
export type JourneyChannel = 'email' | 'sms' | 'voice' | 'in_app' | 'none';
export type HumanConversation = 'yes' | 'no' | 'unknown';
export type SalesCapacity = 'available' | 'full' | 'unknown';

/* ── Scores ───────────────────────────────────────────────────────────────── */

/**
 * One visible component of one dimension. §5.3 forbids collapsing the
 * dimensions "into an unexplained score": a summary may rank work "only when
 * its components and reason are visible", so every point a dimension scores
 * names where it came from.
 *
 * The shape follows the repo's only existing precedent for this,
 * `inbox/opportunityScoringService.ts`'s `ScoreFactor`.
 */
export interface ScoreFactor {
  factor: string;
  label: string;
  points: number;
  detail?: string;
}

/**
 * A named score dimension.
 *
 * `value` is `null` when the dimension has **no source in this codebase** —
 * seven of §5.3's ten and six of §5.4's nine are in that position, per the
 * Phase 3 discovery. A null dimension contributes nothing to the summary and is
 * listed in `ScoreVector.gaps`. It is never defaulted to zero: a zero would
 * read as "measured, and low", which is a different and false claim.
 */
export interface ScoreDimension {
  key: string;
  label: string;
  value: number | null;
  /** Where the value came from, or `'none'` when nothing in the repo produces it. */
  source: string;
  factors: ScoreFactor[];
}

export interface ScoreVector {
  dimensions: ScoreDimension[];
  /** Present only when every contributing dimension has a value. */
  summary: number | null;
  /** The keys of every dimension that could not be scored, and why. */
  gaps: string[];
  /** False when the subject has no score source at all — a CPN lead, for instance. */
  available: boolean;
  computed_at: Date | null;
}

/* ── Contact evidence ─────────────────────────────────────────────────────── */

/** Per-channel eligibility, and which evaluator answered. */
export interface ChannelEvidence {
  eligible: boolean;
  reason: string;
  /** `consent` | `suppression` | `brand_preference` | `lead_status` | `failed_closed` | `none`. */
  evaluator: string;
  last_contact_at: Date | null;
  hours_since_last_contact: number | null;
}

/**
 * Everything the contact policy and the §7.3 record need.
 *
 * Two fields carry `'unknown'` as a real answer rather than a placeholder:
 * nothing in this codebase records whether a human is already in conversation
 * with a subject, and there is no sales-capacity table at all. `'unknown'`
 * never unlocks an action — a strategy may not emit a Layer 3 or Layer 4
 * candidate while either is unknown, and the suppression says which one.
 */
export interface ContactEvidence {
  channels: Record<JourneyChannel, ChannelEvidence>;
  recent_contact_count: number;
  hours_since_last_contact: number | null;
  human_conversation: HumanConversation;
  human_conversation_reason: string;
  sales_capacity: SalesCapacity;
  sales_capacity_reason: string;
  /** True when a lookup failed and every channel was closed as a result. */
  failed_closed: boolean;
}

/* ── The subject context ──────────────────────────────────────────────────── */

/**
 * What Explorer knows about a LEARNER subject, in Explorer's own shapes (T309).
 *
 * Every field here is an existing Explorer type, so the learner strategy can
 * build a `GovernorContext` and hand it to Explorer's own generators without a
 * translation layer that could drift. `scores` are Explorer's E/I/F, produced by
 * Explorer's scorer over Explorer's readout — a journey never invents a learner
 * score, and T306's vector reports `available: false` for a learner programme
 * for exactly that reason.
 *
 * ABSENT (`undefined` or `null`) for a subject with no `explorer_journey_profiles`
 * row. That table's key is an `enrollments.id`, so a CPN scholarship lead, a
 * community signup or any subject who never enrolled has nothing here — and the
 * strategy's answer for them is a refusal that says so, never a profile made up
 * to have something to score.
 */
export interface LearnerFacts {
  enrollment_id: string;
  primary_state: ExplorerPrimaryState;
  overlays: ExplorerOverlay[];
  scores: { e: number; i: number; f: number };
  affinities: ExplorerAffinity[];
  readout: ExplorerSignalReadout;
  state_entered_at: Date | null;
}

/** What the classifier decided, as the decision needs to cite it. */
export interface JourneyClassificationRef {
  classification_id: string | null;
  brand_relationship: string | null;
  primary_path: string | null;
  secondary_paths: string[];
  intent: string | null;
  requires_human_review: boolean;
  source_step: number | null;
}

export interface JourneySubjectContext {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
  program_id: string | null;
  program_slug: string | null;
  /** `active` is required before a programme may enrol anyone; all four are `draft` today. */
  program_status: string | null;
  program_kind: JourneyProgramKind;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  classification: JourneyClassificationRef | null;
  state: string;
  state_entered_at: Date | null;
  overlays: string[];
  scores: ScoreVector;
  contact: ContactEvidence;
  hardStop: HardStopFlags;
  /**
   * Fed to the EXISTING `evaluateFreshness`, whose four refusals are not mapped
   * the obvious way: a NULL `scores_computed_at` is `missing_timestamps`, while
   * `never_scored` is the equal-timestamps sentinel (the bridge writes both at
   * the same instant, so equality means created-but-never-scored).
   */
  freshness: FreshnessInput;
  asOf: Date;
  /**
   * T309. Present for a learner subject Explorer has a profile for; absent or
   * null otherwise. Optional so that every context T303 and T308 already build
   * stays valid, and because for three of the four programmes it is meaningless.
   */
  learner?: LearnerFacts | null;
  /**
   * T506. The registered Layer 2 flow campaigns a human has APPROVED for this
   * brand (`validateCampaign` in review mode: registered, present, brand-scoped,
   * approved, sequenced) - keys only. Absent or empty means every Layer 2 action
   * stays a deferral with a named gap; nothing here is read for any other brand.
   */
  approvedFlows?: string[];
}

/* ── The strategy ─────────────────────────────────────────────────────────── */

/**
 * One per programme kind. A strategy proposes and explains; it cannot act.
 *
 * `generate` is pure: no I/O, no model client, no mailer — the same contract
 * Explorer's generators hold, enforced for this subtree by the Phase 2 no-send
 * scanner, which already recurses into `services/growthJourney`.
 */
export interface JourneyStrategy {
  program_kind: JourneyProgramKind;
  ruleset_version: string;
  /** The six tier-0 stops, computed by the strategy because Explorer hard-codes three of them to false. */
  hardStops(ctx: JourneySubjectContext): HardStopFlags;
  generate(ctx: JourneySubjectContext): JourneyCandidate[];
  /**
   * T309. When `generate` returns nothing, WHY — so the refusal can say
   * `no_candidate:no_learner_profile` rather than a bare `no_candidate`. The
   * pipeline keeps the class and appends the reason, so a strategy without this
   * hook produces exactly the refusal it always did. Return null to say nothing.
   */
  emptyReason?(ctx: JourneySubjectContext): string | null;
  /**
   * T310. The Layer 2-4 shapes this strategy WOULD propose if it were allowed
   * to — a handoff, a scheduling offer — recorded on the decision as
   * `deferred_actions` and never applied. §8 says a programme may escalate
   * only when human involvement is the best next action; this is how a
   * shadow decision says "it would have been", without doing it.
   */
  defer?(ctx: JourneySubjectContext): JourneyDeferral[];
}

/* ── The decision ─────────────────────────────────────────────────────────── */

export interface JourneySuppression {
  action_type: string;
  campaign_key: string | null;
  reason: string;
}

/** A would-be action recorded and not applied — Phase 4/5's surface. */
export interface JourneyDeferral {
  would: string;
  reason: string;
  payload: Record<string, unknown>;
}

/**
 * The decided answer for one subject in one brand, shaped to become one
 * `growth_journey_decisions` row.
 *
 * `selected_action` may legitimately be `WAIT` with a named reason — a refused
 * freshness gate, a hard stop, a content gap, an unknown capacity. The phase's
 * exit criterion is "one governed action per subject **or a named refusal**",
 * and with every programme still `draft` and four of eight content purposes
 * declared unsupported, a refusal is the honest answer for most subjects today.
 */
export interface JourneyDecision {
  selected_action: string;
  selected_path: string | null;
  selected_channel: JourneyChannel | null;
  selected_content: Record<string, unknown> | null;
  candidates: JourneyCandidate[];
  suppressed: JourneySuppression[];
  deferred_actions: JourneyDeferral[];
  eligibility: EligibilityDecision | null;
  content_gaps: string[];
  reason: string;
  requires_human_review: boolean;
  ai_involved: boolean;
  model_version: string | null;
  ruleset_version: string;
}

export type DecideOutcome =
  | { status: 'disabled' }
  | { status: 'decided'; decision: JourneyDecision };

/**
 * What `decideForSubject` needs from the world. Injected so the decider stays
 * pure and every test states its own policy.
 *
 * `assertOfferAllowed` is the brand boundary, consulted for EVERY candidate
 * before arbitration and again on the winner — the same function Phase 2 uses,
 * never a copy, because a second eligibility check would be a second policy.
 *
 * `resolveContent` is the seam T305 fills. Until then a candidate that requests
 * an asset resolves to a named gap rather than a silent pass, which is the
 * behaviour the spec asks for anyway: a content gap produces `WAIT`.
 */
export interface DecideDeps {
  assertOfferAllowed: (args: { brandId: string; offerFamily: string }) => Promise<unknown>;
  contactPolicyFor: (candidate: JourneyCandidate, ctx: JourneySubjectContext) => ContactPolicyInput;
  resolveContent?: (
    candidate: JourneyCandidate,
    ctx: JourneySubjectContext,
  ) => Promise<{ assets: Record<string, unknown>[]; gaps: string[] }>;
}
