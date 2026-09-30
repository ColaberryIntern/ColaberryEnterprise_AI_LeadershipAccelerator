/**
 * The AI Internship application lifecycle — the single authority on what state
 * an application may move to, and who is allowed to move it.
 *
 * PURE MODULE. No database, no I/O, no clock. Everything here is a function of
 * its arguments, so the whole lifecycle is unit-testable without a fixture, and
 * every route can call it before it writes.
 *
 * ── WHY A TABLE RATHER THAN `if` STATEMENTS SCATTERED THROUGH ROUTES ────────
 *
 * The contract's requirement is blunt: "A frontend request must not be able to
 * skip approval or document verification." That is only true if there is ONE
 * place that knows `approved` does not reach `active`. Spread across a
 * controller, a service and a webhook handler, the rule holds until the third
 * caller forgets it — and the failure is silent, because an over-permissive
 * transition looks exactly like a successful one. Here, a transition that is
 * not in TRANSITIONS cannot happen anywhere, and adding one is a visible diff
 * against a table a reviewer can read in a sitting.
 *
 * ── THE HUMAN GATE IS ENCODED AS AN ACTOR, NOT A COMMENT ────────────────────
 *
 * "The AI produces a recommendation, not the final admission decision." An AI
 * recommendation arrives through the same service layer as everything else, so
 * a rule written only in prose would be enforced by whoever happened to read
 * it. Instead `approved` / `rejected` / `waitlisted` are reachable ONLY by the
 * `reviewer` actor. The `system` actor — which is what an AI recommendation, a
 * webhook and a cron job all authenticate as — is structurally incapable of
 * admitting anyone. See `canTransition`: there is no override parameter,
 * because an override is how that rule would eventually be bypassed.
 */

/** Every state an application can occupy. Order is the happy path. */
export const INTERNSHIP_STATES = [
  'not_started',
  'started',
  'administrative_intake_complete',
  'interview_channel_selected',
  'interview_scheduled',
  'interview_in_progress',
  'interview_complete',
  'under_review',
  'information_requested',
  'waitlisted',
  'approved',
  'offer_letter_ready',
  'signed_documents_uploaded',
  'documents_verified',
  // NOT in the original contract's list. Added per docs/AI_INTERNSHIP_DISCOVERY.md
  // §3.1: AI_INTERNSHIP_SPEC.md records as verified that "the intern PAYS" and
  // that access unlocks "when payment clears". Without this state,
  // `documents_verified` grants hasFullCurriculumAccess() — the full paid
  // training programme, free, permanently. The state is SKIPPED when the
  // internship cohort's `requires_subscription` setting is false, so a
  // deliberately free internship costs one setting rather than a schema change.
  'payment_pending',
  'activation_pending',
  'active',
  'paused',
  'completed',
  'withdrawn',
  'removed',
  'rejected',
] as const;

export type InternshipState = typeof INTERNSHIP_STATES[number];

/**
 * Who is asking. This is an authorization input, not a label.
 *
 * - `applicant` — the person applying, acting on their own application.
 * - `reviewer`  — an authenticated human holding the `internship` admin section.
 * - `system`    — cron, webhook, AI recommendation, scheduled expiry. Deliberately
 *                 the WEAKEST actor: it may move an application along mechanical
 *                 rails (generate the offer letter, expire an unpaid one) but it
 *                 may never decide admission.
 */
export type InternshipActor = 'applicant' | 'reviewer' | 'system';

/** States from which nothing further can happen on THIS application. */
export const TERMINAL_STATES: readonly InternshipState[] = [
  'completed',
  'withdrawn',
  'removed',
  'rejected',
] as const;

export function isTerminal(state: InternshipState): boolean {
  return TERMINAL_STATES.includes(state);
}

interface Edge {
  to: InternshipState;
  /** Actors permitted to make this move. Empty is not allowed — omit the edge. */
  actors: readonly InternshipActor[];
}

/**
 * The transition table.
 *
 * Read a row as: "from THIS state, these are the only legal next states, and
 * only these actors may take them."
 */
