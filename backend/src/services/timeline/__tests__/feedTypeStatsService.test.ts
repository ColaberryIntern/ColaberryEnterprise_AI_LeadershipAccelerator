/**
 * feedTypeStatsService — per-type Feed Control analytics + "why isn't this
 * appearing" diagnostics (session CC-20260802-r4q9, Feed Control Type
 * Analytics build). Follows the SAME mocking pattern as
 * feedControlService.simulate.test.ts: `config/database` is not
 * wholesale-mocked (several sibling modules `Model.init(...)` against the
 * real `sequelize` export at load time) — `sequelize.query` is spied on
 * and routed by matching a distinctive substring of the SQL text instead.
 */
import { sequelize } from '../../../config/database';
const querySpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as any);

jest.mock('../typeRegistry', () => ({
  resolve: jest.fn(),
  allTypes: jest.fn(() => []),
}));
jest.mock('../feedControlService', () => ({ getRoutingMap: jest.fn() }));

import { getTypeStats } from '../feedTypeStatsService';
import { resolve as resolveType, allTypes } from '../typeRegistry';
import { getRoutingMap } from '../feedControlService';

const mockResolve = resolveType as unknown as jest.Mock;
const mockAllTypes = allTypes as unknown as jest.Mock;
const mockGetRoutingMap = getRoutingMap as unknown as jest.Mock;

interface QueryOverrides {
  pool?: any[]; creation?: any[]; impressionsAnchored?: any[]; impressionsAmbient?: any[];
  laneMap?: any[]; intelPending?: any[]; ambientPressure?: any[];
}

/** Routes the spied `sequelize.query` call to the right canned response by
 *  matching a distinctive substring already unique to that query in
 *  feedTypeStatsService.ts — order matters (most specific checks first). */
function mockQueries(o: QueryOverrides) {
  querySpy.mockImplementation(async (sql: any) => {
    const s = String(sql);
    if (s.includes('most_recent')) return o.creation ?? [{ last7: 0, last30: 0, most_recent: null }];
    if (s.includes('published_now')) return o.pool ?? [{ total: 0, published_now: 0 }];
    if (s.includes('FROM blog_posts') || s.includes('FROM podcasts') || s.includes('FROM network_videos')) return o.pool ?? [{ total: 0 }];
    if (s.includes('COUNT(DISTINCT ref)')) return o.ambientPressure ?? [{ n: 0 }];
    if (s.includes('JOIN timeline_cards') && s.includes('distinct_enrollments')) return o.impressionsAnchored ?? [{ all_time: 0, last7: 0, last30: 0, distinct_enrollments: 0 }];
    if (s.includes('provider = :slug') && s.includes('distinct_enrollments')) return o.impressionsAmbient ?? [{ all_time: 0, last7: 0, last30: 0, distinct_enrollments: 0 }];
    if (s.includes('UNION ALL')) return o.laneMap ?? [];
    if (s.includes('intel_items')) return o.intelPending ?? [{ pending: 0 }];
    return [];
  });
}

const ANCHORED_TYPE_DEF = {
  slug: 'implementation_task', label: 'Implementation Task', student_label: 'Build a thing',
  home_surface: 'project', feed_mode: 'anchored', today_eligible: true, system: false, event: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  querySpy.mockResolvedValue([] as any);
  mockGetRoutingMap.mockResolvedValue({});
  mockAllTypes.mockReturnValue([ANCHORED_TYPE_DEF]);
});

describe('getTypeStats — unknown slug fails loud', () => {
  it('throws a 404-shaped error, never queries the DB', async () => {
    mockResolve.mockReturnValue(undefined);
    await expect(getTypeStats('not_a_real_type')).rejects.toMatchObject({ status: 404 });
  });
});

describe('getTypeStats — healthy anchored type', () => {
  it('reports real pool/creation/triggered/breadth numbers and zero diagnostics when nothing is wrong', async () => {
    mockResolve.mockReturnValue(ANCHORED_TYPE_DEF);
    mockQueries({
      pool: [{ total: 20, published_now: 18 }],
      creation: [{ last7: 2, last30: 6, most_recent: '2026-08-01T00:00:00.000Z' }],
      impressionsAnchored: [{ all_time: 120, last7: 10, last30: 40, distinct_enrollments: 15 }],
      laneMap: [{ slug: 'implementation_task', n: 40 }],
    });

    const stats = await getTypeStats('implementation_task');

    expect(stats.pool).toEqual({ total: 20, publishedNow: 18, source: 'timeline_cards (status=active)' });
    expect(stats.creation).toEqual({ last7d: 2, last30d: 6, mostRecentAt: '2026-08-01T00:00:00.000Z' });
    expect(stats.triggered).toEqual({ allTime: 120, last7d: 10, last30d: 40 });
    expect(stats.breadth).toEqual({ distinctEnrollments: 15 });
    expect(stats.diagnostics).toEqual([]);
  });
});

describe('getTypeStats — routing disabled (checkbox unchecked)', () => {
  it('surfaces a critical ROUTING_DISABLED diagnostic', async () => {
    mockResolve.mockReturnValue({ ...ANCHORED_TYPE_DEF, today_eligible: false });
    mockQueries({
      pool: [{ total: 10, published_now: 10 }],
      impressionsAnchored: [{ all_time: 0, last7: 0, last30: 0, distinct_enrollments: 0 }],
    });

    const stats = await getTypeStats('implementation_task');

    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'ROUTING_DISABLED', severity: 'critical' }));
  });
});

