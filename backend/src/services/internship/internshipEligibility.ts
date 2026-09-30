import type { InternshipState } from './internshipStateMachine';

/**
 * What the Today card should show — the pure part.
 *
 * Kept free of I/O so the whole state table is unit-testable without a database,
 * and so the mapping from lifecycle state to card state exists in exactly one
 * place. The service layer reads the rows; this decides what they mean.
 */

/**
 * The card's own vocabulary, from the implementation contract's "Today card
 * states" list, plus two the contract's own lifecycle forces:
 *
 *   - `payment_pending` — the contract's list predates the payment gate. It is a
 *     BLOCKING STUDENT ACTION ("your place is held, complete your membership"),
 *     so it cannot be folded into `activation_pending`, which tells the student
 *     to sit and wait. Showing "final activation in progress" to someone whose
 *     activation is actually waiting on them would be a lie.
 *   - `none` — no card at all.
 */
export type InternshipCardState =
  | 'none'
  | 'eligible'
  | 'started'
  | 'interview_choice'
  | 'call_scheduled'
  | 'interview_in_progress'
  | 'under_review'
  | 'information_requested'
  | 'approved_documents_pending'
  | 'documents_uploaded'
  | 'payment_pending'
  | 'activation_pending'
  | 'active'
  | 'rejected'
  | 'waitlisted';

/**
 * Lifecycle state → card state.
 *
 * `interview_complete` maps to `interview_in_progress` rather than getting its
 * own card state: the contract's list has no "review your summary" entry, and
 * from the student's side the interview genuinely is still their open task —
 * they have answers to confirm before it goes anywhere. The CTA differs (see
 * `cardCta`), the card state does not.
 */
const STATE_TO_CARD: Record<InternshipState, InternshipCardState> = {
  not_started: 'eligible',
  started: 'started',
  administrative_intake_complete: 'interview_choice',
  interview_channel_selected: 'interview_choice',
  interview_scheduled: 'call_scheduled',
  interview_in_progress: 'interview_in_progress',
  interview_complete: 'interview_in_progress',
  under_review: 'under_review',
  information_requested: 'information_requested',
  waitlisted: 'waitlisted',
  approved: 'approved_documents_pending',
  offer_letter_ready: 'approved_documents_pending',
  signed_documents_uploaded: 'documents_uploaded',
  documents_verified: 'activation_pending',
  payment_pending: 'payment_pending',
  activation_pending: 'activation_pending',
  active: 'active',
  paused: 'active',
  // Terminal states that are not a decision the student needs to see on Today.
  // A completed or withdrawn internship belongs in their profile history, not
  // as a standing card competing with this week's work.
  completed: 'none',
  withdrawn: 'none',
  removed: 'none',
  rejected: 'rejected',
};

export function cardStateFor(state: InternshipState): InternshipCardState {
  return STATE_TO_CARD[state] ?? 'none';
}

/**
 * Card states that represent something the STUDENT must do next, as opposed to
 * something they are waiting on us for.
 *
 * This is what gates whether the card is allowed to pulse and whether it may be
 * offered to the Today next-step resolver. "Do not compete continuously with the
 * student's current learning next step" — a card that says "we are reviewing
 * your application" has no business pulsing for attention, because there is
 * nothing the student could do about it.
 */
const STUDENT_ACTIONABLE: ReadonlySet<InternshipCardState> = new Set<InternshipCardState>([
  'eligible',
  'started',
  'interview_choice',
  'interview_in_progress',
  'information_requested',
  'approved_documents_pending',
  'payment_pending',
]);

export function isStudentActionable(card: InternshipCardState): boolean {
  return STUDENT_ACTIONABLE.has(card);
}

/** Headline and CTA per card state. Copy lives here so the states cannot drift. */
export function cardCopy(card: InternshipCardState, opts?: { state?: InternshipState }): {
  title: string;
  cta: string | null;
} {
  switch (card) {
    case 'eligible':
      return { title: 'AI Internship', cta: 'Apply for the AI Internship' };
    case 'started':
      return { title: 'Your application', cta: 'Continue application' };
    case 'interview_choice':
      return { title: 'Choose how to interview', cta: 'Online questions or an AI call' };
    case 'call_scheduled':
      return { title: 'Your AI interview call', cta: 'Reschedule' };
    case 'interview_in_progress':
      // The one place the collapsed `interview_complete` mapping shows through.
      return opts?.state === 'interview_complete'
        ? { title: 'Review your answers', cta: 'Review and submit' }
        : { title: 'Your interview', cta: 'Continue remaining questions' };
    case 'under_review':
      return { title: 'Application under review', cta: null };
    case 'information_requested':
      return { title: 'Action required', cta: 'Send what we asked for' };
    case 'waitlisted':
      // Deliberately does not promise admission.
      return { title: 'You are on the waitlist', cta: null };
    case 'approved_documents_pending':
      return { title: 'Download and sign your offer letter', cta: 'Get your offer letter' };
    case 'documents_uploaded':
      return { title: 'Documents under review', cta: null };
    case 'payment_pending':
      // Truthful about who is waiting on whom.
      return { title: 'Complete your membership to start', cta: 'Choose your plan' };
    case 'activation_pending':
      return { title: 'Final activation in progress', cta: null };
    case 'active':
      return { title: 'AI Internship', cta: 'Open your internship' };
    case 'rejected':
      return { title: 'Your application decision', cta: 'Read the decision' };
    case 'none':
    default:
      return { title: '', cta: null };
  }
}

/**
 * Should the card be rendered at all right now?
 *
 * `dismissedUntil` is the server-stored reappearance date. Dismissal only ever
 * hides a card the student could act on; it never hides `information_requested`
 * or a decision, because those are things we owe them an answer about.
 */
export function shouldRenderCard(params: {
  card: InternshipCardState;
  flagEnabled: boolean;
  dismissedUntilMs: number | null;
  nowMs: number;
}): boolean {
  if (!params.flagEnabled) return false;
  if (params.card === 'none') return false;

  const dismissible = params.card === 'eligible';
  if (
    dismissible
    && params.dismissedUntilMs !== null
    && params.dismissedUntilMs > params.nowMs
  ) {
    return false;
  }
  return true;
}

/**
 * May the card pulse for attention?
 *
 * "Use a short, subtle pulse every few minutes, not continuous blinking. Stop
 * the animation for the session after interaction." The session-scoped stop is
 * the client's job; this decides whether pulsing is ever appropriate.
 *
 * Only the recruiting card pulses. Once someone has applied, the card is a
 * status surface, and animating it would be nagging a person about a queue they
 * are already in.
 */
export function mayPulse(card: InternshipCardState): boolean {
  return card === 'eligible' || card === 'information_requested';
}
