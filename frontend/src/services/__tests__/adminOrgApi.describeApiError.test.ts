import { describeApiError } from '../adminOrgApi';

/**
 * describeApiError turns an axios failure into a sentence an operator can act
 * on, and it is the ONLY place that decides what an admin is told when a call
 * fails. Every admin page routes its failures through it.
 *
 * WHY THIS FILE EXISTS. Until 2026-08-27 nothing tested the real function. The
 * two suites that appeared to cover it — `AdminCaseStudies.states.test.tsx` and
 * `AdminBusinessAccounts.test.tsx` — both `jest.mock` the module and assert
 * against a string they supply themselves, so they prove the page renders
 * whatever it is handed and say nothing whatsoever about what the function
 * returns. A wrong message was therefore invisible to a green suite, which is
 * how the defect below survived: 401 and 403 shared one sentence telling the
 * operator to sign in again.
 *
 * That is wrong for 403 specifically, and it was observed misdirecting a real
 * admin on production: the Story Studio surface lab and its PREVIEW tab both
 * answer 403 for any surface outside the default, because the backend allowlist
 * `CASE_STUDY_SURFACE_LAB_USER_IDS` is unset. The operator was told to sign in
 * again for a condition no sign-in can change.
 */

const failure = (status?: number): unknown => (
  status === undefined ? new Error('network down') : { response: { status } }
);

describe('describeApiError separates "who are you" from "you may not"', () => {
  it('tells a 401 to sign in again, because that is genuinely the fix', () => {
    const message = describeApiError(failure(401), 'this preview');
    expect(message).toContain('Sign in again');
    expect(message).toContain('this preview');
  });

  it('does NOT tell a 403 to sign in again', () => {
    const message = describeApiError(failure(403), 'this preview');
    expect(message).not.toMatch(/sign in again to reach/i);
    expect(message).toContain('not permitted');
  });

  it('says plainly that signing in again will not fix a 403', () => {
    const message = describeApiError(failure(403), 'this preview');
    expect(message).toMatch(/signing in again will not change this/i);
    expect(message).toMatch(/permission or configuration/i);
  });

  it('gives 401 and 403 genuinely different sentences', () => {
    expect(describeApiError(failure(401), 'this preview'))
      .not.toBe(describeApiError(failure(403), 'this preview'));
  });

  it('names the subject it could not reach, whichever status it was', () => {
    for (const status of [401, 403, 404]) {
      expect(describeApiError(failure(status), 'the sync history')).toContain('the sync history');
    }
  });

  it('distinguishes "it failed" from "there is nothing here" on an unknown status', () => {
    const message = describeApiError(failure(500), 'these quotes');
    expect(message).toContain('HTTP 500');
    expect(message).toContain('not an empty result');
  });

  it('still answers a sentence when the failure carries no status at all', () => {
    const message = describeApiError(failure(), 'this Case Study');
    expect(message).toContain('this Case Study');
    expect(message).not.toContain('undefined');
  });

  it('reports a 404 as absence rather than as a failure', () => {
    expect(describeApiError(failure(404), 'this chart')).toBe('this chart not found.');
  });
});
