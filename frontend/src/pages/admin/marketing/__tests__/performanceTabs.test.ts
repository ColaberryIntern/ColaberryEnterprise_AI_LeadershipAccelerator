import {
  PERFORMANCE_TABS,
  PERFORMANCE_TAB_LABELS,
  SCOPE_FILTERED_TABS,
  scopeAppliesTo,
  tabFromSearch,
  type PerformanceTab,
} from '../performanceTabs';

describe('which Performance tab a link opens', () => {
  it('opens the tab named in the query', () => {
    expect(tabFromSearch('?tab=registry')).toBe('registry');
    expect(tabFromSearch('?tab=revenue')).toBe('revenue');
    expect(tabFromSearch('?tab=outreach')).toBe('outreach');
  });

  it('falls back to the funnel for no tab, an unknown tab, or a malformed query', () => {
    expect(tabFromSearch('')).toBe('funnel');
    expect(tabFromSearch('?tab=attribution')).toBe('funnel');
    expect(tabFromSearch('?tab=')).toBe('funnel');
    expect(tabFromSearch('?nottab=registry')).toBe('funnel');
  });

  it('keeps the two keys the backend attention queue links to', () => {
    // needsAttentionQueue.ts writes `?tab=registry` (broken links) and `?tab=revenue` (spend,
    // attribution). Renaming either here without there sends those items to the funnel.
    expect(PERFORMANCE_TABS).toContain('registry');
    expect(PERFORMANCE_TABS).toContain('revenue');
  });
});

describe('what the tabs are called, as against what they are addressed by', () => {
  it('names every tab, so the bar cannot render an undefined label', () => {
    PERFORMANCE_TABS.forEach((key) => {
      expect(PERFORMANCE_TAB_LABELS[key]).toEqual(expect.any(String));
      expect(PERFORMANCE_TAB_LABELS[key].length).toBeGreaterThan(0);
    });
  });

  it('uses the plain names, not the internal ones', () => {
    // These were "Revenue Intelligence" and "Campaign Link Registry" - what the code calls
    // them rather than what an operator would.
    expect(PERFORMANCE_TAB_LABELS.revenue).toBe('Revenue');
    expect(PERFORMANCE_TAB_LABELS.registry).toBe('Campaign links');
    expect(PERFORMANCE_TAB_LABELS.funnel).toBe('Marketing funnel');
    expect(PERFORMANCE_TAB_LABELS.outreach).toBe('AI outreach');
  });

  it('renaming a label leaves the KEY alone, because the backend links to the key', () => {
    // The whole reason labels and keys are separate. `registry` is written by
    // needsAttentionQueue.ts; the label above it now reads "Campaign links".
    expect(PERFORMANCE_TAB_LABELS.registry).not.toBe('registry');
    expect(tabFromSearch('?tab=registry')).toBe('registry');
  });
});

describe('the brand/date scope is only offered where it works', () => {
  it('filters Revenue, and only Revenue', () => {
    // `scopeToQuery()` is called in exactly ONE place on the page: the Revenue tab's request.
    // If this ever widens it must be because those endpoints LEARNED to accept a range - the
    // funnel graph takes no props, and channel-roi's handler is `(_req, res)`.
    expect(SCOPE_FILTERED_TABS).toEqual(['revenue']);
    expect(scopeAppliesTo('revenue')).toBe(true);
  });

  it('does not offer it above the three tabs it cannot filter', () => {
    (['funnel', 'registry', 'outreach'] as PerformanceTab[]).forEach((tab) => {
      expect(scopeAppliesTo(tab)).toBe(false);
    });
  });

  it('has an opinion about every tab, so a new one cannot default to looking filtered', () => {
    PERFORMANCE_TABS.forEach((key) => {
      expect(typeof scopeAppliesTo(key)).toBe('boolean');
    });
  });
});
