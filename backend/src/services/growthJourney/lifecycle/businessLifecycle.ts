import {
  applyLadderMonotonicity,
  settleEnteredAt,
  type MonotonicityRule,
} from './monotonicity';

/**
 * The Colaberry Business lifecycle (§5.3; Phase 3 T307).
 *
 * ─── EXPLORER'S MACHINERY, NOT A SECOND STATE MACHINE ───────────────────────
 *
 * The shape is `explorerStateMachine`'s, deliberately: read the evidence for
 * NOW, then apply monotonicity against the previous state, then move
 * `state_entered_at` only if the state actually changed. Same three steps, same
 * order, same reasons — a learner's progress and a buyer's progress are
 * different vocabularies but the same problem, and inventing a second discipline
 * for it would mean two places to get monotonicity wrong.
 *
 * Pure: no I/O, no clock of its own, no model client. The caller reads and
 * passes in; `profileService` writes.
 *
 * ─── WHAT REGRESSES AND WHAT DOES NOT ───────────────────────────────────────
 *
 * Explorer splits its states into a learning ladder that never steps down and
 * commercial states that may. The same split applies here for the same reason:
 *
 *   * The DISCOVERY ladder (new → problem identified → exploring → qualified) is
 *     KNOWLEDGE about the buyer's situation. Knowing they have a problem does
 *     not stop being true because they went quiet, so it never steps down. They
 *     gain a `STALLED` overlay instead.
 *   * The COMMERCIAL states (discovery ready → scoping → proposal/payment ready)
 *     may regress, because a deal cools: a cancelled meeting means they are no
 *     longer discovery-ready, and pretending otherwise would keep sending
 *     proposal-stage messages to someone who walked away.
 *   * `CUSTOMER` is terminal. Nothing demotes a customer, because every
 *     acquisition message stops there and getting it wrong means marketing at
 *     someone who has already paid.
 *
 * ─── `pipeline_stage` IS READ AND NEVER WRITTEN ─────────────────────────────
 *
 * `leads.pipeline_stage` is the de-facto lifecycle today, and it is a poor one:
 * every automatic transition fires on an OUTBOUND SEND, so the column records
 * what we did rather than where the buyer is, and `advancePipelineStage` cannot
 * express "lost" at all. It is therefore a SIGNAL here — evidence that a
 * proposal exists, which is a real fact about our own behaviour — and this
 * lifecycle never writes it. A raw-text scan enforces that.
 *
 * ─── ONE STATE HAS NO SOURCE, AND IT IS DECLARED ────────────────────────────
 *
 * `SOLUTION_SCOPING` cannot be entered today: nothing in this codebase records a
 * scoping conversation, a statement of work, or a scope document against a lead.
 * Explorer's `DEFERRED_RULES` precedent applies — the absence is declared in
 * `DEFERRED_STATES` with its reason, and a test asserts the machine really never
 * produces it. A state nobody can reach is much better declared than silently
 * unreachable.
 */

export const BUSINESS_STATES = [
  'NEW_BUSINESS_LEAD',
  'PROBLEM_IDENTIFIED',
  'EXPLORING_SOLUTIONS',
  'QUALIFIED_OPPORTUNITY',
  'DISCOVERY_READY',
  'SOLUTION_SCOPING',
  'PROPOSAL_OR_PAYMENT_READY',
  'CUSTOMER',
] as const;

export type BusinessState = (typeof BUSINESS_STATES)[number];

/** Knowledge about the buyer. Index position IS the monotonicity rule. */
const DISCOVERY_LADDER: BusinessState[] = [
  'NEW_BUSINESS_LEAD',
  'PROBLEM_IDENTIFIED',
  'EXPLORING_SOLUTIONS',
  'QUALIFIED_OPPORTUNITY',
];

/** May regress — a deal cools, unlike knowledge. */
const COMMERCIAL_STATES: BusinessState[] = [
  'DISCOVERY_READY',
  'SOLUTION_SCOPING',
  'PROPOSAL_OR_PAYMENT_READY',
];

/**
 * States this codebase cannot evidence. Absent on purpose, named so the absence
 * is a fact rather than an oversight.
 */
export const DEFERRED_STATES: ReadonlyArray<{ state: BusinessState; reason: string; target: string }> =
  Object.freeze([
    Object.freeze({
      state: 'SOLUTION_SCOPING' as BusinessState,
      reason:
        'nothing records a scoping conversation, a statement of work or a scope document against a lead: `activities` has no type vocabulary for it, `leads.pipeline_stage` jumps straight from meeting_scheduled to proposal_sent, and there is no opportunities table at all',
      target: 'Phase 4 — needs a scope artefact or an activity type somebody actually writes',
    }),
  ]);

