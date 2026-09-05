/**
 * The KPI frame's arithmetic, which is where a dashboard lies most convincingly.
 *
 * The load-bearing property is that **rates are per VISITOR, not per session**.
 * Production runs ~4.5 sessions per person, so a conversion rate computed against
 * sessions reports 0.5% where the truth is 2.3% — the funnel understated by
 * exactly the repeat-visit factor, in the direction that makes the business look
 * worse than it is. Nothing on screen would reveal it.
 */

const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import { getVisitorKpis } from '../visitorKpiService';

/** Headline, by_site, by_source — in the order the service issues them. */
function prime(headline: any, bySite: any[] = [], bySource: any[] = []) {
  query
    .mockResolvedValueOnce([headline])
    .mockResolvedValueOnce(bySite)
    .mockResolvedValueOnce(bySource);
}

const HEADLINE = {
  unique_visitors: 994,
  unique_visitors_7d: 725,
  sessions: 4484,
  new_visitors: 924,
  returning_visitors: 70,
  converted_visitors: 23,
  bounce_sessions: 2603,
};

beforeEach(() => jest.clearAllMocks());

describe('rates are computed per visitor, not per session', () => {
  it('divides conversions by PEOPLE', async () => {
    prime(HEADLINE);

    const k = await getVisitorKpis(30);

    // 23 / 994 = 2.31%. Against 4,484 sessions it would read 0.51%.
    expect(k.conversion_rate).toBe(2.31);
    expect(k.conversion_rate).not.toBeCloseTo((23 / 4484) * 100, 2);
  });

  it('reports visits per person, which is what makes the distinction visible', async () => {
    prime(HEADLINE);

    const k = await getVisitorKpis(30);

    expect(k.sessions_per_visitor).toBe(4.5);
    expect(k.unique_visitors).toBe(994);
    expect(k.sessions).toBe(4484);
  });

  it('computes the new-visitor rate against unique visitors', async () => {
    prime(HEADLINE);

    const k = await getVisitorKpis(30);

    expect(k.new_visitor_rate).toBe(92.96); // 924 / 994
    expect(k.new_visitors + k.returning_visitors).toBe(k.unique_visitors);
  });

  it('keeps bounce rate per session, because a bounce IS a session', async () => {
    prime(HEADLINE);

    const k = await getVisitorKpis(30);

    expect(k.bounce_rate).toBe(58.05); // 2603 / 4484
  });
});

describe('division by zero', () => {
  it('reports zeros rather than NaN on an empty window', async () => {
    prime({
      unique_visitors: 0,
      unique_visitors_7d: 0,
      sessions: 0,
      new_visitors: 0,
      returning_visitors: 0,
      converted_visitors: 0,
      bounce_sessions: 0,
    });

    const k = await getVisitorKpis(30);

    // NaN renders as "NaN%" on a dashboard, which is worse than 0 because it
    // looks like a crash rather than an empty period.
    for (const v of [k.conversion_rate, k.new_visitor_rate, k.bounce_rate, k.sessions_per_visitor]) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBe(0);
    }
  });

  it('survives a missing headline row', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const k = await getVisitorKpis(30);

    expect(k.unique_visitors).toBe(0);
    expect(k.conversion_rate).toBe(0);
  });
});

describe('channel breakdown', () => {
  const SITES = [
    { channel: 'ai-flotation', unique_visitors: 430, sessions: 451, converted: 1 },
    { channel: 'enterprise', unique_visitors: 52, sessions: 124, converted: 12 },
  ];

  it('computes a conversion rate per channel, per visitor', async () => {
    prime(HEADLINE, SITES);

    const k = await getVisitorKpis(30);

    const flotation = k.by_site.find((c) => c.channel === 'ai-flotation')!;
    const enterprise = k.by_site.find((c) => c.channel === 'enterprise')!;
    expect(flotation.conversion_rate).toBe(0.23);
    expect(enterprise.conversion_rate).toBe(23.08);
    // The finding this table exists to surface: the property with the MOST
    // traffic converts two orders of magnitude worse than the smallest one.
    expect(flotation.unique_visitors).toBeGreaterThan(enterprise.unique_visitors);
    expect(enterprise.conversion_rate).toBeGreaterThan(flotation.conversion_rate * 50);
  });

  /**
   * Referrer capture shipped 2026-09-04 and cannot be backfilled. Reporting the
   * gap as "100% Direct" would be a statement about the audience; reporting it as
   * pending is a statement about the data. They lead to opposite decisions.
   */
  it('flags source attribution as pending when no source rows exist', async () => {
    prime(HEADLINE, SITES, []);

    const k = await getVisitorKpis(30);

    expect(k.source_attribution_pending).toBe(true);
    expect(k.by_source).toEqual([]);
  });

  it('clears the pending flag once sources arrive', async () => {
    prime(HEADLINE, SITES, [{ channel: 'google.com', unique_visitors: 10, sessions: 12, converted: 2 }]);

    const k = await getVisitorKpis(30);

    expect(k.source_attribution_pending).toBe(false);
    expect(k.by_source[0].conversion_rate).toBe(20);
  });
});

