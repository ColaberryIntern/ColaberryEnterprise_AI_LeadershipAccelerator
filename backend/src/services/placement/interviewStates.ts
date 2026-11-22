/**
 * Career Prep v27, CP8.1 (kit F4): the placement interview's states and the ONLY moves between them. PURE.
 *
 *   new        the interview was found (>= 0.95) and the booking link is due to the employer (CP8.1b)
 *   awaiting   the employer opened the booking link but has not booked
 *   review     with a recruiter (0.70 to 0.94, or sent back by a person)
 *   booked     a time is confirmed
 *   done       held (terminal)
 *   cancelled  called off (terminal)
 *
 * A reschedule of a booked interview goes back to `new` (the booking link is offered again, F4 step 5). Anything not in
 * the table is refused, and a refused move writes nothing (interviewIngest.ts checks before it writes).
 */
export const INTERVIEW_STATES = ['new', 'awaiting', 'review', 'booked', 'done', 'cancelled'] as const;
export type InterviewState = (typeof INTERVIEW_STATES)[number];

const MOVES: Record<InterviewState, readonly InterviewState[]> = {
  new: ['awaiting', 'review', 'booked', 'cancelled'],
  awaiting: ['new', 'review', 'booked', 'cancelled'],
  review: ['new', 'booked', 'cancelled'],
  booked: ['new', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

export const isInterviewState = (s: unknown): s is InterviewState => typeof s === 'string' && (INTERVIEW_STATES as readonly string[]).includes(s);

export function canMove(from: InterviewState, to: InterviewState): boolean {
  return MOVES[from].includes(to);
}

export const isTerminal = (s: InterviewState): boolean => MOVES[s].length === 0;

/** Confidence bands (kit F3 thresholds, owned by the inbox manager; mirrored here so a stray event cannot bypass them). */
export const AUTO_AT = 0.95;
export const REVIEW_AT = 0.7;
export type Band = 'auto' | 'review' | 'human_only';
export function confidenceBand(confidence: number | null | undefined): Band {
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;
  if (c >= AUTO_AT) return 'auto';
  if (c >= REVIEW_AT) return 'review';
  return 'human_only';
}

/** The inbox manager's sub_type, as the Career Prep interview type (readiness targets); unknown -> null. */
export function interviewTypeOf(subType: string | null | undefined): 'recruiter' | 'hiring_manager' | 'technical' | null {
  switch (String(subType ?? '').trim().toLowerCase()) {
    case 'phone screen': return 'recruiter';
    case 'client screen': return 'hiring_manager';
    case 'technical interview': return 'technical';
    default: return null;
  }
}
