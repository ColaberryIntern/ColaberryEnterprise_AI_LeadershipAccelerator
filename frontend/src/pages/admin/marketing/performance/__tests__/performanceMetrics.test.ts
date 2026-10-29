import type {
  FunnelStage, FunnelCampaignRow, FunnelPageRow,
} from '../../acquisitionFunnelApi';
import {
  STAGE, EM_DASH, countOf, rate, formatCount, formatPct, funnelSteps, worstDropKey,
  headlineRates, signupsBySource, sourceLabel, crmSyncRate, isCrmSyncHealthy,
  pagesByTraffic, isMeasurable, barWidthPct, widestCount, takeawaySentence,
} from '../performanceMetrics';

/**
 * The arithmetic behind the Marketing Performance report.
 *
 * WHAT THESE TESTS ARE FOR. The failure this module exists to prevent is silent and public: a
 * denominator of zero rendering as `Infinity%` or `NaN%` on a report an executive reads. A funnel
 * with no ad clicks is an ordinary Monday, not an edge case, so the zero-denominator path is
 * tested as a first-class behavior rather than as a footnote.
 *
 * The second theme is that ZERO AND UNKNOWN MUST NOT PRINT THE SAME WAY. `0%` is a measurement;
 * an em dash is the absence of one. Collapsing them would let a broken CRM sync read as a real
 * 0% and a real 0% read as broken.
 */

const stage = (key: string, count: number, unit: 'people' | 'sessions' = 'people'): FunnelStage => ({
  key, count, unit, label: key, note: `note for ${key}`,
});

/** A funnel shaped like the live one: ad sessions at the top, each later stage smaller. */
const healthyFunnel = (): FunnelStage[] => [
  stage(STAGE.adClicks, 1000, 'sessions'),
  stage(STAGE.visitors, 600),
  stage(STAGE.engaged, 300),
  stage(STAGE.cta, 200),
  stage(STAGE.signups, 100),
  stage(STAGE.accounts, 99),
  // 99 of 100, i.e. 99% - above the 95% the takeaway calls "nearly all", matching the live page.
  stage(STAGE.inCrm, 99),
  stage(STAGE.returned, 10),
];

const campaign = (
  utm_source: string | null, utm_campaign: string | null,
  signups: number, accounts: number, in_crm: number,
  // Defaulted rather than added to every call site, because none of this file's existing
  // assertions are about consent. Kept REQUIRED on the type itself: a campaign row with no
  // opt-in figure is the thing worth noticing, so an optional field would let a door that
  // earns no permission render as a blank rather than as a zero.
  opted_in = 0,
): FunnelCampaignRow => ({ utm_source, utm_campaign, signups, accounts, in_crm, opted_in });

const page = (slug: string, visitors: number, over: Partial<FunnelPageRow> = {}): FunnelPageRow => ({
  slug, brand_slug: 'colaberry', status: 'published', site_slug: 'training',
  visitors, sessions: visitors, views: visitors, ad_clicks: 0, cta_clickers: 0,
  engaged_visitors: 0, identified_leads: 0, last_seen: null, ...over,
});

describe('rate: the divide-by-zero guard', () => {
  it('returns null rather than Infinity when the denominator is zero', () => {
    // The whole point. `100 / 0` is Infinity in JavaScript and would render as "Infinity%".
    expect(rate(100, 0)).toBeNull();
  });

  it('returns null rather than NaN when both sides are zero', () => {
    expect(rate(0, 0)).toBeNull();
  });

  it('distinguishes a real zero from a missing measurement', () => {
    // 0 of 100 IS a measurement and must survive as 0, not be flattened into null.
    expect(rate(0, 100)).toBe(0);
    expect(formatPct(rate(0, 100))).toBe('0.0%');
    expect(formatPct(rate(100, 0))).toBe(EM_DASH);
  });

  it('refuses a negative denominator, which only a malformed payload produces', () => {
    expect(rate(5, -10)).toBeNull();
  });

  it('refuses non-finite inputs instead of propagating them', () => {
    expect(rate(Number.NaN, 10)).toBeNull();
    expect(rate(10, Number.NaN)).toBeNull();
    expect(rate(Number.POSITIVE_INFINITY, 10)).toBeNull();
  });
});

