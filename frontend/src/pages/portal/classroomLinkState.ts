/**
 * Whether the student's phone is still hearing from the class.
 *
 * The companion poll on ClassCheckinPage used to swallow every error and keep
 * rendering its last view forever. A student whose session had gone watched a
 * status screen while the rest of the room answered questions: no message, no
 * retry, and nothing to tell them or the instructor anything was wrong. It is
 * indistinguishable from "the instructor is not on a question slide", which is
 * why it is invisible from both ends. Reported live in class on 2026-08-20.
 *
 * The decision is a pure function so it can be tested without mounting the
 * page, which needs auth context, a router and the portal API client.
 */
export type LinkState = 'live' | 'retrying' | 'signed_out';

/**
 * How many consecutive failures before the phone admits it is disconnected.
 * At the poll's 2.5s interval this is ~7.5s, which is long enough to ride out
 * a single dropped request on venue wifi and short enough that a student is not
 * left guessing for a whole question.
 */
export const LINK_FAILURE_GRACE = 3;

/**
 * Decide what to show after a failed poll.
 *
 * A 401 is terminal: the session is gone and no amount of waiting brings it
 * back, so say so immediately rather than spending the grace window pretending
 * it might recover. Everything else is treated as transient.
 */
export function linkStateAfterFailure(status: number | undefined, consecutiveFailures: number): LinkState {
  if (status === 401) return 'signed_out';
  return consecutiveFailures >= LINK_FAILURE_GRACE ? 'retrying' : 'live';
}
