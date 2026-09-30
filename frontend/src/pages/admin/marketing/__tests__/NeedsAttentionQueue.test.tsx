import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import NeedsAttentionQueue, { type NeedsAttentionQueueProps } from '../NeedsAttentionQueue';

/**
 * The queue's empty state is POSITIVE, and exclusions are visible.
 *
 * Two things are asserted here and they are different:
 *
 *   1. A genuinely empty queue reads as good news - "Nothing needs your attention" - not as a
 *      blank panel indistinguishable from "nothing loaded" or "the queue is broken".
 *
 *   2. When signals were excluded because their data is not trusted, the empty state is
 *      QUALIFIED and the exclusions are listed with their reasons. "Nothing needs attention
 *      among the signals we can compute" is a weaker claim than "nothing needs attention", and
 *      the panel must say which one it is making. An untrusted metric is never rendered as a
 *      reassuring zero.
 */

let container: HTMLDivElement;
let root: Root;

function render(over: Partial<NeedsAttentionQueueProps> = {}): string {
  const props: NeedsAttentionQueueProps = {
    loading: false,
    error: null,
    items: [],
    excluded: [],
    onRetry: () => undefined,
    ...over,
  };
  act(() => { root.render(<NeedsAttentionQueue {...props} />); });
  return container.textContent ?? '';
}

const has = (testId: string) => container.querySelector(`[data-testid="${testId}"]`) !== null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the empty state is positive', () => {
  it('says nothing needs attention, unqualified, when nothing was excluded', () => {
    const text = render({ items: [], excluded: [] });
    expect(has('attention-empty')).toBe(true);
    expect(text).toMatch(/Nothing needs your attention/);
    expect(text).not.toMatch(/among the signals we can compute/);
    expect(has('attention-excluded')).toBe(false);
  });

  it('is distinguishable from loading and from error', () => {
    const empty = render({ items: [] });
    const loading = render({ loading: true });
    const error = render({ error: 'boom' });
    expect(new Set([empty, loading, error]).size).toBe(3);
    expect(loading).not.toMatch(/Nothing needs your attention/);
    expect(error).not.toMatch(/Nothing needs your attention/);
  });

  it('an error says so and does not claim there is nothing to do', () => {
    // A failed fetch rendered as the positive empty state would tell an operator everything
    // is fine when in fact nothing was checked.
    const text = render({ error: 'The server did not respond.' });
    expect(has('attention-error')).toBe(true);
    expect(text).toMatch(/does not mean nothing needs attention/);
  });
});

describe('an untrusted signal is excluded, never shown as zero', () => {
  const excluded = [
    { key: 'unmapped_spend', title: 'Spend without a campaign mapping', reason: 'There is NO ad-platform integration in this system.' },
  ];

  it('QUALIFIES the empty state when signals were excluded', () => {
    const text = render({ items: [], excluded });
    expect(text).toMatch(/among the signals we can compute/);
    expect(text).toMatch(/1 signal is not checked yet/);
  });

  it('lists the excluded signal with the registry reason', () => {
    const text = render({ items: [], excluded });
    expect(has('attention-excluded')).toBe(true);
    expect(text).toMatch(/Spend without a campaign mapping/);
    expect(text).toMatch(/NO ad-platform integration/);
  });

  it('never renders an excluded signal as an item reading 0', () => {
    // The exact shape of the defect: a list item saying "0 spend lines not mapped".
    render({ items: [], excluded });
    expect(has('attention-items')).toBe(false);
    expect(container.textContent).not.toMatch(/\b0 spend/);
  });

  it('shows exclusions alongside real items, not only when empty', () => {
    const items = [{ key: 'pending_approvals', severity: 'action' as const, title: '3 content items awaiting approval', count: 3, href: '/admin/marketing/content' }];
    const text = render({ items, excluded });
    expect(has('attention-items')).toBe(true);
    expect(has('attention-excluded')).toBe(true);
    expect(text).toMatch(/3 content items awaiting approval/);
    expect(text).toMatch(/Not shown - data not trusted yet/);
  });
});

describe('items render with severity and a way to act', () => {
  it('labels actions and warnings differently', () => {
    const text = render({
      items: [
        { key: 'a', severity: 'action', title: 'Fix this', count: 1, href: '/x' },
        { key: 'b', severity: 'warning', title: 'Consider this', count: 1, href: '/y' },
      ],
    });
    expect(text).toMatch(/Action/);
    expect(text).toMatch(/Warning/);
  });

  it('every item links somewhere', () => {
    render({ items: [{ key: 'a', severity: 'action', title: 'Fix this', count: 1, href: '/admin/marketing/content' }] });
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/admin/marketing/content');
  });
});