describe('formatting', () => {
  it('groups thousands and renders a missing count as an em dash', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe(EM_DASH);
    expect(formatCount(undefined)).toBe(EM_DASH);
  });

  it('honours the decimal places the spec asks for per surface', () => {
    // KPI cards one decimal, tables none.
    expect(formatPct(0.3891)).toBe('38.9%');
    expect(formatPct(0.3891, 0)).toBe('39%');
  });
});

describe('funnelSteps', () => {
  it('keeps the backend order rather than sorting by size', () => {
    // The payload carries no `order` field, so array position IS the funnel order. Sorting by
    // count would manufacture the descending shape this data specifically contradicts.
    const steps = funnelSteps(healthyFunnel());
    expect(steps.map((s) => s.key)).toEqual([
      STAGE.adClicks, STAGE.visitors, STAGE.engaged, STAGE.cta,
      STAGE.signups, STAGE.accounts, STAGE.inCrm, STAGE.returned,
    ]);
  });

  it('gives the first stage no vs-prior figure at all', () => {
    const steps = funnelSteps(healthyFunnel());
    expect(steps[0].vsPrior).toBeNull();
    expect(steps[0].drop).toBe(0);
    expect(steps[0].ofTop).toBe(1);
  });

  it('computes each stage against the one above it and against the top', () => {
    const steps = funnelSteps(healthyFunnel());
    expect(steps[1].vsPrior).toBeCloseTo(0.6);
    expect(steps[1].ofTop).toBeCloseTo(0.6);
    expect(steps[2].vsPrior).toBeCloseTo(0.5);
    expect(steps[2].ofTop).toBeCloseTo(0.3);
  });

  it('flags a stage that EXCEEDS the one above it instead of smoothing it', () => {
    // The real defect this page surfaced: "Pressed a button" (345) above "Read it" (174). It is a
    // finding about independent measurement, so it must be labelled, never clamped.
    const steps = funnelSteps([
      stage(STAGE.adClicks, 1000, 'sessions'),
      stage(STAGE.engaged, 174),
      stage(STAGE.cta, 345),
    ]);
    expect(steps[2].grew).toBe(true);
    expect(steps[2].vsPrior).toBeCloseTo(345 / 174);
    expect(steps[2].drop).toBe(-171);
    expect(steps[1].grew).toBe(false);
  });

  it('survives an all-zero funnel without producing a single NaN', () => {
    const steps = funnelSteps([stage(STAGE.adClicks, 0, 'sessions'), stage(STAGE.visitors, 0)]);
    expect(steps[0].ofTop).toBeNull();
    expect(steps[1].vsPrior).toBeNull();
    expect(steps.every((s) => !Number.isNaN(s.drop))).toBe(true);
  });

  it('handles an empty stage list without throwing', () => {
    expect(funnelSteps([])).toEqual([]);
  });
});

describe('worstDropKey', () => {
  it('picks the largest ABSOLUTE fall, not the worst ratio', () => {
    // visitors loses 400 people; returned loses 79. A 90% fall from 89 is a worse RATIO, but the
    // red bar is meant to say where the people went, and 400 > 79.
    expect(worstDropKey(funnelSteps(healthyFunnel()))).toBe(STAGE.visitors);
  });

  it('returns null when nothing fell, so a healthy funnel gets no arbitrary red bar', () => {
    const flat = funnelSteps([stage(STAGE.adClicks, 50, 'sessions'), stage(STAGE.visitors, 50)]);
    expect(worstDropKey(flat)).toBeNull();
  });

  it('ignores stages that grew when choosing the worst fall', () => {
    const steps = funnelSteps([
      stage(STAGE.adClicks, 100, 'sessions'),
      stage(STAGE.engaged, 10),
      stage(STAGE.cta, 80),
    ]);
    expect(worstDropKey(steps)).toBe(STAGE.engaged);
  });
});

