import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PerformanceScopeBar from '../PerformanceScopeBar';
import { PERFORMANCE_TABS, type PerformanceTab } from '../performanceTabs';
import { defaultScope } from '../marketingScope';

/**
 * The filter is shown above the numbers it filters, and nowhere else.
 *
 * `performanceTabs.test.ts` can prove `scopeAppliesTo()` returns the right booleans. It cannot
 * prove anything ASKS. That was the actual bug: the rule was knowable and the page rendered the
 * strip above all four tabs regardless, so a range narrowed to a week sat above a funnel
 * covering all time. These tests fail if the asking stops.
 */

let container: HTMLDivElement;
let root: Root;
let onScopeChange: jest.Mock;

async function mount(activeTab: PerformanceTab) {
  await act(async () => {
    root.render(
      <PerformanceScopeBar
        activeTab={activeTab}
        scope={defaultScope('2026-10-07')}
        brands={[]}
        brandsLoading={false}
        fetchedAt="2026-10-07T12:00:00.000Z"
        now={Date.parse('2026-10-07T12:00:30.000Z')}
        comparison={null}
        onScopeChange={onScopeChange}
      />,
    );
  });
}

/** The strip is identified by its own date inputs rather than by a testid it does not own. */
function dateInputs() { return container.querySelectorAll('input[type="date"]'); }
function note() { return container.querySelector('[data-testid="scope-not-applied"]'); }

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onScopeChange = jest.fn();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('Revenue is filtered, so the filter is offered', () => {
  it('renders the date range on the one tab that sends it to the server', async () => {
    await mount('revenue');
    expect(dateInputs()).toHaveLength(2);
    expect(note()).toBeNull();
  });
});

describe('the other three tabs are not filtered, so the filter is not offered', () => {
  it.each(['funnel', 'registry', 'outreach'] as PerformanceTab[])(
    'offers no date range on %s, and says why instead',
    async (tab) => {
      await mount(tab);
      expect(dateInputs()).toHaveLength(0);
      expect(note()).not.toBeNull();
    },
  );

  it('names the tab the filter DOES apply to, so the note is actionable', async () => {
    await mount('funnel');
    expect(note()!.textContent).toContain('Revenue');
  });

  it('does not claim the figures are filtered', async () => {
    await mount('registry');
    expect(note()!.textContent).toContain('not filtered');
  });
});

describe('every tab renders exactly one of the two', () => {
  it.each(PERFORMANCE_TABS)('shows the strip or the note on %s, never both and never neither', async (tab) => {
    await mount(tab);
    const hasStrip = dateInputs().length > 0;
    const hasNote = note() !== null;
    // A new tab added without a decision would otherwise render a bare gap.
    expect(hasStrip !== hasNote).toBe(true);
  });
});