describe('bot exclusion', () => {
  it('filters crawlers by default and drops the filter on request', async () => {
    prime(HEADLINE);
    await getVisitorKpis(30);
    expect(String(query.mock.calls[0][0])).toContain('ILIKE');

    jest.clearAllMocks();
    prime(HEADLINE);
    await getVisitorKpis(30, true);
    expect(String(query.mock.calls[0][0])).not.toContain('ILIKE');
  });
});

/**
 * Engagement depth, and the carve-out that makes it safe to report.
 *
 * The rule was tested against the only ground truth available — visitors who
 * became leads — and without the carve-out it caught one of them. A visitor who
 * converted is definitionally a person, so conversion always wins over timings.
 * Verified against production after the carve-out: 0 converted visitors excluded.
 */
describe('engaged vs shallow visitors', () => {
  it('separates a hit from a read without discarding either', async () => {
    prime({ ...HEADLINE, engaged_visitors: 337 });

    const k = await getVisitorKpis(30);

    expect(k.engaged_visitors).toBe(337);
    // Nothing is hidden: the two always reconcile to the headline count.
    expect(k.engaged_visitors + k.shallow_visitors).toBe(k.unique_visitors);
  });

  it('reports conversion against the engaged denominator as well as the raw one', async () => {
    prime({ ...HEADLINE, engaged_visitors: 337 });

    const k = await getVisitorKpis(30);

    // 23/337 = 6.82% describes the site; 23/994 = 2.31% describes the traffic.
    expect(k.engaged_conversion_rate).toBe(6.82);
    expect(k.conversion_rate).toBe(2.31);
    expect(k.engaged_conversion_rate).toBeGreaterThan(k.conversion_rate);
  });

  it('never reports negative shallow visitors if the counts disagree', async () => {
    // Defensive: engaged can never exceed unique, but if a query change ever made
    // it so, a negative "hit and left" figure on the dashboard would be nonsense.
    prime({ ...HEADLINE, engaged_visitors: 2000 });

    const k = await getVisitorKpis(30);

    expect(k.shallow_visitors).toBe(0);
  });

  it('the engaged predicate always admits anyone with a lead', async () => {
    prime({ ...HEADLINE, engaged_visitors: 337 });

    await getVisitorKpis(30);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('lead_id" IS NOT NULL OR');
  });
});

/**
 * Engagement must not depend on a timer that may not be running.
 *
 * `ai-flotation` emits zero heartbeat events, so `duration_seconds` never
 * accumulates there and every session reads as ~5 seconds regardless of real
 * dwell. A dwell-only rule wrote off 75 people — on the property that produced
 * 25 form submissions in a week.
 */
describe('engagement counts deliberate actions, not just dwell', () => {
  it('admits a visitor on interaction even with no dwell and one page', async () => {
    prime({ ...HEADLINE, engaged_visitors: 413 });

    await getVisitorKpis(30);

    const sql = String(query.mock.calls[0][0]);
    // The action events, not merely the duration test.
    expect(sql).toContain("'form_submit'");
    expect(sql).toContain("'cta_click'");
    expect(sql).toContain('page_events');
  });

  it('still admits on dwell alone, so heartbeat-instrumented sites are unaffected', async () => {
    prime({ ...HEADLINE, engaged_visitors: 413 });

    await getVisitorKpis(30);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('duration_seconds');
    expect(sql).toContain('pageview_count');
  });

  it('and conversion still always wins over both', async () => {
    prime({ ...HEADLINE, engaged_visitors: 413 });

    await getVisitorKpis(30);

    expect(String(query.mock.calls[0][0])).toContain('lead_id" IS NOT NULL OR');
  });
});
