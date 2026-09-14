import { OFFER_FAMILIES, type OfferFamilySlug } from '../../../models/OfferFamily';
import {
  applyLadderMonotonicity,
  settleEnteredAt,
  type MonotonicityRule,
} from './monotonicity';

/**
 * The AI Flotation lifecycle, and the hard exclusion (§5.4; Phase 3 T308).
 *
 * ─── T307'S MACHINERY, SHARED RATHER THAN COPIED ────────────────────────────
 *
 * Nine states on the same three steps — evidence for now, then monotonicity,
 * then `state_entered_at` only on a real change — and the monotonicity rule is
 * the SAME function T307 calls, extracted for this task. T307 argued that a
 * second discipline would mean two places to get it wrong; a third state
 * vocabulary is when that argument has to be true in code.
 *
 * ─── THE HARD EXCLUSION, AND WHY IT IS A PARTITION ──────────────────────────
 *
 * §5.4: "no `business_training`, learner training, certification or internship
 * offer may be selected, generated or sent in the AI Flotation brand context."
 *
 * Stated here as a PARTITION of the whole offer catalogue rather than as a
 * denylist, and a test asserts allowed ∪ excluded is exactly `OFFER_FAMILIES`
 * with no overlap. A denylist silently permits whatever is added to the
 * catalogue next; a partition fails the build until somebody decides which side
 * the new family is on. This brand is the one where getting that wrong means
 * selling training from a consultancy.
 *
 * ENFORCED TWICE, deliberately. This module refuses to let a denied family be
 * generated (`isFamilyAllowedForFlotation`), and `decideForSubject` re-checks
 * the winner through `assertOfferAllowed` before anything is recorded. Two
 * independent checks because one of them will eventually be bypassed by a
 * caller nobody has written yet — and because the generation-side check is a
 * code-level judgement while the decision-side one reads the live policy row, so
 * they fail differently.
 *
 * AND IT IS BRAND-SCOPED, NOT GLOBAL. The same business-training candidate for
 * the same subject under Colaberry Enterprise is allowed. A test proves both
 * directions, because an exclusion that turned out to be global would quietly
 * break the Enterprise journey rather than protect the Flotation one.
 *
 * ─── ONE STATE HAS NO SOURCE, AND ONE HAS A CAVEAT ──────────────────────────
 *
 * `SCOPE_IN_PROGRESS` cannot be entered: nothing records a scope artefact, and
 * `delivery_engagements` starts at `active` — i.e. after scoping is over. Same
 * absence T307 declared for `SOLUTION_SCOPING`, now with a second reason.
 *
 * `SOLUTION_VISUALIZED` IS reachable, but it means "a concept was produced for
 * them", NOT "they engaged with it": the advisory sync writes a recommendation
 * to `leads.maturity_score` and `idea_input`, while §5.4's own
 * `engagement with generated concepts` dimension has no source at all (T306).
 * The distinction is in the evidence string so a reader cannot mistake one for
 * the other.
 */

export const FLOTATION_STATES = [
  'NEW_PROJECT_LEAD',
  'IDEA_OR_PROBLEM_CAPTURED',
  'PROBLEM_CLARIFIED',
  'SOLUTION_VISUALIZED',
  'BUILD_QUALIFIED',
  'DISCOVERY_READY',
  'SCOPE_IN_PROGRESS',
  'PROPOSAL_OR_PAYMENT_READY',
  'PROJECT_STARTED',
] as const;

export type FlotationState = (typeof FLOTATION_STATES)[number];

/** Knowledge about the project. Never steps down. */
const PROJECT_LADDER: FlotationState[] = [
  'NEW_PROJECT_LEAD',
  'IDEA_OR_PROBLEM_CAPTURED',
  'PROBLEM_CLARIFIED',
  'SOLUTION_VISUALIZED',
  'BUILD_QUALIFIED',
];

/** May regress — a project can cool like any other deal. */
const COMMERCIAL_STATES: FlotationState[] = [
  'DISCOVERY_READY',
  'SCOPE_IN_PROGRESS',
  'PROPOSAL_OR_PAYMENT_READY',
];

const FLOTATION_MONOTONICITY: MonotonicityRule<FlotationState> = {
  ladder: PROJECT_LADDER,
  commercial: COMMERCIAL_STATES,
  terminal: 'PROJECT_STARTED',
  floor: 'BUILD_QUALIFIED',
};

/** States nothing in this codebase can evidence. */
export const DEFERRED_STATES: ReadonlyArray<{ state: FlotationState; reason: string; target: string }> =
  Object.freeze([
    Object.freeze({
      state: 'SCOPE_IN_PROGRESS' as FlotationState,
      reason:
        'nothing records a scope artefact against a lead: no statement of work, no scope document, no activity type for it, and `delivery_engagements` starts at `active`, which is after scoping is over rather than during it',
      target: 'Phase 4 — needs a scope artefact the intake process actually writes',
    }),
  ]);

/* ── the hard exclusion, as a partition of the whole catalogue ──────────────── */

