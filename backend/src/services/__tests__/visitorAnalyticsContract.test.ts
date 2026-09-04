/**
 * The admin Visitors dashboard read 0 for everything while the tables held
 * 40,788 sessions and 407,369 page events, for six months, in silence.
 *
 * Nothing was broken in the tracker and nothing threw. The page declares its
 * stats in camelCase (`todayVisitors`, `liveCount`, `visitors30d`) and this
 * service only ever returned snake_case (`visitors_today`, `total_visitors`,
 * and no live count at all), so every card read `undefined ?? 0` and rendered a
 * confident zero. The live endpoint had the mirror-image defect: it returned a
 * bare array while the page read `res.data.visitors`, so the table showed
 * "No visitors currently on the site" no matter how many there were.
 *
 * Neither defect is catchable by TypeScript — the payload crosses the wire as
 * `any`, and `?? 0` turns a missing field into a plausible number. Only an
 * assertion on the KEYS can catch it, which is what this file is. Every key
 * asserted here is one a rendered card actually reads; if you rename one in the
 * service, this fails instead of the dashboard quietly flatlining again.
 */

const count = jest.fn();
const sum = jest.fn();
const findOne = jest.fn();
const findAll = jest.fn();
const query = jest.fn();

jest.mock('../../models', () => ({
  Visitor: {},
  VisitorSession: {
    count: (...a: unknown[]) => count(...a),
    sum: (...a: unknown[]) => sum(...a),
    findOne: (...a: unknown[]) => findOne(...a),
    findAll: (...a: unknown[]) => findAll(...a),
  },
  PageEvent: {},
  Lead: {},
  IntentScore: {},
  Campaign: {},
}));

jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a) },
}));

import { getVisitorStats, getLiveVisitors, countLiveVisitors } from '../visitorAnalyticsService';

/** Exactly the fields AdminVisitorsPage renders into a StatCard. */
const CARD_FIELDS = [
  'liveCount',
  'todayVisitors',
  'todaySessions',
  'visitors30d',
  'sessions30d',
  'avgDuration',
  'bounceRate',
] as const;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getVisitorStats — the dashboard contract', () => {
  /**
   * Promise.all evaluates its array in source order, so the call sequence is
   * fixed: count, count, sum, findOne, findOne, count, count, query.
   */
  function primeStats(): void {
    count
      .mockResolvedValueOnce(961) // distinct visitors, 30d
      .mockResolvedValueOnce(40788) // sessions, 30d
      .mockResolvedValueOnce(22) // distinct visitors, today
      .mockResolvedValueOnce(40); // sessions, today
    sum.mockResolvedValueOnce(266812);
    findOne
      .mockResolvedValueOnce({ avg_duration: 835.4 })
      .mockResolvedValueOnce({ bounce_count: 38304, total_count: 40788 });
    query.mockResolvedValueOnce([{ count: 4 }]);
  }

  it('returns every field the dashboard cards read, with the right values', async () => {
    primeStats();

    const stats = (await getVisitorStats()) as Record<string, unknown>;

    for (const field of CARD_FIELDS) {
      expect(stats).toHaveProperty(field);
      expect(typeof stats[field]).toBe('number');
    }

    expect(stats.liveCount).toBe(4);
    expect(stats.todayVisitors).toBe(22);
    expect(stats.todaySessions).toBe(40);
    expect(stats.visitors30d).toBe(961);
    expect(stats.sessions30d).toBe(40788);
    expect(stats.avgDuration).toBe(835);
    expect(stats.bounceRate).toBe(93.91);
  });

  /**
   * The regression stated as its symptom rather than its cause: a real database
   * must never produce a dashboard of zeros. `?? 0` is why the original bug was
   * invisible, so assert that no card field falls back.
   */
  it('never reports zero across the board when the tables hold data', async () => {
    primeStats();

    const stats = (await getVisitorStats()) as Record<string, number>;

    expect(CARD_FIELDS.every((f) => stats[f] === 0)).toBe(false);
    expect(stats.visitors30d).toBeGreaterThan(0);
    expect(stats.todayVisitors).toBeGreaterThan(0);
  });

  it('keeps the shipped snake_case keys alongside the camelCase ones', async () => {
    primeStats();

    const stats = (await getVisitorStats()) as Record<string, unknown>;

    expect(stats.visitors_today).toBe(22);
    expect(stats.total_sessions).toBe(40788);
    expect(stats.bounce_rate).toBe(93.91);
  });
});

describe('getLiveVisitors — the live table contract', () => {
  const SESSION = {
    id: 'session-1',
    visitor_id: 'visitor-1',
    exit_page: '/pricing',
    started_at: new Date('2026-09-03T20:28:11Z'),
    duration_seconds: 412,
    pageview_count: 7,
    referrer_domain: 'google.com',
    site_slug: 'enterprise',
    device_type: 'desktop',
    ip_address: '203.0.113.9',
    visitor: {
      fingerprint: 'abcdef1234567890',
      lead: { id: 55, name: 'Dana Whitfield' },
      intentScore: { score: 72, intent_level: 'high' },
    },
  };

  it('exposes the field names the table renders, not just the column names', async () => {
    findAll.mockResolvedValueOnce([SESSION]);

    const [row] = await getLiveVisitors(50);

    // `id` and `fingerprint` — the row key and the anonymous-visitor label.
    // Previously emitted only as visitor_id / visitor_fingerprint, so every row
    // had an undefined React key and clicking one requested
    // /api/admin/visitors/undefined/sessions.
    expect(row.id).toBe('visitor-1');
    expect(row.fingerprint).toBe('abcdef1234567890');
    // The duration cell reads `session_duration`; the column is duration_seconds.
    expect(row.session_duration).toBe(412);
    expect(row.duration_seconds).toBe(412);
    // Which property the visitor is on — eight hostnames share this table.
    expect(row.site_slug).toBe('enterprise');
    expect(row.session_id).toBe('session-1');
    expect(row.current_page).toBe('/pricing');
    expect(row.lead_name).toBe('Dana Whitfield');
    expect(row.is_identified).toBe(true);
    expect(row.intent_score).toBe(72);
  });

  it('survives a session whose visitor never resolved', async () => {
    findAll.mockResolvedValueOnce([{ ...SESSION, visitor: null, site_slug: null }]);

    const [row] = await getLiveVisitors(50);

    expect(row.fingerprint).toBeNull();
    expect(row.lead_name).toBeNull();
    expect(row.is_identified).toBe(false);
    expect(row.site_slug).toBeNull();
  });
});

describe('countLiveVisitors', () => {
  it('counts distinct visitors independently of the table page size', async () => {
    query.mockResolvedValueOnce([{ count: 63 }]);

    // 63 live while the table shows at most 50: the count must not be derived
    // from the list length, or the headline silently caps at the limit.
    await expect(countLiveVisitors()).resolves.toBe(63);
  });

  it('returns 0 rather than NaN when the query yields no row', async () => {
    query.mockResolvedValueOnce([]);

    await expect(countLiveVisitors()).resolves.toBe(0);
  });
});
