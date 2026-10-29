import { TABS, DEFAULT_TAB } from '../ExplorerGrowthPage';

/**
 * The tab contract. This page had no test at all before Phase 2.
 *
 * ── WHY THE ORDER IS WORTH PINNING ──────────────────────────────────────────
 *
 * Phase 2 moved Shadow from fifth to first and made it the landing tab, because
 * it is the only tab that answers the question the page exists for — would the
 * right thing have gone out — now that its rows carry the subject rather than
 * hiding it one modal deep.
 *
 * That is a decision, not a layout preference, so it is asserted. The specific
 * failure this guards against is the quiet one: somebody appends a tab to the
 * array, or sorts it, and the page silently lands somewhere else. `DEFAULT_TAB`
 * is a named constant rather than `TABS[0]` precisely so a reorder cannot drag
 * the landing tab along with it — and these two tests are what make that
 * separation mean something instead of being a style choice.
 */

describe('tab order', () => {
  it('leads with the shadow review', () => {
    expect(TABS[0].key).toBe('shadow');
  });

  it('lands on the shadow review when no tab is given', () => {
    expect(DEFAULT_TAB).toBe('shadow');
  });

  it('the landing tab is one of the tabs that exist', () => {
    // The two are deliberately independent constants, which means they CAN
    // disagree. This is the assertion that stops them.
    expect(TABS.map((t) => t.key)).toContain(DEFAULT_TAB);
  });

  it('still offers all seven tabs — the reorder removed nothing', () => {
    expect(TABS).toHaveLength(7);
    expect(TABS.map((t) => t.key).sort()).toEqual(
      ['campus', 'content', 'decisions', 'journey', 'overview', 'settings', 'shadow'],
    );
  });

  it('has no duplicate keys, which would make a tab unreachable', () => {
    const keys = TABS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('tab labels say what the tab holds', () => {
  const label = (key: string) => TABS.find((t) => t.key === key)?.label;

  it('calls the content tab "Content supply", not "Content"', () => {
    // "Content" read as a library somebody maintains on the page. Nothing there
    // is authored: every row is a lesson card projected from the published
    // curriculum, and the rename is half of correcting that impression — the
    // subtitle on the tab is the other half.
    expect(label('content')).toBe('Content supply');
  });

  it('calls the leading tab a review, because that is what it is for', () => {
    expect(label('shadow')).toBe('Shadow review');
  });

  it('gives every tab a label and an icon', () => {
    for (const t of TABS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });
});
