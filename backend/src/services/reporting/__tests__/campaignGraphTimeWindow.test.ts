/**
 * Regression for the "2,180 Site Visitors from 20 people" defect.
 *
 * Reported from live production on 2026-09-08: `/admin/campaigns` filtered to the
 * last 7 days showed 55 total leads and, in the same picture, 2,180 Site Visitors.
 *
 * Cause: `getCampaignGraphData` filtered `leadPaths` by the time window but counted
 * visitors with a bare `Visitor.count()`. The visitor figure was therefore the
 * all-time total no matter which window was selected, and the Site Visitors node —
 * which adds anonymous visitors to the lead-linked ones — reported it verbatim.
 *
 * The force graph had the same defect. It only became visible when a Sankey drew
 * the two numbers side by side, which is a reasonable argument for the chart.
 *
 * Models are mocked: CI runs with no DATABASE_URL, and this is a test about a rule,
 * not about the database.
 */

jest.mock('sequelize', () => {
  const actual = jest.requireActual('sequelize');
  return actual;
});

import { Op } from 'sequelize';
import { filterPathsByCampaign, getTimeWindowCutoff, parseGraphScope, visitorCountOptions, type LeadPathRecord } from '../campaignGraphService';

describe('getTimeWindowCutoff', () => {
  it('resolves every window the UI is allowed to offer', () => {
    for (const w of ['24h', '3d', '7d', '30d']) {
      expect(getTimeWindowCutoff(w)).toBeInstanceOf(Date);
    }
  });

  it('returns null for all-time and for anything it does not implement', () => {
    expect(getTimeWindowCutoff('all')).toBeNull();
    // The reason the selector must never offer '90d': it silently means all time.
    expect(getTimeWindowCutoff('90d')).toBeNull();
    expect(getTimeWindowCutoff('')).toBeNull();
  });

  it('places the cutoff in the past, by the requested distance', () => {
    const now = Date.now();
    const sevenDays = getTimeWindowCutoff('7d')!;
    const oneDay = getTimeWindowCutoff('24h')!;
    expect(sevenDays.getTime()).toBeLessThan(now);
    expect(sevenDays.getTime()).toBeLessThan(oneDay.getTime());
    // ~7 days, allowing a second of clock drift during the test.
    expect(now - sevenDays.getTime()).toBeGreaterThan(7 * 24 * 3600_000 - 1000);
    expect(now - sevenDays.getTime()).toBeLessThan(7 * 24 * 3600_000 + 1000);
  });
});

describe('visitorCountOptions — visitors must honour the same window as leads', () => {
  it('counts every visitor when no window is applied', () => {
    expect(visitorCountOptions(null)).toBeUndefined();
  });

  it('scopes the count to the window when one is applied', () => {
    const cutoff = new Date('2026-09-01T00:00:00Z');
    const opts = visitorCountOptions(cutoff)!;
    expect(opts).toBeDefined();
    expect(opts.where.first_seen_at[Op.gte]).toBe(cutoff);
  });

  it('filters on first_seen_at, the column that says when a visitor arrived', () => {
    const opts = visitorCountOptions(new Date())!;
    expect(Object.keys(opts.where)).toEqual(['first_seen_at']);
  });

  it('produces a scoped count for every window the UI offers', () => {
    for (const w of ['24h', '3d', '7d', '30d']) {
      const cutoff = getTimeWindowCutoff(w);
      expect(visitorCountOptions(cutoff)).toBeDefined();
    }
    // ...and an unscoped one only for all-time.
    expect(visitorCountOptions(getTimeWindowCutoff('all'))).toBeUndefined();
  });
});

describe('filterPathsByCampaign - the Campaign 360 Journey cohort', () => {
  const lead = (id: number, campaigns: string[]) => ({
    lead_id: id, campaign_enrollments: campaigns.map((c) => ({ campaign_id: c, campaign_name: c, enrolled_at: new Date() })),
  } as unknown as LeadPathRecord);

  it('keeps a lead enrolled in the campaign, whole path intact, and drops the rest', () => {
    const paths = [lead(1, ['c1']), lead(2, ['c2']), lead(3, ['c1', 'c2']), lead(4, [])];
    expect(filterPathsByCampaign(paths, 'c1').map((l) => l.lead_id)).toEqual([1, 3]);
    expect(filterPathsByCampaign(paths, 'c9')).toEqual([]);
  });

  it('does not mutate the input', () => {
    const paths = [lead(1, ['c1'])];
    filterPathsByCampaign(paths, 'c1');
    expect(paths).toHaveLength(1);
  });
});

describe('parseGraphScope - the graph route query, including the 400', () => {
  const UUID = 'c0000000-0000-4000-8000-000000000001';

  it('absent and empty both mean no filter; values are trimmed', () => {
    expect(parseGraphScope({})).toEqual({ ok: true, timeWindow: undefined, brandId: undefined, campaignId: undefined });
    expect(parseGraphScope({ timeWindow: ' 30d ', brandId: '', campaignId: `  ${UUID} ` })).toEqual({ ok: true, timeWindow: '30d', brandId: undefined, campaignId: UUID });
  });

  it('a malformed campaign id is refused rather than rendering an empty journey', () => {
    expect(parseGraphScope({ campaignId: 'not-a-uuid' })).toEqual({ ok: false, error: 'campaignId must be a UUID' });
    expect(parseGraphScope({ campaignId: ['a', 'b'] })).toEqual({ ok: true, timeWindow: undefined, brandId: undefined, campaignId: undefined });
  });
});