describe('headlineRates', () => {
  it('derives the three KPI rates from the stage counts', () => {
    const r = headlineRates(healthyFunnel());
    expect(r.adToSignup).toBeCloseTo(0.1);
    expect(r.crmSync).toBeCloseTo(0.99);
    expect(r.returnRate).toBeCloseTo(0.1);
  });

  it('returns nulls, not zeros, when there are no signups to divide by', () => {
    const r = headlineRates([stage(STAGE.adClicks, 500, 'sessions'), stage(STAGE.signups, 0)]);
    expect(r.adToSignup).toBe(0);
    expect(r.crmSync).toBeNull();
    expect(r.returnRate).toBeNull();
  });

  it('returns nulls when the stage is absent entirely', () => {
    const r = headlineRates([]);
    expect(r.adToSignup).toBeNull();
    expect(r.crmSync).toBeNull();
  });
});

describe('countOf', () => {
  it('reads a stage by key and treats an absent stage as zero', () => {
    expect(countOf(healthyFunnel(), STAGE.signups)).toBe(100);
    expect(countOf(healthyFunnel(), 'no_such_stage')).toBe(0);
  });
});

describe('signupsBySource', () => {
  it('AGGREGATES the (source, campaign) rows the endpoint returns into one slice per source', () => {
    // The endpoint returns a row per source+campaign pair. Fed straight to a pie, one source
    // running three campaigns draws three same-coloured slices.
    const slices = signupsBySource([
      campaign('fb', 'spring', 30, 28, 28),
      campaign('fb', 'summer', 20, 19, 19),
      campaign('ig', 'spring', 40, 39, 39),
    ]);
    expect(slices).toHaveLength(2);
    // fb's two campaigns sum to 50, which puts it ahead of ig's single 40.
    expect(slices[0]).toMatchObject({ source: 'fb', label: 'Facebook', signups: 50 });
    expect(slices[1]).toMatchObject({ source: 'ig', label: 'Instagram', signups: 40 });
  });

  it('orders slices biggest first', () => {
    const slices = signupsBySource([
      campaign('a', 'x', 1, 1, 1), campaign('b', 'x', 9, 9, 9), campaign('c', 'x', 5, 5, 5),
    ]);
    expect(slices.map((s) => s.signups)).toEqual([9, 5, 1]);
  });

  it('drops zero-signup sources rather than drawing a slice of nothing', () => {
    const slices = signupsBySource([campaign('fb', 'x', 0, 0, 0), campaign('ig', 'y', 7, 7, 7)]);
    expect(slices.map((s) => s.source)).toEqual(['ig']);
  });

  it('buckets a null source separately from a campaign literally named "untagged"', () => {
    // Both display as "Untagged"; collapsing them would merge two different things.
    const slices = signupsBySource([
      campaign(null, 'x', 5, 5, 5),
      campaign('untagged', 'y', 3, 3, 3),
    ]);
    expect(slices).toHaveLength(2);
    expect(slices.every((s) => s.label === 'Untagged')).toBe(true);
    expect(slices.map((s) => s.source).sort()).toEqual([null, 'untagged']);
  });

  it('returns an empty list for no campaigns', () => {
    expect(signupsBySource([])).toEqual([]);
  });
});

describe('sourceLabel', () => {
  it('expands the known utm codes and passes anything else through untouched', () => {
    expect(sourceLabel('fb')).toBe('Facebook');
    expect(sourceLabel('IG')).toBe('Instagram');
    expect(sourceLabel('linkedin')).toBe('linkedin');
    expect(sourceLabel(null)).toBe('Untagged');
    expect(sourceLabel('')).toBe('Untagged');
  });
});