/**
 * Overlays, derived FRESH every run and never accumulated, so "cleared" means
 * "not re-derived this run" rather than "explicitly removed".
 *
 * §5.3 NAMES NO OVERLAYS — it lists states and score dimensions only. These six
 * are therefore not the spec's vocabulary and do not pretend to be: each is
 * derived from a source that exists in this repo, and each says which. Inventing
 * a richer set and attributing it to §5.3 would be the kind of fabricated
 * authority this phase keeps catching.
 */
export const BUSINESS_OVERLAYS = [
  'STALLED',
  'NO_RESPONSE',
  'MEETING_NO_SHOW',
  'DECLINED',
  'MULTI_PATH',
  'HUMAN_REVIEW',
] as const;

export type BusinessOverlay = (typeof BUSINESS_OVERLAYS)[number];

/** Overlays worth having that nothing here can derive. */
export const DEFERRED_OVERLAYS: ReadonlyArray<{ overlay: string; reason: string }> = Object.freeze([
  Object.freeze({
    overlay: 'SPONSOR_IDENTIFIED',
    reason: '`leads.title` is one string for one person and no role, seniority or sponsorship data exists for anyone else at the account',
  }),
  Object.freeze({
    overlay: 'BUDGET_CONFIRMED',
    reason: 'there is no budget field; `estimated_roi` is a self-reported expected return and a payment is a conversion, not a confirmation',
  }),
  Object.freeze({
    overlay: 'SECURITY_REVIEW',
    reason: '`technology_stack` and `selected_systems` name systems and carry no security or compliance attributes',
  }),
]);

/**
 * Days in one state with no inbound before it reads as stalled.
 *
 * A CHOICE, not a measurement: nothing in this repo records the real
 * distribution of B2B cycle times. The nearest precedent is Explorer's
 * `DORMANT_DAYS = 14` for a learner going quiet, and this is deliberately longer
 * because a buying committee is slower than a learner. Stated so the next person
 * knows it is tunable rather than derived.
 */
const STALLED_AFTER_DAYS = 21;

export interface ClassifyBusinessInput {
  /** The profile as it stands. `null` state means this subject is new. */
  previous: { state: string | null; state_entered_at: Date | null };
  /**
   * Lead columns, read as SIGNALS. `pipeline_stage` in particular is never
   * written by this lifecycle.
   */
  lead: {
    pipeline_stage?: string | null;
    idea_input?: string | null;
    selected_systems?: string | string[] | null;
  } | null;
  /** Phase 2's classification, when there is one. */
  classification: {
    primary_path: string | null;
    secondary_paths: string[];
    intent: string | null;
    requires_human_review: boolean;
  } | null;
  /** Counted `interaction_outcomes` rows — the counterparty's side. */
  inbound: { replied: number; booked_meeting: number; answered: number; declined: number };
  /** Counted `appointments` rows by status. */
  appointments: { scheduled: number; completed: number; no_show: number; cancelled: number };
  /** True when an enrolment or payment exists for this subject. */
  isCustomer: boolean;
  asOf: Date;
}

export interface ClassifyBusinessResult {
  state: BusinessState;
  overlays: BusinessOverlay[];
  state_entered_at: Date;
  /** Why this state, in order of the checks that fired. One string per reason. */
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

function daysBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 86_400_000;
}

/**
 * The state this subject's CURRENT evidence supports, ignoring history.
 *
 * Ordered strongest first, so the highest supported state wins and the reason
 * recorded is the one that decided it.
 */
