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

import {
  getVisitorStats,
  getLiveVisitors,
  countLiveVisitors,
  getTopPages,
  getTrafficSources,
} from '../visitorAnalyticsService';

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

/**
 * `getTopPages` threw on every call it has ever received.
 *
 * The window was written `INTERVAL ':days days'` — the placeholder inside a
 * string literal, where Sequelize deliberately does not substitute — so Postgres
 * was handed the characters ":days days" and answered
 * `invalid input syntax for type interval`. Confirmed against the production
 * database before fixing, not inferred from reading it.
 *
 * The failure mode is why it survived: /api/admin/visitor-analytics/pages 500s,
 * the page's `.catch(() => null)` swallows it, and the Top Pages panel renders
 * "no data". A broken query and an empty result are indistinguishable on screen.
 */
describe('getTopPages — the interval bug', () => {
  function sqlOf(call: number): string {
    return String(query.mock.calls[call][0]);
  }
  function optsOf(call: number): any {
    return query.mock.calls[call][1];
  }

  it('never embeds a placeholder inside a quoted interval literal', async () => {
    query.mockResolvedValueOnce([]);

    await getTopPages(30, 20);

    expect(sqlOf(0)).not.toContain("INTERVAL ':days");
    // No INTERVAL literal may contain a placeholder at all — that is the whole
    // defect class, stated directly rather than via a quote-counting regex that
    // would also trip over the bot patterns' own quoted strings.
    expect(sqlOf(0)).not.toMatch(/INTERVAL\s*'[^']*:/i);
  });

  it('passes the window as a real timestamp, so the driver binds it', async () => {
    query.mockResolvedValueOnce([]);

    await getTopPages(7, 20);

    const { since, limit } = optsOf(0).replacements;
    expect(since).toBeInstanceOf(Date);
    expect(limit).toBe(20);
    // 7 days back, within a second of now.
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(since.getTime() - expected)).toBeLessThan(1000);
  });

  it('excludes bots by default and joins visitors to do it', async () => {
    query.mockResolvedValueOnce([]);

    await getTopPages(30, 20);

    expect(sqlOf(0)).toContain('JOIN visitors v ON v.id = pe.visitor_id');
    expect(sqlOf(0)).toContain('ILIKE');
  });

  it('drops the join entirely when bots are requested', async () => {
    query.mockResolvedValueOnce([]);

    await getTopPages(30, 20, true);

    expect(sqlOf(0)).not.toContain('JOIN visitors');
    expect(sqlOf(0)).not.toContain('ILIKE');
  });
});

describe('getTrafficSources — bot filtering', () => {
  it('filters bots by default', async () => {
    findAll.mockResolvedValueOnce([]);

    await getTrafficSources();

    // `Op.and` is a Symbol key, which JSON.stringify silently drops — so the
    // filter has to be read off the symbol, not off a serialised copy.
    const where = findAll.mock.calls[0][0].where;
    const symbols = Object.getOwnPropertySymbols(where);
    expect(symbols).toHaveLength(1);
    expect(String((where as any)[symbols[0]][0].val)).toContain('ILIKE');
  });

  it('does not filter when bots are requested', async () => {
    findAll.mockResolvedValueOnce([]);

    await getTrafficSources(undefined, true);

    const where = findAll.mock.calls[0][0].where;
    expect(Object.getOwnPropertySymbols(where)).toHaveLength(0);
  });
});
