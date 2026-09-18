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
import { filterPathsByCampaign, filterPathsByJourney, getTimeWindowCutoff, parseGraphScope, visitorCountOptions, type LeadPathRecord } from '../campaignGraphService';
import type { LeadJourneyFacts } from '../campaignJourneyDimension';

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
    expect(parseGraphScope({})).toEqual({ ok: true, timeWindow: undefined, brandId: undefined, campaignId: undefined, journey: {} });
    expect(parseGraphScope({ timeWindow: ' 30d ', brandId: '', campaignId: `  ${UUID} ` })).toEqual({ ok: true, timeWindow: '30d', brandId: undefined, campaignId: UUID, journey: {} });
  });

  it('a malformed campaign id is refused rather than rendering an empty journey', () => {
    expect(parseGraphScope({ campaignId: 'not-a-uuid' })).toEqual({ ok: false, error: 'campaignId must be a UUID' });
    expect(parseGraphScope({ campaignId: ['a', 'b'] })).toEqual({ ok: true, timeWindow: undefined, brandId: undefined, campaignId: undefined, journey: {} });
  });

  it('T411: the journey terms are parsed, trimmed, and empty when absent', () => {
    expect(parseGraphScope({ programSlug: ' business-growth ', pathSlug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS' })).toEqual({
      ok: true, timeWindow: undefined, brandId: undefined, campaignId: undefined,
      journey: { programSlug: 'business-growth', pathSlug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS' },
    });
    expect(parseGraphScope({ programSlug: '' }).ok && parseGraphScope({ programSlug: '' })).toMatchObject({ journey: {} });
    // One term alone is a filter, and composes with a window.
    expect(parseGraphScope({ timeWindow: '7d', state: 'PROPOSAL_SENT' })).toMatchObject({ ok: true, timeWindow: '7d', journey: { state: 'PROPOSAL_SENT' } });
  });

  it('T411: a malformed journey term is refused, for the campaign id\'s reason - it would render a programme nobody is on', () => {
    expect(parseGraphScope({ programSlug: 'business growth' })).toEqual({ ok: false, error: 'programSlug must be a slug' });
    expect(parseGraphScope({ pathSlug: "'; DROP TABLE leads; --" })).toEqual({ ok: false, error: 'pathSlug must be a slug' });
    expect(parseGraphScope({ state: 'x'.repeat(65) })).toEqual({ ok: false, error: 'state must be a slug' });
    // A non-string (an array in the query string) is no term, as it is for the campaign id.
    expect(parseGraphScope({ programSlug: ['a', 'b'] })).toMatchObject({ ok: true, journey: {} });
  });
});