function evidenceState(input: ClassifyBusinessInput): { state: BusinessState; evidence: string[] } {
  const { lead, classification, inbound, appointments } = input;
  const stage = (lead?.pipeline_stage ?? '').trim().toLowerCase();

  if (input.isCustomer || stage === 'enrolled') {
    return {
      state: 'CUSTOMER',
      evidence: [input.isCustomer ? 'enrolment or payment exists' : 'pipeline_stage=enrolled (signal)'],
    };
  }

  if (PROPOSAL_STAGES.includes(stage)) {
    // Our own action, and a real fact: a proposal exists.
    return { state: 'PROPOSAL_OR_PAYMENT_READY', evidence: [`pipeline_stage=${stage} (signal)`] };
  }

  // SOLUTION_SCOPING is unreachable — see DEFERRED_STATES.

  if (appointments.scheduled > 0 || appointments.completed > 0 || stage === 'meeting_scheduled') {
    const why =
      appointments.scheduled > 0
        ? `${appointments.scheduled} scheduled appointment(s)`
        : appointments.completed > 0
          ? `${appointments.completed} completed appointment(s)`
          : 'pipeline_stage=meeting_scheduled (signal)';
    return { state: 'DISCOVERY_READY', evidence: [why] };
  }

  // Two-sided contact. A reply, an answer or a booking is the buyer acting,
  // which is what separates a qualified opportunity from one we merely like.
  const twoSided = inbound.replied + inbound.booked_meeting + inbound.answered;
  if (twoSided > 0) {
    return {
      state: 'QUALIFIED_OPPORTUNITY',
      evidence: [`${twoSided} inbound outcome(s): replied ${inbound.replied}, booked ${inbound.booked_meeting}, answered ${inbound.answered}`],
    };
  }

  if (hasItems(lead?.selected_systems) || hasText(classification?.primary_path)) {
    const why = hasItems(lead?.selected_systems)
      ? 'systems named by the visitor'
      : `classified path ${classification?.primary_path}`;
    return { state: 'EXPLORING_SOLUTIONS', evidence: [why] };
  }

  if (hasText(lead?.idea_input) || hasText(classification?.intent)) {
    const why = hasText(lead?.idea_input) ? 'a problem was stated in idea_input' : `classified intent ${classification?.intent}`;
    return { state: 'PROBLEM_IDENTIFIED', evidence: [why] };
  }

  return { state: 'NEW_BUSINESS_LEAD', evidence: ['no evidence beyond the lead existing'] };
}

/**
 * The monotonicity rule this machine hands to the shared implementation.
 *
 * Extracted in T308 rather than copied into the second lifecycle: T307's own
 * argument was that a second discipline means two places to get it wrong, and a
 * third state vocabulary is when that has to be true in code rather than in a
 * comment. T307's whole suite is the proof the extraction changed nothing.
 */
const BUSINESS_MONOTONICITY: MonotonicityRule<BusinessState> = {
  ladder: DISCOVERY_LADDER,
  commercial: COMMERCIAL_STATES,
  terminal: 'CUSTOMER',
  floor: 'QUALIFIED_OPPORTUNITY',
};

/** Fresh every run. Each entry names the source that produced it. */
function deriveOverlays(input: ClassifyBusinessInput, state: BusinessState): BusinessOverlay[] {
  const out: BusinessOverlay[] = [];
  const { inbound, appointments, classification, previous, asOf } = input;

  const twoSided = inbound.replied + inbound.booked_meeting + inbound.answered;

  // STALLED: long in one place with nothing coming back. Uses `state_entered_at`,
  // which the profile really carries — unlike Explorer's overlays, which have no
  // per-overlay timestamp and therefore defer every duration rule.
  if (
    previous.state_entered_at &&
    state !== 'CUSTOMER' &&
    twoSided === 0 &&
    daysBetween(asOf, previous.state_entered_at) >= STALLED_AFTER_DAYS
  ) {
    out.push('STALLED');
  }

  // Not a customer: someone who paid without ever replying is not unresponsive.
  if (twoSided === 0 && state !== 'NEW_BUSINESS_LEAD' && state !== 'CUSTOMER') out.push('NO_RESPONSE');
  if (appointments.no_show > 0) out.push('MEETING_NO_SHOW');
  if (inbound.declined > 0) out.push('DECLINED');
  if ((classification?.secondary_paths ?? []).length > 0) out.push('MULTI_PATH');
  if (classification?.requires_human_review === true) out.push('HUMAN_REVIEW');

  return out;
}

export function classifyBusinessState(input: ClassifyBusinessInput): ClassifyBusinessResult {
  const { state: candidate, evidence } = evidenceState(input);
  const { state, held, foreignPrevious } = applyLadderMonotonicity(
    candidate,
    input.previous.state,
    BUSINESS_MONOTONICITY,
  );

  const evidenceOut = held
    ? [...evidence, `held at ${state}: ${state === 'CUSTOMER' ? 'customer is terminal' : 'knowledge does not step down'}`]
    : foreignPrevious
      ? [...evidence, `previous state ${input.previous.state} is not one of this programme's own: trusting current evidence`]
      : evidence;

  // Moves ONLY on a real change — the shared rule, for the same reason both
  // machines need it: every duration rule reads this clock.
  const state_entered_at = settleEnteredAt(state, input.previous, input.asOf);

  return {
    state,
    overlays: deriveOverlays(input, state),
    state_entered_at,
    evidence: evidenceOut,
  };
}
