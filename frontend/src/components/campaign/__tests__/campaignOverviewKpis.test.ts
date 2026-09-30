import { buildOverviewKpis, kpiHref, CAMPAIGN_LEAD_STATUS_METRIC } from '../campaignOverviewKpis';
import { fromDrilldownUrl, hasRequiredFilters, missingFilters } from '../../../adminOs/drilldown';

/**
 * Every KPI on the Campaign 360 Overview exposes a working drill-down.
 *
 * "Working" is the operative word, and the drilldown module's own header defines it: a
 * drill-down is an analytical path, not a tooltip. So these tests do not stop at "a target
 * exists". They serialise each one to a URL, parse it back, and check that what comes back
 * carries every filter the KPI declares as required - because a roster that opens without the
 * campaign filter shows every lead in the system under a headline that counted one campaign's.
 */

const CAMPAIGN = 'c0000000-0000-4000-8000-000000000001';
const COUNTS = { active: 12, completed: 30, removed: 2, paused: 1 };

describe('every KPI exposes a drill-down', () => {
  const kpis = buildOverviewKpis(CAMPAIGN, COUNTS, 48);

  it('has a drill-down target on all five', () => {
    expect(kpis).toHaveLength(5);
    for (const k of kpis) {
      expect(k.drilldown).toBeDefined();
      expect(k.drilldown.kind).toBe('people.roster');
      expect(k.drilldown.metricKey).toBe(CAMPAIGN_LEAD_STATUS_METRIC);
    }
  });

  it('every drill-down carries the campaign, so the roster cannot open unscoped', () => {
    for (const k of kpis) {
      expect(k.drilldown.filters.campaign).toBe(CAMPAIGN);
    }
  });

  it('every drill-down satisfies its OWN declared required filters', () => {
    // The reconciliation guarantee, checked rather than trusted.
    for (const k of kpis) {
      expect(missingFilters(k.drilldown, k.requiredFilters)).toEqual([]);
      expect(hasRequiredFilters(k.drilldown, k.requiredFilters)).toBe(true);
    }
  });

  it('every drill-down ROUND-TRIPS through the URL with its filters intact', () => {
    // State lives in the URL. If serialising and parsing back lost a filter, Back would land on
    // a roster counting a different population than the card the user clicked.
    for (const k of kpis) {
      const href = kpiHref(k);
      const [pathname, search] = href.split('?');
      const parsed = fromDrilldownUrl(pathname, `?${search}`);
      expect(parsed).not.toBeNull();
      expect(parsed!.metricKey).toBe(k.drilldown.metricKey);
      for (const [key, value] of Object.entries(k.drilldown.filters)) {
        expect(parsed!.filters[key]).toBe(String(value));
      }
    }
  });

  it('status slices carry a status filter and the total does NOT', () => {
    const byKey = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(byKey.total.drilldown.filters.status).toBeUndefined();
    expect(byKey.active.drilldown.filters.status).toBe('active');
    expect(byKey.paused.drilldown.filters.status).toBe('paused');
  });
});

describe('the counts are honest', () => {
  it('Removed counts the removed bucket and promises nothing else', () => {
    // An earlier version summed a `dnc` bucket into this card. getCampaignStats counts
    // campaign_leads by its five statuses and dnc is not one of them, so that bucket was
    // always undefined and the label "DNC / Removed" promised a number nothing measures.
    const kpis = buildOverviewKpis(CAMPAIGN, { removed: 2 }, 5);
    const removed = kpis.find((k) => k.key === 'removed')!;
    expect(removed.value).toBe(2);
    expect(removed.label).toBe('Removed');
  });

  it('the removed drill-down asks the roster for exactly the status it counted', () => {
    const kpis = buildOverviewKpis(CAMPAIGN, COUNTS, 48);
    expect(kpis.find((k) => k.key === 'removed')!.drilldown.filters.status).toBe('removed');
  });

  it('missing buckets read as zero, not NaN', () => {
    const kpis = buildOverviewKpis(CAMPAIGN, {}, 0);
    for (const k of kpis) expect(Number.isNaN(k.value)).toBe(false);
  });
});