/** §5.4's four service paths, plus the paid discovery its purpose names. */
export const FLOTATION_ALLOWED_FAMILIES: readonly OfferFamilySlug[] = Object.freeze([
  'ai_consulting',
  'workflow_automation',
  'application_build',
  'ai_project',
  'paid_discovery',
]);

/**
 * Everything else, and every entry is a deliberate decision.
 *
 * `learner_community_subscription` is here even though §5.4's sentence names
 * only "learner training, certification or internship". A community
 * subscription is a learner offer, this brand does not sell learner offers, and
 * reading the list as exhaustive would let the one learner family the sentence
 * happens not to enumerate through the boundary. Recorded as a judgement rather
 * than presented as the spec's own words.
 */
export const FLOTATION_EXCLUDED_FAMILIES: readonly OfferFamilySlug[] = Object.freeze([
  'business_training',
  'learner_free_training',
  'learner_paid_training',
  'learner_community_subscription',
  'learner_certification',
  'learner_internship',
]);

/**
 * The generation-side half of the exclusion.
 *
 * An unknown family is REFUSED, not allowed: a typo or a newly added catalogue
 * entry must not reach a Flotation subject because it matched neither list.
 */
export function isFamilyAllowedForFlotation(family: string | null | undefined): boolean {
  if (!family) return false;
  return (FLOTATION_ALLOWED_FAMILIES as readonly string[]).includes(family);
}

/** Why a family was refused, for the decision's own record. */
export function flotationExclusionReason(family: string | null | undefined): string | null {
  if (isFamilyAllowedForFlotation(family)) return null;
  if (!family) return 'flotation_excludes:no_family_named';
  if ((FLOTATION_EXCLUDED_FAMILIES as readonly string[]).includes(family)) {
    return `flotation_excludes:${family}`;
  }
  return `flotation_excludes:unknown_family:${family}`;
}

/** The partition, for the test that keeps it exhaustive. */
export function offerCatalogueIsPartitioned(): { missing: string[]; overlapping: string[] } {
  const allowed = new Set<string>(FLOTATION_ALLOWED_FAMILIES);
  const excluded = new Set<string>(FLOTATION_EXCLUDED_FAMILIES);
  return {
    missing: OFFER_FAMILIES.filter((f) => !allowed.has(f) && !excluded.has(f)),
    overlapping: OFFER_FAMILIES.filter((f) => allowed.has(f) && excluded.has(f)),
  };
}

/* ── overlays ───────────────────────────────────────────────────────────────── */

/**
 * §5.4 names no overlays either, so these five are not its vocabulary: each is
 * derived from a source that exists, and `CONCEPT_IGNORED` is deliberately NOT
 * among them because nothing records engagement with a generated concept.
 */
export const FLOTATION_OVERLAYS = [
  'STALLED',
  'NO_RESPONSE',
  'MEETING_NO_SHOW',
  'DECLINED',
  'HUMAN_REVIEW',
] as const;

export type FlotationOverlay = (typeof FLOTATION_OVERLAYS)[number];

export const DEFERRED_OVERLAYS: ReadonlyArray<{ overlay: string; reason: string }> = Object.freeze([
  Object.freeze({
    overlay: 'CONCEPT_IGNORED',
    reason:
      'nothing records whether a lead opened, read or replied to a generated concept — §5.4 asks for engagement with them and T306 found no source for it either',
  }),
  Object.freeze({
    overlay: 'SECURITY_BLOCKED',
    reason: '`technology_stack` and `selected_systems` name systems and carry no security or compliance attributes',
  }),
]);

/** A project stalls slower than a deal: see the business lifecycle's note. */
const STALLED_AFTER_DAYS = 28;

export interface ClassifyFlotationInput {
  previous: { state: string | null; state_entered_at: Date | null };
  lead: {
    pipeline_stage?: string | null;
    idea_input?: string | null;
    selected_systems?: string | string[] | null;
    maturity_score?: number | string | null;
    estimated_roi?: number | string | null;
  } | null;
  classification: {
    primary_path: string | null;
    secondary_paths: string[];
    intent: string | null;
    requires_human_review: boolean;
  } | null;
  inbound: { replied: number; booked_meeting: number; answered: number; declined: number };
  appointments: { scheduled: number; completed: number; no_show: number; cancelled: number };
  /** A `delivery_engagements` row whose `source_lead_id` is this subject. */
  hasDeliveryEngagement: boolean;
  /** An enrolment or payment exists. */
  isCustomer: boolean;
  asOf: Date;
}

export interface ClassifyFlotationResult {
  state: FlotationState;
  overlays: FlotationOverlay[];
  state_entered_at: Date;
  evidence: string[];
}

const PROPOSAL_STAGES = ['proposal_sent', 'negotiation'];

function hasText(raw: unknown): boolean {
  return typeof raw === 'string' && raw.trim() !== '';
}

function hasItems(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.some((x) => hasText(x));
  return hasText(raw);
}

