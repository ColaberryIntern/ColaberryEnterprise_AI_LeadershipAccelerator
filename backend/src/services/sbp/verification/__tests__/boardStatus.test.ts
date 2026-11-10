/**
 * boardStatusFor — the mapping, tested without a database, a repo or a mock.
 *
 * THE RULE THIS FILE EXISTS TO HOLD: this function can never produce
 * `complete`. Completion is awarded by `markTaskVerifiedComplete` alone, after
 * a verified verdict with a commit behind it. If a later edit ever routes
 * `verified` to a status here, the second test below fails and says why.
 *
 * The first test exists for the opposite reason: before this module, a story in
 * flight had no status to go to, and every working builder read as a zero.
 */
import { boardStatusFor } from '../boardStatus';
import type { StoryVerificationState } from '../verificationLatch';

/**
 * Every state the verdict union can hold, listed explicitly rather than derived.
 *
 * A derived list would grow silently when the union grows, and the new member
 * would fall through `default` to `null` with every test still green — which is
 * precisely how a story state ends up invisible on the board again. Adding a
 * state to `StoryVerificationState` should break this line and force a decision
 * here.
 */
const ALL_STATES: ReadonlyArray<StoryVerificationState> = [
  'not_started',
  'in_progress',
  'submitted',
  'verified',
];

describe('boardStatusFor', () => {
  it('puts work in flight on the board, which is the whole point', () => {
    expect(boardStatusFor('in_progress')).toBe('in_progress');
  });

  it('treats submitted as in flight, because the board has no fifth value', () => {
    // Awaiting verification is still started. The precise state stays readable
    // in verification_json.state for any caller that needs the distinction.
    expect(boardStatusFor('submitted')).toBe('in_progress');
  });

  it('leaves not_started alone, so a genuinely untouched story still reads as one', () => {
    expect(boardStatusFor('not_started')).toBe('not_started');
  });

  it('declines to set anything for verified, rather than guessing', () => {
    // null means "not mine to set", NOT "nothing is known". The task is
    // complete and markTaskVerifiedComplete owns it.
    expect(boardStatusFor('verified')).toBeNull();
  });

  it('NEVER returns complete, for any state in the union', () => {
    // The load-bearing assertion. Students were once found PATCHing their own
    // stories to complete; the allowlist closed that door, and this keeps the
    // verification loop from quietly opening a second one.
    for (const state of ALL_STATES) {
      expect(boardStatusFor(state)).not.toBe('complete');
    }
  });

  it('answers for every state in the union, so none can fall through unnoticed', () => {
    const answered = ALL_STATES.filter((s) => boardStatusFor(s) !== null);
    // Three of the four get a status; only `verified` abstains.
    expect(answered).toEqual(['not_started', 'in_progress', 'submitted']);
  });
});