describe('filterPathsByJourney - the Growth Journey dimension on the graph (T411)', () => {
  const journey = (over: Partial<LeadJourneyFacts> = {}): LeadJourneyFacts => ({ program_slug: 'business-growth', path_slug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS', brand_id: 'b-ent', classified_at: new Date('2026-09-01T00:00:00Z'), ...over });
  const lead = (id: number, j: LeadJourneyFacts | null, campaigns: string[] = ['c1']) => ({
    lead_id: id, journey: j,
    campaign_enrollments: campaigns.map((c) => ({ campaign_id: c, campaign_name: c, enrolled_at: new Date() })),
  } as unknown as LeadPathRecord);

  const POPULATION = [
    lead(1, journey()),                                                        // business-growth / workflow_automation / EXPLORING
    lead(2, journey({ path_slug: 'business_training', state: 'PROPOSAL_SENT' })), // same programme, other path and state
    lead(3, journey({ program_slug: 'cpn-scholars', path_slug: 'learner_free_training', brand_id: 'b-cpn' })), // other programme
    lead(4, null),                                                             // never classified
  ];

  it('counts only the leads whose latest classification names the programme', () => {
    expect(filterPathsByJourney(POPULATION, { programSlug: 'business-growth' }).map((l) => l.lead_id)).toEqual([1, 2]);
    expect(filterPathsByJourney(POPULATION, { programSlug: 'cpn-scholars' }).map((l) => l.lead_id)).toEqual([3]);
    expect(filterPathsByJourney(POPULATION, { programSlug: 'no-such-programme' })).toEqual([]);
  });

  it('path and state narrow further, and terms compose', () => {
    expect(filterPathsByJourney(POPULATION, { pathSlug: 'workflow_automation' }).map((l) => l.lead_id)).toEqual([1]);
    expect(filterPathsByJourney(POPULATION, { state: 'PROPOSAL_SENT' }).map((l) => l.lead_id)).toEqual([2]);
    expect(filterPathsByJourney(POPULATION, { programSlug: 'business-growth', state: 'EXPLORING_SOLUTIONS' }).map((l) => l.lead_id)).toEqual([1]);
    expect(filterPathsByJourney(POPULATION, { programSlug: 'business-growth', pathSlug: 'learner_free_training' })).toEqual([]);
  });

  it('an unclassified lead is PRESENT in the population with journey null and absent from every journey cohort', () => {
    const unclassified = POPULATION.find((l) => l.lead_id === 4)!;
    expect(unclassified.journey).toBeNull();
    for (const terms of [{ programSlug: 'business-growth' }, { pathSlug: 'workflow_automation' }, { state: 'EXPLORING_SOLUTIONS' }]) {
      expect(filterPathsByJourney(POPULATION, terms).map((l) => l.lead_id)).not.toContain(4);
    }
  });

  it('a journey term and a brand term COMPOSE: the cohort is the intersection, never the journey alone (the T411 verifier)', () => {
    // The brand half is `filterPathsByBrand`, which the graph applies through the campaign brand map;
    // here the composition is asserted on the predicates the graph composes - journey INTERSECT campaign-brand.
    const brandOf = new Map<string, string>([['c1', 'b-ent'], ['c2', 'b-cpn']]);
    const population = [
      lead(1, journey(), ['c1']),                                   // business-growth, entered an Enterprise campaign
      lead(2, journey(), ['c2']),                                   // business-growth, entered a CPN campaign only
      lead(3, journey({ program_slug: 'cpn-scholars' }), ['c1']),    // other programme, Enterprise campaign
    ];
    const inBrand = (l: LeadPathRecord, b: string) => l.campaign_enrollments.some((e) => brandOf.get(e.campaign_id) === b);
    const jThenB = filterPathsByJourney(population, { programSlug: 'business-growth' }).filter((l) => inBrand(l, 'b-ent')).map((l) => l.lead_id);
    const bThenJ = filterPathsByJourney(population.filter((l) => inBrand(l, 'b-ent')), { programSlug: 'business-growth' }).map((l) => l.lead_id);
    expect(jThenB).toEqual([1]);
    expect(bThenJ).toEqual([1]);
    // Not the journey alone: lead 2 is on the programme but in no Enterprise campaign.
    expect(filterPathsByJourney(population, { programSlug: 'business-growth' }).map((l) => l.lead_id)).toEqual([1, 2]);
  });

  it('the SAME POPULATION property: a journey cohort is a SUBSET of the unfiltered paths, whole paths kept, input unmutated', () => {
    const cohort = filterPathsByJourney(POPULATION, { programSlug: 'business-growth' });
    // Every member is one of the originals, by identity - the filter chooses leads, it never rebuilds them.
    for (const l of cohort) expect(POPULATION).toContain(l);
    expect(cohort.length).toBeLessThanOrEqual(POPULATION.length);
    // The whole path survives: a journey-filtered lead still shows every campaign it entered.
    expect(cohort[0].campaign_enrollments.map((e) => e.campaign_id)).toEqual(['c1']);
    expect(POPULATION).toHaveLength(4);
    // And it composes with the campaign filter in either order - the same set both ways.
    const jThenC = filterPathsByCampaign(filterPathsByJourney(POPULATION, { programSlug: 'business-growth' }), 'c1').map((l) => l.lead_id);
    const cThenJ = filterPathsByJourney(filterPathsByCampaign(POPULATION, 'c1'), { programSlug: 'business-growth' }).map((l) => l.lead_id);
    expect(jThenC).toEqual(cThenJ);
  });
});