function hasNumber(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'number') return Number.isFinite(raw);
  const text = String(raw).trim();
  if (text === '') return false;
  const digits = text.replace(/[^0-9.\-]/g, '');
  return digits !== '' && digits !== '-' && digits !== '.' && Number.isFinite(Number(digits));
}

function daysBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 86_400_000;
}

/** The state this subject's current evidence supports, strongest first. */
function evidenceState(input: ClassifyFlotationInput): { state: FlotationState; evidence: string[] } {
  const { lead, classification, inbound, appointments } = input;
  const stage = (lead?.pipeline_stage ?? '').trim().toLowerCase();

  if (input.hasDeliveryEngagement) {
    // The existing intake/delivery process, READ rather than rebuilt (§5.4).
    return { state: 'PROJECT_STARTED', evidence: ['a delivery engagement names this lead as its source'] };
  }
  if (input.isCustomer || stage === 'enrolled') {
    return {
      state: 'PROJECT_STARTED',
      evidence: [input.isCustomer ? 'payment or enrolment exists' : 'pipeline_stage=enrolled (signal)'],
    };
  }

  if (PROPOSAL_STAGES.includes(stage)) {
    return { state: 'PROPOSAL_OR_PAYMENT_READY', evidence: [`pipeline_stage=${stage} (signal)`] };
  }

  // SCOPE_IN_PROGRESS is unreachable. See DEFERRED_STATES.

  if (appointments.scheduled > 0 || appointments.completed > 0 || stage === 'meeting_scheduled') {
    const why =
      appointments.scheduled > 0
        ? `${appointments.scheduled} scheduled appointment(s)`
        : appointments.completed > 0
          ? `${appointments.completed} completed appointment(s)`
          : 'pipeline_stage=meeting_scheduled (signal)';
    return { state: 'DISCOVERY_READY', evidence: [why] };
  }

  const twoSided = inbound.replied + inbound.booked_meeting + inbound.answered;
  if (twoSided > 0) {
    return {
      state: 'BUILD_QUALIFIED',
      evidence: [`${twoSided} inbound outcome(s): the buyer engaged about the build`],
    };
  }

  if (hasNumber(lead?.maturity_score) || hasNumber(lead?.estimated_roi)) {
    return {
      state: 'SOLUTION_VISUALIZED',
      evidence: [
        'the advisory sync produced a recommendation for this lead — a concept was PRODUCED, which is not the same as the lead engaging with it (no source for that)',
      ],
    };
  }

  if (hasText(classification?.intent) && hasItems(lead?.selected_systems)) {
    return {
      state: 'PROBLEM_CLARIFIED',
      evidence: [`classified intent ${classification?.intent} plus the systems the visitor named`],
    };
  }

  if (hasText(lead?.idea_input) || hasText(classification?.intent)) {
    const why = hasText(lead?.idea_input) ? 'an idea or problem was captured in idea_input' : `classified intent ${classification?.intent}`;
    return { state: 'IDEA_OR_PROBLEM_CAPTURED', evidence: [why] };
  }

  return { state: 'NEW_PROJECT_LEAD', evidence: ['no evidence beyond the lead existing'] };
}

/** Fresh every run. Each entry names its source. */
function deriveOverlays(input: ClassifyFlotationInput, state: FlotationState): FlotationOverlay[] {
  const out: FlotationOverlay[] = [];
  const { inbound, appointments, classification, previous, asOf } = input;
  const twoSided = inbound.replied + inbound.booked_meeting + inbound.answered;

  if (
    previous.state_entered_at &&
    state !== 'PROJECT_STARTED' &&
    twoSided === 0 &&
    daysBetween(asOf, previous.state_entered_at) >= STALLED_AFTER_DAYS
  ) {
    out.push('STALLED');
  }
  if (twoSided === 0 && state !== 'NEW_PROJECT_LEAD' && state !== 'PROJECT_STARTED') out.push('NO_RESPONSE');
  if (appointments.no_show > 0) out.push('MEETING_NO_SHOW');
  if (inbound.declined > 0) out.push('DECLINED');
  if (classification?.requires_human_review === true) out.push('HUMAN_REVIEW');

  return out;
}

export function classifyFlotationState(input: ClassifyFlotationInput): ClassifyFlotationResult {
  const { state: candidate, evidence } = evidenceState(input);
  const { state, held, foreignPrevious } = applyLadderMonotonicity(
    candidate,
    input.previous.state,
    FLOTATION_MONOTONICITY,
  );

  const evidenceOut = held
    ? [
        ...evidence,
        `held at ${state}: ${state === 'PROJECT_STARTED' ? 'a started project is terminal' : 'knowledge does not step down'}`,
      ]
    : foreignPrevious
      ? [...evidence, `previous state ${input.previous.state} is not one of this programme's own: trusting current evidence`]
      : evidence;

  return {
    state,
    overlays: deriveOverlays(input, state),
    state_entered_at: settleEnteredAt(state, input.previous, input.asOf),
    evidence: evidenceOut,
  };
}
