/**
 * feedTypeAdjustmentPreviewService — the "more/less" slider's anticipated-
 * impact preview (session CC-20260802-r4q9, Feed Control Type Analytics
 * build). Two layers tested separately: `computeProjection` is a PURE
 * function (no I/O, no mocks needed — same testing philosophy as
 * feedRanker.test.ts's `scoreCandidate`); `previewTypeAdjustment` is the
 * thin async wrapper, tested by mocking `feedTypeStatsService` wholesale.
 */
import { computeProjection, STEP_FACTOR, MIN_STEP, MAX_STEP } from '../feedTypeAdjustmentPreviewService';

describe('computeProjection — pure calculation core', () => {
  const BASELINE = { cadence: 3, frequencyCap: 5, cooldownDays: 4, observedPerDay30d: 2, poolTotal: 50 };

  it('step 0 is a no-op: proposed knobs and rate match baseline exactly', () => {
    const { proposed, projectedChangePct } = computeProjection(BASELINE, 0);
    expect(proposed.cadence).toBe(3);
    expect(proposed.frequencyCap).toBe(5);
    expect(proposed.cooldownDays).toBe(4);
    expect(proposed.projectedPerDay30d).toBeCloseTo(2, 5);
    expect(projectedChangePct).toBe(0);
  });

  it('a positive step ("more") shrinks cadence, raises freq cap, shortens cooldown, and raises the projected rate', () => {
    const { proposed, projectedChangePct } = computeProjection(BASELINE, 1);
    expect(proposed.cadence).toBeLessThan(BASELINE.cadence);
    expect(proposed.frequencyCap).toBeGreaterThan(BASELINE.frequencyCap);
    expect(proposed.cooldownDays).toBeLessThan(BASELINE.cooldownDays);
    expect(proposed.projectedPerDay30d).toBeGreaterThan(BASELINE.observedPerDay30d);
    expect(projectedChangePct).toBeGreaterThan(0);
    expect(projectedChangePct).toBeCloseTo(Math.round((STEP_FACTOR - 1) * 100), 0);
  });

  it('a negative step ("less") grows cadence, lowers freq cap, lengthens cooldown, and lowers the projected rate', () => {
    const { proposed, projectedChangePct } = computeProjection(BASELINE, -1);
    expect(proposed.cadence).toBeGreaterThan(BASELINE.cadence);
    expect(proposed.frequencyCap).toBeLessThan(BASELINE.frequencyCap);
    expect(proposed.cooldownDays).toBeGreaterThan(BASELINE.cooldownDays);
    expect(proposed.projectedPerDay30d).toBeLessThan(BASELINE.observedPerDay30d);
    expect(projectedChangePct).toBeLessThan(0);
  });

  it('clamps out-of-range steps to MIN_STEP/MAX_STEP rather than extrapolating unbounded', () => {
    const farOut = computeProjection(BASELINE, 99);
    const atMax = computeProjection(BASELINE, MAX_STEP);
    expect(farOut.proposed).toEqual(atMax.proposed);

    const farNeg = computeProjection(BASELINE, -99);
    const atMin = computeProjection(BASELINE, MIN_STEP);
    expect(farNeg.proposed).toEqual(atMin.proposed);
  });

  it('never projects a rate above the pool ceiling', () => {
    const tinyPool = { ...BASELINE, poolTotal: 3, observedPerDay30d: 2.5 };
    const { proposed } = computeProjection(tinyPool, MAX_STEP);
    expect(proposed.projectedPerDay30d).toBeLessThanOrEqual(3);
  });

  it('never proposes a negative cadence, cap, or cooldown', () => {
    const { proposed } = computeProjection(BASELINE, MIN_STEP);
    expect(proposed.cadence).toBeGreaterThanOrEqual(1);
    expect(proposed.frequencyCap).toBeGreaterThanOrEqual(0);
    expect(proposed.cooldownDays).toBeGreaterThanOrEqual(0);
  });

  it('an unlimited freq cap (0) stays 0 on a "more" step but gets a real derived cap on a "less" step', () => {
    const unlimited = { ...BASELINE, frequencyCap: 0 };
    const more = computeProjection(unlimited, 1);
    const less = computeProjection(unlimited, -1);
    expect(more.proposed.frequencyCap).toBe(0);
    expect(less.proposed.frequencyCap).toBeGreaterThan(0);
  });
});