describe('getTypeStats — type-level knobs are set but inert for anchored ranking', () => {
  it('flags TYPE_LEVEL_KNOBS_INERT when a type-level cadence/cap/cooldown override is stored', async () => {
    mockResolve.mockReturnValue(ANCHORED_TYPE_DEF);
    mockGetRoutingMap.mockResolvedValue({ implementation_task: { feed_cadence: 3 } });
    mockQueries({
      pool: [{ total: 10, published_now: 10 }],
      impressionsAnchored: [{ all_time: 50, last7: 5, last30: 20, distinct_enrollments: 8 }],
      laneMap: [{ slug: 'implementation_task', n: 20 }],
    });

    const stats = await getTypeStats('implementation_task');

    expect(stats.routing.cadence).toBe(3);
    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'TYPE_LEVEL_KNOBS_INERT', severity: 'info' }));
  });
});

describe('getTypeStats — pool genuinely exhausted', () => {
  it('reports POOL_EMPTY for a non-intel type with zero pool', async () => {
    mockResolve.mockReturnValue(ANCHORED_TYPE_DEF);
    mockQueries({ pool: [{ total: 0, published_now: 0 }] });

    const stats = await getTypeStats('implementation_task');

    expect(stats.pool.total).toBe(0);
    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'POOL_EMPTY', severity: 'critical' }));
  });

  it('reports INTEL_SOURCE_EXHAUSTED for a static/curated Intelligence Pipeline type with zero pool', async () => {
    mockResolve.mockReturnValue({ ...ANCHORED_TYPE_DEF, slug: 'ai_tool_of_the_day', home_surface: 'today' });
    mockQueries({ pool: [{ total: 0, published_now: 0 }], intelPending: [{ pending: 0 }] });

    const stats = await getTypeStats('ai_tool_of_the_day');

    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'INTEL_SOURCE_EXHAUSTED', severity: 'critical' }));
    expect(stats.diagnostics[0].message).toMatch(/static\/curated/i);
  });
});

describe('getTypeStats — eligible, pooled, but nothing serving (no other explanation)', () => {
  it('falls back to NO_RECENT_ACTIVITY_UNEXPLAINED rather than silently reporting a clean bill of health', async () => {
    mockResolve.mockReturnValue(ANCHORED_TYPE_DEF);
    mockQueries({
      pool: [{ total: 5, published_now: 5 }],
      impressionsAnchored: [{ all_time: 0, last7: 0, last30: 0, distinct_enrollments: 0 }],
    });

    const stats = await getTypeStats('implementation_task');

    expect(stats.triggered.last30d).toBe(0);
    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'NO_RECENT_ACTIVITY_UNEXPLAINED' }));
  });
});

describe('getTypeStats — ambient type (blog) reads the real content pool + provider-keyed impressions', () => {
  it('counts blog_posts for pool and provider=blog impressions for triggered/breadth, and flags rotation pressure', async () => {
    mockResolve.mockReturnValue({
      slug: 'blog', label: 'Blog', student_label: 'Blog post', home_surface: 'today', feed_mode: 'ambient',
      today_eligible: true, system: false, event: false,
    });
    mockAllTypes.mockReturnValue([{ slug: 'blog', label: 'Blog', student_label: 'Blog post', home_surface: 'today', feed_mode: 'ambient', system: false, event: false }]);
    mockQueries({
      pool: [{ total: 10 }],
      creation: [{ last7: 0, last30: 1, most_recent: '2026-07-20T00:00:00.000Z' }],
      impressionsAmbient: [{ all_time: 300, last7: 40, last30: 150, distinct_enrollments: 22 }],
      laneMap: [{ slug: 'blog', n: 150 }],
      ambientPressure: [{ n: 9 }], // 9 of 10 pool items already shown within the cooldown window
    });

    const stats = await getTypeStats('blog');

    expect(stats.pool).toEqual({ total: 10, publishedNow: null, source: 'blog_posts (is_active)' });
    expect(stats.triggered).toEqual({ allTime: 300, last7d: 40, last30d: 150 });
    expect(stats.breadth.distinctEnrollments).toBe(22);
    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIENT_ROTATION_PRESSURE', severity: 'warning' }));
  });
});

describe('getTypeStats — low share of its lane despite being eligible', () => {
  it('flags LOW_LANE_SHARE when this type gets far less than an equal share of real lane traffic', async () => {
    mockResolve.mockReturnValue(ANCHORED_TYPE_DEF);
    mockAllTypes.mockReturnValue([
      ANCHORED_TYPE_DEF,
      { slug: 'build_story', label: 'Build Story', student_label: 'Build Story', home_surface: 'project', feed_mode: 'anchored', system: false, event: false },
    ]);
    mockQueries({
      pool: [{ total: 10, published_now: 10 }],
      impressionsAnchored: [{ all_time: 5, last7: 1, last30: 3, distinct_enrollments: 3 }],
      laneMap: [{ slug: 'implementation_task', n: 3 }, { slug: 'build_story', n: 97 }],
    });

    const stats = await getTypeStats('implementation_task');

    expect(stats.lane.equalShareBaseline).toBeCloseTo(0.5, 3);
    expect(stats.lane.typeShare30d).toBeLessThan(0.15);
    expect(stats.diagnostics).toContainEqual(expect.objectContaining({ code: 'LOW_LANE_SHARE', severity: 'warning' }));
  });
});
