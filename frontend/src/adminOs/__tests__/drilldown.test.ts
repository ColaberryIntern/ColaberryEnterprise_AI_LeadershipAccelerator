import {
  DrilldownTarget,
  fromDrilldownUrl,
  hasRequiredFilters,
  missingFilters,
  toDrilldownUrl,
} from '../drilldown';

const target: DrilldownTarget = {
  kind: 'people.roster',
  metricKey: 'growth.unique_visitors',
  filters: { period: '30d', site: 'enterprise', includeBots: false },
};

describe('drill-down contract', () => {
  it('round-trips a drill-down through the URL', () => {
    // The property everything else depends on: what the KPI encoded is exactly
    // what the roster decodes, so the two cannot disagree about the population.
    const url = toDrilldownUrl(target);
    const [pathname, search] = url.split('?');
    const parsed = fromDrilldownUrl(pathname, `?${search}`);

    expect(parsed).not.toBeNull();
    expect(parsed!.kind).toBe('people.roster');
    expect(parsed!.metricKey).toBe('growth.unique_visitors');
    expect(parsed!.filters).toEqual({ period: '30d', site: 'enterprise', includeBots: 'false' });
  });

  it('carries the drill-down in the URL so Back and sharing work', () => {
    const url = toDrilldownUrl(target);
    expect(url.startsWith('/admin/people?')).toBe(true);
    expect(url).toContain('metric=growth.unique_visitors');
    expect(url).toContain('period=30d');
  });

  it('drops undefined and empty filters instead of writing them', () => {
    // A literal ?site=undefined reaching a query builder is how a roster returns
    // everything while looking filtered.
    const url = toDrilldownUrl({
      kind: 'people.roster',
      metricKey: 'growth.engaged_visitors',
      filters: { period: '7d', site: undefined, source: '' },
    });
    expect(url).not.toContain('undefined');
    expect(url).not.toContain('site=');
    expect(url).not.toContain('source=');
    expect(url).toContain('period=7d');
  });

  it('preserves false rather than dropping it', () => {
    // false is a real filter value — "crawlers excluded" — and losing it would
    // silently switch the roster to a different population than the KPI counted.
    const url = toDrilldownUrl(target);
    expect(url).toContain('includeBots=false');
  });

  it('preserves zero rather than dropping it', () => {
    const url = toDrilldownUrl({
      kind: 'growth.sessions',
      metricKey: 'growth.unique_visitors',
      filters: { minPageviews: 0 },
    });
    expect(url).toContain('minPageviews=0');
  });

  it('refuses to let a filter shadow a reserved key', () => {
    const url = toDrilldownUrl({
      kind: 'people.roster',
      metricKey: 'growth.unique_visitors',
      filters: { metric: 'spoofed', drilldown: '0', period: '30d' },
    });
    expect(url).toContain('metric=growth.unique_visitors');
    expect(url).not.toContain('metric=spoofed');
    expect(url).not.toContain('drilldown=0');
  });

  it('encodes filter values that contain URL characters', () => {
    const url = toDrilldownUrl({
      kind: 'people.roster',
      metricKey: 'growth.source_attribution',
      filters: { source: 'google.com/search?q=a&b' },
    });
    const [, search] = url.split('?');
    const parsed = fromDrilldownUrl('/admin/people', `?${search}`);
    expect(parsed!.filters.source).toBe('google.com/search?q=a&b');
  });

  it('returns null for a plain visit so the dashboard renders, not an empty roster', () => {
    expect(fromDrilldownUrl('/admin/people', '')).toBeNull();
    expect(fromDrilldownUrl('/admin/people', '?tab=all')).toBeNull();
  });

  it('returns null when the drill-down names no metric', () => {
    // Without a metric key the roster cannot state what it is showing or
    // reconcile its count, so it must not pretend to be a drill-down.
    expect(fromDrilldownUrl('/admin/people', '?drilldown=1')).toBeNull();
  });

  it('returns null for a path that is not a drill-down target', () => {
    expect(fromDrilldownUrl('/admin/settings', '?drilldown=1&metric=growth.unique_visitors')).toBeNull();
  });

  it('reports exactly which required filters are missing', () => {
    const partial: DrilldownTarget = {
      kind: 'people.roster',
      metricKey: 'growth.unique_visitors',
      filters: { period: '30d' },
    };
    const required = ['period', 'site', 'includeBots'];
    expect(hasRequiredFilters(partial, required)).toBe(false);
    expect(missingFilters(partial, required)).toEqual(['site', 'includeBots']);

    expect(hasRequiredFilters(target, required)).toBe(true);
    expect(missingFilters(target, required)).toEqual([]);
  });

  it('treats an empty-string filter as missing, not as satisfied', () => {
    const blank: DrilldownTarget = {
      kind: 'people.roster',
      metricKey: 'growth.unique_visitors',
      filters: { period: '' },
    };
    expect(hasRequiredFilters(blank, ['period'])).toBe(false);
  });
});
