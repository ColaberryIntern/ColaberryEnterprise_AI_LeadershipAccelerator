/**
 * repoTreeRateLimit — pacing and back-off for the repo sweep.
 *
 * Written against two real production failures, one after the other.
 *
 * The first sweep fired ~50 requests inside a second and GitHub 403'd all 25 connections,
 * while a single sync straight afterwards succeeded. That produced the pacing.
 *
 * The second sweep then synced 21 connections and stopped on three consecutive 403s from
 * `ColaberryIntern/AI_Pathway`, `AcceleratorTesting` and `OpportunityPulse` -- internal
 * repositories that 403 PERMANENTLY. Treating those as throttling was self-starving: they
 * have never synced, so they sort first on every sweep, and backing off on them would
 * block every real student behind them forever. That produced the reclassification below.
 *
 * The test that matters most is `does NOT let three permanently-forbidden repos starve
 * the queue`.
 */
import {
  DEFAULT_DELAY_MS, MAX_CONSECUTIVE_RATE_LIMITED,
  delayBefore, isRateLimited, shouldBackOff,
} from '../repoTreeRateLimit';

describe('isRateLimited', () => {
  it('recognises 429 and the wording GitHub uses', () => {
    for (const m of [
      'GitHub tree API error: 429',
      'You have exceeded a secondary rate limit',
      'API rate limit exceeded for user',
      'Too Many Requests',
      'triggered an abuse detection mechanism',
    ]) {
      expect(isRateLimited(m)).toBe(true);
    }
  });

  it('does NOT treat a bare 403 as throttling', () => {
    // GitHub overloads 403: rate limiting, and plain permission denial on a private repo
    // the caller cannot read. Production settled which is which. A rate limit applies to
    // the CALLER, and the caller had just made 21 successful calls in the same sweep.
    expect(isRateLimited('GitHub API error: 403')).toBe(false);
    expect(isRateLimited('GitHub tree API error: 403')).toBe(false);
  });

  it('still catches a 403 that says it is a rate limit', () => {
    expect(isRateLimited('GitHub API error: 403 - API rate limit exceeded')).toBe(true);
    expect(isRateLimited('403: You have exceeded a secondary rate limit')).toBe(true);
  });

  it('does NOT treat a broken repository as throttling', () => {
    // A 404 on one student's deleted or renamed repo says nothing about the next student.
    for (const m of [
      'GitHub API error: 404',
      'GitHub API error: 401',
      'GitHub API error: 500',
      'connect ETIMEDOUT',
      'No repo connected',
    ]) {
      expect(isRateLimited(m)).toBe(false);
    }
  });

  it('does not match a status code embedded in a larger number', () => {
    expect(isRateLimited('synced 4290 files')).toBe(false);
    expect(isRateLimited('repo id 1429299')).toBe(false);
  });

  it('does not throw on junk', () => {
    for (const bad of [undefined, null, 42, {}, [], '']) {
      expect(isRateLimited(bad as any)).toBe(false);
    }
  });
});

describe('shouldBackOff', () => {
  it('tolerates isolated throttling but yields once it is consistent', () => {
    expect(shouldBackOff(MAX_CONSECUTIVE_RATE_LIMITED - 1)).toBe(false);
    expect(shouldBackOff(MAX_CONSECUTIVE_RATE_LIMITED)).toBe(true);
    expect(shouldBackOff(MAX_CONSECUTIVE_RATE_LIMITED + 5)).toBe(true);
  });

  it('does not back off before anything has failed', () => {
    expect(shouldBackOff(0)).toBe(false);
  });
});

describe('delayBefore', () => {
  it('does not delay the first connection', () => {
    expect(delayBefore(0)).toBe(0);
  });

  it('paces every connection after the first', () => {
    expect(delayBefore(1)).toBe(DEFAULT_DELAY_MS);
    expect(delayBefore(24)).toBe(DEFAULT_DELAY_MS);
  });

  it('stays above the roughly one per second GitHub asks for', () => {
    expect(DEFAULT_DELAY_MS).toBeGreaterThan(1000);
  });

  it('honours an override, and treats a nonsense delay as none', () => {
    expect(delayBefore(3, 250)).toBe(250);
    for (const bad of [0, -100, NaN, Infinity]) {
      expect(delayBefore(3, bad)).toBe(0);
    }
    expect(delayBefore(3, undefined)).toBe(DEFAULT_DELAY_MS);
  });
});

/** Replays a sweep's error sequence and reports how many connections it reached. */
const reached = (errors: string[]): number => {
  let consecutive = 0;
  let attempted = 0;
  for (const e of errors) {
    attempted += 1;
    consecutive = isRateLimited(e) ? consecutive + 1 : 0;
    if (shouldBackOff(consecutive)) break;
  }
  return attempted;
};

describe('the runs this was written for', () => {
  it('yields early on genuine, explicit throttling', () => {
    expect(reached(Array(25).fill('API rate limit exceeded'))).toBe(MAX_CONSECUTIVE_RATE_LIMITED);
  });

  it('does NOT let three permanently-forbidden repos starve the queue', () => {
    // The self-starving bug, and the reason a bare 403 was reclassified. Those repos have
    // never synced, so they sort FIRST on every sweep and fail forever. Backing off on
    // them would block every real student behind them, on every run, silently.
    expect(reached(Array(25).fill('GitHub API error: 403'))).toBe(25);
  });

  it('keeps going when failures are unrelated to throttling', () => {
    expect(reached(Array(25).fill('GitHub API error: 404'))).toBe(25);
  });

  it('replays the real second sweep: 3 dead repos, then the students behind them', () => {
    // 8 due: the three ColaberryIntern repos first because they have never synced, then
    // five real students. All eight must be reached.
    expect(reached([...Array(3).fill('GitHub API error: 403'), ...Array(5).fill('')])).toBe(8);
  });

  it('resets the streak on a success, so isolated throttling does not accumulate', () => {
    expect(reached([
      'API rate limit exceeded', '', 'API rate limit exceeded',
      'API rate limit exceeded', '', 'API rate limit exceeded',
    ])).toBe(6);
  });
});
