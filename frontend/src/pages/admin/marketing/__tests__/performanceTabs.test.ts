import { PERFORMANCE_TABS, tabFromSearch } from '../performanceTabs';

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