describe('crmSyncRate and its threshold', () => {
  it('computes in-CRM over signed-up, and nulls when nobody signed up', () => {
    expect(crmSyncRate(campaign('fb', 'x', 100, 99, 99))).toBeCloseTo(0.99);
    expect(crmSyncRate(campaign('fb', 'x', 0, 0, 0))).toBeNull();
  });

  it('treats 99% as healthy and anything below it as not, with null never healthy', () => {
    expect(isCrmSyncHealthy(0.99)).toBe(true);
    expect(isCrmSyncHealthy(1)).toBe(true);
    expect(isCrmSyncHealthy(0.98)).toBe(false);
    expect(isCrmSyncHealthy(null)).toBe(false);
  });
});

describe('pagesByTraffic', () => {
  it('orders pages busiest first', () => {
    const sorted = pagesByTraffic([page('a', 5), page('b', 90), page('c', 40)]);
    expect(sorted.map((p) => p.slug)).toEqual(['b', 'c', 'a']);
  });

  it('does NOT mutate the array it was given', () => {
    // The array belongs to component state; sorting in place is how a list silently reorders
    // under a render that never asked it to.
    const original = [page('a', 5), page('b', 90)];
    const before = original.map((p) => p.slug);
    pagesByTraffic(original);
    expect(original.map((p) => p.slug)).toEqual(before);
  });
});

describe('isMeasurable', () => {
  it('calls a page without a tracker unmeasurable, so its zeros are not read as "none"', () => {
    expect(isMeasurable(page('tracked', 10))).toBe(true);
    expect(isMeasurable(page('untracked', 0, { site_slug: null }))).toBe(false);
  });
});

describe('barWidthPct', () => {
  it('scales against the widest value', () => {
    expect(barWidthPct(50, 100)).toBe(50);
    expect(barWidthPct(100, 100)).toBe(100);
  });

  it('gives a real-but-tiny value a sliver rather than an invisible zero', () => {
    expect(barWidthPct(1, 100000)).toBe(0.6);
  });

  it('draws nothing for a zero value, and survives a zero maximum', () => {
    expect(barWidthPct(0, 100)).toBe(0);
    expect(barWidthPct(0, 0)).toBe(0);
    expect(barWidthPct(5, 0)).toBe(0);
  });

  it('can exceed nothing: a stage larger than the widest is impossible by construction', () => {
    expect(widestCount(healthyFunnel())).toBe(1000);
    expect(widestCount([])).toBe(0);
  });
});

describe('takeawaySentence', () => {
  it('states the headline figures in one sentence', () => {
    const text = takeawaySentence(healthyFunnel());
    expect(text).toContain('1,000 sessions');
    expect(text).toContain('100 signups');
    expect(text).toContain('10.0% conversion');
    expect(text).toContain('Nearly all reached the CRM');
    expect(text).toContain('re-engagement is the weak link');
  });

  it('CHANGES ITS CLAIM when the CRM sync is not healthy', () => {
    // The stock sentence asserts "nearly all reached the CRM". That is true today and would be a
    // lie the moment the sync broke, which is exactly when somebody reads this page.
    const broken = healthyFunnel().map((s) => (s.key === STAGE.inCrm ? stage(STAGE.inCrm, 12) : s));
    const text = takeawaySentence(broken);
    expect(text).toContain('Only 12.0% reached the CRM');
    expect(text).not.toContain('Nearly all');
  });

  it('drops the "weak link" verdict when people DO come back', () => {
    const returning = healthyFunnel().map((s) => (
      s.key === STAGE.returned ? stage(STAGE.returned, 55) : s
    ));
    const text = takeawaySentence(returning);
    expect(text).toContain('and 55.0% came back');
    expect(text).not.toContain('weak link');
  });

  it('says plainly that there is nothing to report on an empty window', () => {
    expect(takeawaySentence([])).toBe('No ad sessions or signups were recorded in this window.');
  });

  it('never emits NaN or Infinity, whatever the counts', () => {
    const odd = [stage(STAGE.adClicks, 0, 'sessions'), stage(STAGE.signups, 7)];
    const text = takeawaySentence(odd);
    expect(text).not.toMatch(/NaN|Infinity/);
  });
});
