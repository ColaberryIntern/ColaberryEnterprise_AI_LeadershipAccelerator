/**
 * repoTreeRateLimit — pacing and back-off for the repo sweep.
 *
 * Written against a real failure. The first production sweep selected 25 connections and
 * every one returned `GitHub API error: 403` in about 28ms, while a single sync run
 * straight afterwards succeeded. The batch cap was never the missing piece: it bounds how
 * many requests a run makes, not how fast it makes them.
 *
 * The test that matters most is the one separating throttling from a broken repo. Treat a
 * 404 as throttling and one student's deleted repository halts everyone else's refresh.
 */
import {
  DEFAULT_DELAY_MS, MAX_CONSECUTIVE_RATE_LIMITED,
  delayBefore, isRateLimited, shouldBackOff,
} from '../repoTreeRateLimit';

describe('isRateLimited', () => {
  it('recognises the exact error the production sweep produced', () => {
    expect(isRateLimited('GitHub API error: 403')).toBe(true);
  });

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

  it('does NOT treat a broken repository as throttling', () => {
    // The distinction the sweep turns on. A 404 on one student's deleted or renamed repo
    // says nothing about the next student, and must not stop the run.
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
    // A file count or repository id containing 403 is not a rate limit.
    expect(isRateLimited('synced 4030 files')).toBe(false);
    expect(isRateLimited('repo id 1403299')).toBe(false);
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
    // A sweep of one connection should cost nothing.
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
    for (const bad of [0, -100, NaN, Infinity, undefined as any]) {
      expect(delayBefore(3, bad)).toBe(bad === undefined ? DEFAULT_DELAY_MS : 0);
    }
  });
});

describe('the run this was written for', () => {
  it('would have stopped after 3 connections instead of burning all 25', () => {
    // Replay: 25 selected, every one 403. With back-off the sweep yields early rather
    // than deepening the block and stamping nothing useful.
    let consecutive = 0;
    let attempted = 0;
    for (let i = 0; i < 25; i += 1) {
      attempted += 1;
      consecutive = isRateLimited('GitHub API error: 403') ? consecutive + 1 : 0;
      if (shouldBackOff(consecutive)) break;
    }
    expect(attempted).toBe(MAX_CONSECUTIVE_RATE_LIMITED);
  });

  it('keeps going when failures are unrelated to throttling', () => {
    // 25 connections where every repo 404s is a bad day, not a blocked client. The sweep
    // should still visit all of them.
    let consecutive = 0;
    let attempted = 0;
    for (let i = 0; i < 25; i += 1) {
      attempted += 1;
      consecutive = isRateLimited('GitHub API error: 404') ? consecutive + 1 : 0;
      if (shouldBackOff(consecutive)) break;
    }
    expect(attempted).toBe(25);
  });

  it('resets the streak on a success, so isolated 403s do not accumulate', () => {
    const outcomes = ['403', 'ok', '403', '403', 'ok', '403'];
    let consecutive = 0;
    let backedOff = false;
    for (const o of outcomes) {
      if (o === 'ok') consecutive = 0;
      else consecutive = isRateLimited('GitHub API error: ' + o) ? consecutive + 1 : 0;
      if (shouldBackOff(consecutive)) { backedOff = true; break; }
    }
    expect(backedOff).toBe(false);
  });
});