jest.mock('../feedTypeStatsService', () => ({
  getTypeStats: jest.fn(),
  getLaneBreakdown30d: jest.fn(),
  getFeedPolicy: jest.fn(),
}));

import { previewTypeAdjustment } from '../feedTypeAdjustmentPreviewService';
import { getTypeStats, getLaneBreakdown30d, getFeedPolicy } from '../feedTypeStatsService';

const mockGetTypeStats = getTypeStats as unknown as jest.Mock;
const mockGetLaneBreakdown = getLaneBreakdown30d as unknown as jest.Mock;
const mockGetFeedPolicy = getFeedPolicy as unknown as jest.Mock;

const POLICY = { todayCadence: 2, ambientProviders: ['blog'], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 };
const ANCHORED_STATS = {
  slug: 'implementation_task', label: 'Implementation Task', student_label: 'Build a thing',
  home_surface: 'project', feed_mode: 'anchored' as const,
  pool: { total: 30, publishedNow: 25, source: 'timeline_cards (status=active)' },
  creation: { last7d: 1, last30d: 4, mostRecentAt: null },
  triggered: { allTime: 200, last7d: 14, last30d: 60 },
  breadth: { distinctEnrollments: 20 },
  velocity: { perDay7d: 2, perDay30d: 2, trend: 'flat' as const },
  routing: { cadence: null, frequencyCap: null, cooldownDays: null, todayEligible: true },
  lane: { totalImpressions30d: 100, typeShare30d: 0.6, equalShareBaseline: 0.5 },
  diagnostics: [],
  generatedAt: '2026-08-09T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFeedPolicy.mockResolvedValue(POLICY);
  mockGetTypeStats.mockResolvedValue(ANCHORED_STATS);
  mockGetLaneBreakdown.mockResolvedValue([
    { slug: 'build_story', label: 'Build Story', impressions30d: 40, share30d: 0.4 },
  ]);
});

describe('previewTypeAdjustment — anchored type', () => {
  it('falls back to the global policy defaults when no type-level routing is stored, and discloses the inert-knob caveat', async () => {
    const preview = await previewTypeAdjustment('implementation_task', 1);

    expect(preview.baseline.cadence).toBe(POLICY.todayCadence);
    expect(preview.baseline.frequencyCap).toBe(POLICY.defaultFrequencyCap);
    expect(preview.baseline.cooldownDays).toBe(POLICY.defaultCooldownDays);
    expect(preview.caveats.some((c) => /not currently consumed by the live ranker/i.test(c))).toBe(true);
  });

  it('projects a displaced type using its REAL current 30-day lane share, not an assumed equal split', async () => {
    const preview = await previewTypeAdjustment('implementation_task', 1);

    expect(preview.displaced).toHaveLength(1);
    expect(preview.displaced[0]).toMatchObject({ slug: 'build_story', currentShare30d: 0.4 });
    // A "more" step raises this type's rate, so the one sibling in its lane
    // should be projected to lose share (negative delta).
    expect(preview.displaced[0].deltaPct).toBeLessThan(0);
  });

  it('propagates a 404 for an unknown slug rather than swallowing it', async () => {
    mockGetTypeStats.mockRejectedValue(Object.assign(new Error('unknown type nope'), { status: 404 }));
    await expect(previewTypeAdjustment('nope', 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('previewTypeAdjustment — ambient type', () => {
  it('discloses the shared-rotation caveat instead of the inert-knob caveat', async () => {
    mockGetTypeStats.mockResolvedValue({ ...ANCHORED_STATS, slug: 'blog', feed_mode: 'ambient', home_surface: 'today' });
    mockGetLaneBreakdown.mockResolvedValue([]);

    const preview = await previewTypeAdjustment('blog', -1);

    expect(preview.caveats.some((c) => /shared ambientProviders/i.test(c))).toBe(true);
    expect(preview.caveats.some((c) => /not currently consumed by the live ranker/i.test(c))).toBe(false);
  });
});
