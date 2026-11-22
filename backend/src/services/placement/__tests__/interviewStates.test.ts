import { AUTO_AT, canMove, confidenceBand, INTERVIEW_STATES, interviewTypeOf, isInterviewState, isTerminal, REVIEW_AT } from '../interviewStates';

/** CP8.1 (kit F4): the interview states, the only moves between them, and the confidence bands. */
describe('canMove', () => {
  it('allows the F4 flow and the reschedule back to new', () => {
    expect(canMove('new', 'awaiting')).toBe(true);
    expect(canMove('awaiting', 'booked')).toBe(true);
    expect(canMove('review', 'new')).toBe(true);
    expect(canMove('booked', 'done')).toBe(true);
    expect(canMove('booked', 'new')).toBe(true); // rescheduled: the link is offered again
    for (const s of ['new', 'awaiting', 'review', 'booked'] as const) expect(canMove(s, 'cancelled')).toBe(true);
  });
  it('refuses everything else: out of a terminal state, backwards past booking, or to the same state', () => {
    expect(canMove('done', 'new')).toBe(false);
    expect(canMove('cancelled', 'booked')).toBe(false);
    expect(canMove('done', 'cancelled')).toBe(false);
    expect(canMove('booked', 'awaiting')).toBe(false);
    expect(canMove('new', 'done')).toBe(false);
    for (const s of INTERVIEW_STATES) expect(canMove(s, s)).toBe(false);
  });
  it('done and cancelled are terminal; the state guard knows the six states only', () => {
    expect(INTERVIEW_STATES.filter(isTerminal)).toEqual(['done', 'cancelled']);
    expect(isInterviewState('booked')).toBe(true);
    expect(isInterviewState('held')).toBe(false);
    expect(isInterviewState(null)).toBe(false);
  });
});

describe('confidenceBand', () => {
  it('0.95 is automatic, 0.94 review, 0.70 review, 0.69 needs a human; missing or junk counts as 0', () => {
    expect([AUTO_AT, REVIEW_AT]).toEqual([0.95, 0.7]);
    expect(confidenceBand(0.95)).toBe('auto');
    expect(confidenceBand(1)).toBe('auto');
    expect(confidenceBand(0.94)).toBe('review');
    expect(confidenceBand(0.7)).toBe('review');
    expect(confidenceBand(0.69)).toBe('human_only');
    expect(confidenceBand(null)).toBe('human_only');
    expect(confidenceBand(Number.NaN)).toBe('human_only');
  });
});

describe('interviewTypeOf', () => {
  it('maps the inbox manager sub-types it can; anything else is unknown (null), never guessed', () => {
    expect(interviewTypeOf('Phone Screen')).toBe('recruiter');
    expect(interviewTypeOf('client screen')).toBe('hiring_manager');
    expect(interviewTypeOf('Technical Interview')).toBe('technical');
    expect(interviewTypeOf('Interview Request')).toBeNull();
    expect(interviewTypeOf(undefined)).toBeNull();
  });
});