const TRANSITIONS: Record<InternshipState, readonly Edge[]> = {
  not_started: [
    { to: 'started', actors: ['applicant'] },
  ],

  started: [
    { to: 'administrative_intake_complete', actors: ['applicant'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  administrative_intake_complete: [
    { to: 'interview_channel_selected', actors: ['applicant'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  // Choosing a channel is not committing to it. "Allow an applicant to begin in
  // one channel and finish in the other" means the choice stays revisable right
  // up until the interview completes.
  interview_channel_selected: [
    { to: 'interview_scheduled', actors: ['applicant'] },     // phone: booked for later
    { to: 'interview_in_progress', actors: ['applicant'] },   // guided form, or call now
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  interview_scheduled: [
    // Self-edge: reschedule. Modelled explicitly so a reschedule writes a real
    // status event with a reason, rather than mutating the row invisibly.
    { to: 'interview_scheduled', actors: ['applicant', 'reviewer'] },
    { to: 'interview_in_progress', actors: ['applicant', 'system'] }, // system: the call connected
    { to: 'interview_channel_selected', actors: ['applicant'] },      // cancelled the call, back to the choice
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  interview_in_progress: [
    // Self-edge: the contract's "resume across channels" case. A failed or
    // partial call that continues online is THIS edge — the application never
    // leaves interview_in_progress, and the answers already captured are kept
    // because they live in InternshipInterviewResponse, not in the state.
    { to: 'interview_in_progress', actors: ['applicant', 'system'] },
    { to: 'interview_scheduled', actors: ['applicant'] },  // partial call → book the rest by phone
    { to: 'interview_complete', actors: ['applicant', 'system'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  // The applicant reviews and corrects the summary here, THEN submits.
  interview_complete: [
    { to: 'interview_in_progress', actors: ['applicant'] },  // correcting an answer reopens the interview
    { to: 'under_review', actors: ['applicant'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  // The human gate. Every admission outcome is reviewer-only.
  under_review: [
    { to: 'information_requested', actors: ['reviewer'] },
    { to: 'waitlisted', actors: ['reviewer'] },
    { to: 'approved', actors: ['reviewer'] },
    { to: 'rejected', actors: ['reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  information_requested: [
    { to: 'under_review', actors: ['applicant'] },            // they answered
    { to: 'interview_in_progress', actors: ['applicant'] },   // what was missing was an interview answer
    { to: 'rejected', actors: ['reviewer'] },                 // no response / disqualifying answer
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  waitlisted: [
    { to: 'under_review', actors: ['reviewer'] },
    { to: 'approved', actors: ['reviewer'] },
    { to: 'rejected', actors: ['reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
  ],

  // From here the rails are mechanical, so `system` reappears — but note it can
  // only ever move an ALREADY-APPROVED application. It cannot create approval.
  approved: [
    { to: 'offer_letter_ready', actors: ['system', 'reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  offer_letter_ready: [
    { to: 'signed_documents_uploaded', actors: ['applicant'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  signed_documents_uploaded: [
    { to: 'documents_verified', actors: ['reviewer'] },
    // Correction requested: back to the letter, so the student re-uploads. The
    // previously uploaded file is NEVER overwritten (see InternshipDocument's
    // revision rule) — this edge is about what we still need, not about the file.
    { to: 'offer_letter_ready', actors: ['reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  documents_verified: [
    { to: 'payment_pending', actors: ['system', 'reviewer'] },     // requires_subscription = true
    { to: 'activation_pending', actors: ['system', 'reviewer'] },  // comped, or subscription not required
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  payment_pending: [
    { to: 'activation_pending', actors: ['system', 'reviewer'] },  // payment cleared, or reviewer comped
    // The spec's "nudge and an expiry … or they stall in limbo indefinitely".
    { to: 'withdrawn', actors: ['system', 'applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  activation_pending: [
    { to: 'active', actors: ['system', 'reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  active: [
    { to: 'paused', actors: ['reviewer'] },
    { to: 'completed', actors: ['reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  paused: [
    { to: 'active', actors: ['reviewer'] },
    { to: 'completed', actors: ['reviewer'] },
    { to: 'withdrawn', actors: ['applicant', 'reviewer'] },
    { to: 'removed', actors: ['reviewer'] },
  ],

  // Terminal. Reapplication opens a NEW application rather than reviving this
  // one, so the rejected record keeps its decision, its reason and its date
  // exactly as they were when the human made them.
  completed: [],
  withdrawn: [],
  removed: [],
  rejected: [],
};

/** Thrown when a caller attempts a move the table does not permit. */
export class InvalidInternshipTransitionError extends Error {
  readonly error_class = 'ContractViolation';
  readonly from: InternshipState;
  readonly to: InternshipState;
  readonly actor: InternshipActor;

  constructor(from: InternshipState, to: InternshipState, actor: InternshipActor) {
    super(`Illegal internship transition: ${from} -> ${to} by ${actor}`);
    this.name = 'InvalidInternshipTransitionError';
    this.from = from;
    this.to = to;
    this.actor = actor;
  }
}

export function isInternshipState(value: unknown): value is InternshipState {
  return typeof value === 'string' && (INTERNSHIP_STATES as readonly string[]).includes(value);
}

/**
 * May `actor` move an application from `from` to `to`?
 *
 * Deliberately has no `force` / `isAdmin` / `override` parameter. Every such
 * parameter ever added to a function like this one is eventually passed `true`
 * by a caller in a hurry, and the gate stops existing.
 */
export function canTransition(
  from: InternshipState,
  to: InternshipState,
  actor: InternshipActor,
): boolean {
  const edges = TRANSITIONS[from];
  if (!edges) return false;
  return edges.some((e) => e.to === to && e.actors.includes(actor));
}

/** `canTransition`, but throws. Use at every write boundary. */
export function assertTransition(
  from: InternshipState,
  to: InternshipState,
  actor: InternshipActor,
): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidInternshipTransitionError(from, to, actor);
  }
}

/** Every state `actor` could legally move to from `from`. For UI affordances. */
export function nextStates(from: InternshipState, actor: InternshipActor): InternshipState[] {
  return (TRANSITIONS[from] ?? [])
    .filter((e) => e.actors.includes(actor))
    .map((e) => e.to);
}

/**
 * The reviewer's decision vocabulary, mapped to states.
 *
 * "Approve with conditions" and "Schedule human follow-up" are both `approved`
 * and `information_requested` respectively at the STATE level — the condition
 * and the follow-up are recorded on InternshipDecision, because they change what
 * the student must do, not where the application sits.
 */
export const REVIEWER_DECISIONS = {
  approve: 'approved',
  approve_with_conditions: 'approved',
  reject: 'rejected',
  request_information: 'information_requested',
  schedule_human_follow_up: 'information_requested',
  waitlist: 'waitlisted',
} as const satisfies Record<string, InternshipState>;

export type ReviewerDecision = keyof typeof REVIEWER_DECISIONS;

/**
 * Where a verified-documents application goes next — the payment gate.
 *
 * Extracted so the gate has exactly one implementation.
 *
 * ── THE POLICY THIS ENCODES ────────────────────────────────────────────────
 *
 * Confirmed by Ali 2026-09-09: the internship requires the membership —
 * $149/mo billed annually or $199/mo month-to-month (the same two plans already
 * in subscriptionService.PLANS; the difference is the BILLING TERM, not the
 * content). The internship itself is a membership INCLUSION rather than a
 * separate product, which is why this returns "already covered" rather than
 * "charge them again" for a student who is paying.
 *
 * Per STUDENT_PLANS_AND_INTERNSHIP_POLICY.md the fee is WAIVED for:
 *   - anyone already paying Colaberry (a current Data Analytics student, IPBC)
 *     → `hasActiveSubscription`
 *   - anyone referred by Ram or approved by Ali
 *     → `hasActiveComp` (an admin-granted comp seat, subscriptionService.grantFreeAccess)
 * Everyone else pays the membership.
 *
 * `hasActiveSubscription` is deliberately separate from `hasActiveComp`. Both
 * skip payment, but they are different facts about a person and the reviewer
 * queue has to be able to tell them apart: one is a paying customer, the other
 * is an exception someone authorised. Collapsing them into a single boolean
 * would make an audit of "who got in free" impossible to answer.
 */
export function stateAfterDocumentsVerified(params: {
  requiresSubscription: boolean;
  /** An active paid plan already covers this person — the membership inclusion rule. */
  hasActiveSubscription: boolean;
  /** An admin-granted comp seat — the Ram-referral / Ali-approval waiver. */
  hasActiveComp: boolean;
}): Extract<InternshipState, 'payment_pending' | 'activation_pending'> {
  if (!params.requiresSubscription) return 'activation_pending';
  if (params.hasActiveSubscription) return 'activation_pending';
  if (params.hasActiveComp) return 'activation_pending';
  return 'payment_pending';
}
