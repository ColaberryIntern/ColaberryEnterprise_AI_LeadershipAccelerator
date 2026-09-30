/**
 * The regression this pins: a student's phone silently going deaf mid-class.
 *
 * On 2026-08-20 a student reported seeing no survey questions while the rest of
 * the room answered them. The companion poll caught every error and kept
 * rendering its last view, so a dead session and "the instructor is not on a
 * question slide" looked identical — to the student and to the instructor.
 * These cases exist so the phone can never go quiet without saying so again.
 */
import { LINK_FAILURE_GRACE, linkStateAfterFailure } from '../classroomLinkState';

describe('linkStateAfterFailure', () => {
  it('calls a 401 signed out immediately, without spending the grace window', () => {
    // Waiting cannot revive a dead session, so there is nothing to be gained by
    // pretending it might come back.
    expect(linkStateAfterFailure(401, 1)).toBe('signed_out');
  });

  it('still reports signed out however many times it has already failed', () => {
    expect(linkStateAfterFailure(401, LINK_FAILURE_GRACE + 5)).toBe('signed_out');
  });

  it('rides out a single dropped request without alarming the room', () => {
    expect(linkStateAfterFailure(undefined, 1)).toBe('live');
    expect(linkStateAfterFailure(503, 1)).toBe('live');
  });

  it('stays quiet right up to the grace threshold, then admits it', () => {
    expect(linkStateAfterFailure(500, LINK_FAILURE_GRACE - 1)).toBe('live');
    expect(linkStateAfterFailure(500, LINK_FAILURE_GRACE)).toBe('retrying');
  });

  it('treats a network error with no HTTP status as transient, not as a sign-out', () => {
    // An offline phone has no response object at all. That must not be
    // mistaken for an auth failure and send the student to a login screen.
    expect(linkStateAfterFailure(undefined, LINK_FAILURE_GRACE)).toBe('retrying');
  });

  it('never returns live once past the threshold, whatever the status', () => {
    for (const status of [undefined, 0, 404, 500, 502, 503]) {
      expect(linkStateAfterFailure(status, LINK_FAILURE_GRACE)).not.toBe('live');
    }
  });

  it('keeps the grace window short enough to matter at a 2.5s poll', () => {
    // 3 failures x 2.5s is about 7.5 seconds. Long enough to survive one blip,
    // short enough that nobody sits through a whole question wondering.
    expect(LINK_FAILURE_GRACE).toBeLessThanOrEqual(4);
  });
});
