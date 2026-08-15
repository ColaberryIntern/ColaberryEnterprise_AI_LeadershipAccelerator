/**
 * The header must never state a points total or a level it has not been told.
 *
 * MEASURED 2026-08-15, ali@colaberry.com: the topbar showed "Apprentice · 0 pts"
 * for ~2 seconds on every page load before settling to the correct "AI Enabled I
 * · 463 pts". The cause was `points?.total ?? 0` feeding `levelFor(0)`, which
 * returns the first level — so an unresolved fetch rendered as a confident claim
 * that the student had nothing and was a beginner.
 *
 * These tests exist to make that specific regression impossible to reintroduce
 * quietly. The two that matter most are the pending and failed cases: in both,
 * NO number and NO level name may appear.
 */
import { hudView } from '../pointsHud';
import type { PointsSummary } from '../../../../services/onboardingApi';

const summary = (over: Partial<PointsSummary> = {}): PointsSummary =>
  ({ total: 463, events: [], ...over });

describe('while the total is unknown', () => {
  // null is what the widget holds BOTH before the first response and after a
  // failed one. The distinction does not exist for a reader, and must not exist
  // here either: neither may fall back to zero.
  const pending = () => hudView(null, 0);

  it('reports itself as not known', () => {
    expect(pending().known).toBe(false);
  });

  it('renders NO level name — not "Apprentice", not any default', () => {
    expect(pending().levelName).toBeNull();
  });

  it('renders NO points number — not "0 pts"', () => {
    expect(pending().totalText).toBeNull();
  });

  it('renders no "next level" line', () => {
    expect(pending().nextLine).toBeNull();
  });

  it('leaves the progress bar empty rather than implying early progress', () => {
    expect(pending().pct).toBe(0);
  });

  it('does not announce a level or a total to screen readers', () => {
    const label = pending().ariaLabel;
    expect(label).not.toMatch(/\d/);
    expect(label).not.toMatch(/Apprentice/i);
    expect(label.toLowerCase()).toContain('loading');
  });

  it('ignores a stale count-up value rather than rendering it as fact', () => {
    // displayTotal is animation state; it must never author the number shown
    // before the server has supplied one.
    expect(hudView(null, 463).totalText).toBeNull();
  });

  it('is identical whether the fetch is pending or has failed', () => {
    // Both arrive as null. If these ever diverge, one of them is inventing a
    // fallback, which is the whole defect.
    expect(hudView(null, 0)).toEqual(hudView(null, 999));
  });
});

describe('once the server has answered', () => {
  it('states the level and the total', () => {
    const v = hudView(summary(), 463);
    expect(v.known).toBe(true);
    expect(v.levelName).toBeTruthy();
    expect(v.totalText).toBe('463 pts');
  });

  it('renders a genuine zero as zero — a student really on 0 is not "unknown"', () => {
    const v = hudView(summary({ total: 0 }), 0);
    expect(v.known).toBe(true);
    expect(v.totalText).toBe('0 pts');
    expect(v.levelName).toBeTruthy();   // the first level is CORRECT here
  });

  it('follows the count-up value while it animates', () => {
    expect(hudView(summary(), 120).totalText).toBe('120 pts');
  });

  it('formats large totals with separators', () => {
    expect(hudView(summary({ total: 12345 }), 12345).totalText).toBe('12,345 pts');
  });

  it('announces the real total and level', () => {
    const label = hudView(summary(), 463).ariaLabel;
    expect(label).toContain('463 points');
    expect(label).toContain('level');
  });

  it('uses the band rung as the identity when the 5-band UI is on', () => {
    const v = hudView(summary({
      fiveBandUiEnabled: true,
      band: { rungName: 'AI Enabled I' } as PointsSummary['band'],
    }), 463);
    expect(v.levelName).toBe('AI Enabled I');
  });

  it('ignores the band when the flag is off, keeping the legacy identity', () => {
    const withBand = hudView(summary({
      fiveBandUiEnabled: false,
      band: { rungName: 'AI Enabled I' } as PointsSummary['band'],
    }), 463);
    const withoutBand = hudView(summary(), 463);
    expect(withBand.levelName).toBe(withoutBand.levelName);
    expect(withBand.levelName).not.toBe('AI Enabled I');
  });

  it('gives the bar a real fill', () => {
    expect(hudView(summary(), 463).pct).toBeGreaterThan(0);
  });
});
