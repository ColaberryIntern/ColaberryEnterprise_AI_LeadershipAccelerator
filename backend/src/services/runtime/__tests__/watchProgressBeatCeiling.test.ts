/**
 * The wall-clock beat ceiling (2026-11-18).
 *
 * A student finished a 59:48 video and the gate credited him 55%. The flat 45s
 * per-beat clamp was half of why: a backgrounded tab is throttled to roughly
 * one sample a minute, so every recovered minute of real playback was shaved
 * to 45 seconds. These tests pin the rule that replaced it — a beat may claim
 * as much as the clock says has passed, and no more.
 */
import {
  accumulateWatch,
  beatCeilingS,
  MAX_DELTA_PER_BEAT_S,
  MAX_BEAT_CEILING_S,
  MAX_PLAYBACK_RATE,
  WatchState,
} from '../watchProgressMath';

const at = (s: number) => new Date(Date.UTC(2026, 10, 18, 0, 0, s)).toISOString();

describe('beatCeilingS', () => {
  it('falls back to the flat floor when there is no previous beat', () => {
    expect(beatCeilingS(undefined, Date.parse(at(10)))).toBe(MAX_DELTA_PER_BEAT_S);
    expect(beatCeilingS('not a date', Date.parse(at(10)))).toBe(MAX_DELTA_PER_BEAT_S);
  });

  it('never drops below the old flat ceiling for rapid beats', () => {
    expect(beatCeilingS(at(0), Date.parse(at(1)))).toBe(MAX_DELTA_PER_BEAT_S);
    expect(beatCeilingS(at(0), Date.parse(at(10)))).toBe(MAX_DELTA_PER_BEAT_S);
  });

  it('rises with the clock, so a throttled gap is creditable in full', () => {
    expect(beatCeilingS(at(0), Date.parse(at(60)))).toBe(60 * MAX_PLAYBACK_RATE);
    expect(beatCeilingS(at(0), Date.parse(at(60)))).toBeGreaterThan(60);
  });

  it('is bounded however long the client was away (forged-beat blast radius)', () => {
    expect(beatCeilingS(at(0), Date.parse(at(86400)))).toBe(MAX_BEAT_CEILING_S);
  });

  it('ignores a clock that runs backwards', () => {
    expect(beatCeilingS(at(100), Date.parse(at(10)))).toBe(MAX_DELTA_PER_BEAT_S);
  });
});

describe('accumulateWatch with the wall-clock ceiling', () => {
  const prevAt = (lastBeat: string, watched: number): WatchState => ({
    watched_s: watched, max_position_s: watched, duration_s: 3588, watched_pct: 0, provider: 'youtube', last_beat_at: lastBeat,
  });

  it('REGRESSION: a throttled background minute is credited in full, not shaved to 45s', () => {
    const prev = prevAt(at(0), 600);
    const next = accumulateWatch(prev, { delta_s: 60, position_s: 660, duration_s: 3588 }, at(60));
    expect(next.watched_s).toBe(660);          // 600 + the whole 60, not 600 + 45
  });

  it('still clamps a beat that claims more time than has passed', () => {
    const prev = prevAt(at(0), 600);
    const next = accumulateWatch(prev, { delta_s: 9999, position_s: 3588, duration_s: 3588 }, at(60));
    expect(next.watched_s).toBe(600 + 60 * MAX_PLAYBACK_RATE);
  });

  it('a scrub to the end still earns almost nothing', () => {
    // The player reports the jump honestly as ~0 played seconds; the ceiling is
    // the backstop if it ever reported the jump itself.
    const prev = prevAt(at(0), 10);
    const next = accumulateWatch(prev, { delta_s: 0.2, position_s: 3588, duration_s: 3588 }, at(1));
    expect(next.watched_s).toBe(10.2);
    expect(next.max_position_s).toBe(3588);    // position still ratchets
    expect(next.watched_pct).toBe(0);          // but the points stay locked
  });

  it('the first beat of a session is unchanged from before the fix', () => {
    const next = accumulateWatch(null, { delta_s: 9999, position_s: 9999, duration_s: 100 }, at(0));
    expect(next.watched_s).toBe(MAX_DELTA_PER_BEAT_S);
  });

  it("an hour-long video watched through now reaches the bar", () => {
    // 59:48, sampled once a minute by a throttled tab — the shape of the
    // reported bug. Before the fix this topped out around 55%.
    let s: WatchState | null = null;
    for (let i = 0; i < 60; i += 1) {
      s = accumulateWatch(s, { delta_s: 60, position_s: (i + 1) * 60, duration_s: 3588, provider: 'youtube' }, at(i * 60));
    }
    expect(s!.watched_pct).toBeGreaterThanOrEqual(75);
  });
});
