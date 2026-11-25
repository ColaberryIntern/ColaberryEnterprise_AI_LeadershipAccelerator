/**
 * The stored playhead, as the player receives it.
 *
 * Reported by the QA tester 2026-11-24: reopening a part-watched video always
 * started it over, although `max_position_s` had been recorded all along.
 */
import { resumePointOf, NO_RESUME_POINT } from '../watchResumePoint';
import type { WatchState } from '../watchProgressMath';

const state = (over: Partial<WatchState> = {}): WatchState => ({
  watched_s: 600, max_position_s: 1080, duration_s: 1200, watched_pct: 50, ...over,
});

describe('resumePointOf', () => {
  it('reports the furthest second reached, with its duration', () => {
    expect(resumePointOf(state())).toEqual({ position_s: 1080, duration_s: 1200 });
  });

  it('rounds to the second, because a player start point is a second', () => {
    expect(resumePointOf(state({ max_position_s: 1080.6, duration_s: 1199.4 })))
      .toEqual({ position_s: 1081, duration_s: 1199 });
  });

  it('has nothing to offer for a card that was never watched', () => {
    expect(resumePointOf(null)).toEqual(NO_RESUME_POINT);
    expect(resumePointOf(undefined)).toEqual(NO_RESUME_POINT);
    expect(resumePointOf(state({ max_position_s: 0 }))).toEqual({ position_s: null, duration_s: 1200 });
  });

  it('reports the position even when the duration was never measurable', () => {
    // Loom and Wistia never report one. The position is still worth resuming to.
    expect(resumePointOf(state({ duration_s: 0 }))).toEqual({ position_s: 1080, duration_s: null });
  });

  it('clamps a position past the end to the end, rather than trusting it', () => {
    // Reads as "they reached the end", which the client turns into a fresh start.
    expect(resumePointOf(state({ max_position_s: 5000, duration_s: 1200 })))
      .toEqual({ position_s: 1200, duration_s: 1200 });
  });

  it('refuses junk instead of handing the player a nonsense start point', () => {
    expect(resumePointOf(state({ max_position_s: NaN }))).toEqual({ position_s: null, duration_s: 1200 });
    expect(resumePointOf(state({ max_position_s: -5 }))).toEqual({ position_s: null, duration_s: 1200 });
    expect(resumePointOf(state({ max_position_s: Infinity }))).toEqual({ position_s: null, duration_s: 1200 });
    expect(resumePointOf(state({ duration_s: NaN }))).toEqual({ position_s: 1080, duration_s: null });
    expect(resumePointOf({} as WatchState)).toEqual(NO_RESUME_POINT);
  });
});
