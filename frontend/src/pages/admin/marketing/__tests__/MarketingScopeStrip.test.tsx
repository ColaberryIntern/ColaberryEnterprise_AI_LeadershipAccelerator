import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import MarketingScopeStrip, { type MarketingScopeStripProps } from '../MarketingScopeStrip';
import { ALL_BRANDS, scopeToQuery, type MarketingScope } from '../marketingScope';
import type { Brand } from '../../../../services/adminBrandApi';

/**
 * The strip must emit a scope that actually changes the request, and must never invent a
 * freshness time.
 *
 * The acceptance criterion is "changing brand refetches with the new brand scope". That is
 * asserted end to end here: the select fires onScopeChange, the emitted scope is threaded
 * through `scopeToQuery`, and the resulting params are compared against the params before the
 * change. A test that only checked the callback fired would pass against a component that
 * emitted the OLD brand.
 */

let container: HTMLDivElement;
let root: Root;
let emitted: MarketingScope[];

const BRANDS: Brand[] = [
  { id: 'b1', tenant_id: 't1', slug: 'enterprise', name: 'Colaberry Enterprise', status: 'active', default_public_url: null, support_email: null },
  { id: 'b2', tenant_id: 't1', slug: 'training', name: 'Colaberry Training', status: 'active', default_public_url: null, support_email: null },
];

const SCOPE: MarketingScope = {
  brand: ALL_BRANDS,
  range: { start: '2026-09-04', end: '2026-09-10' },
  comparison: 'previous_period',
};

const NOW = Date.parse('2026-09-10T12:00:00Z');

function render(over: Partial<MarketingScopeStripProps> = {}): void {
  const props: MarketingScopeStripProps = {
    scope: SCOPE,
    brands: BRANDS,
    brandsLoading: false,
    fetchedAt: '2026-09-10T11:58:00Z',
    now: NOW,
    onScopeChange: (next) => emitted.push(next),
    ...over,
  };
  act(() => { root.render(<MarketingScopeStrip {...props} />); });
}

function select(id: string): HTMLSelectElement {
  const el = container.querySelector(`#${id}`);
  if (!el) throw new Error(`missing #${id}`);
  return el as HTMLSelectElement;
}

/** Fire a real change event, the way the browser does. */
function change(el: HTMLSelectElement | HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  emitted = [];
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('changing brand changes what would be fetched', () => {
  it('emits the NEW brand, and the query differs from before', () => {
    render();
    const before = scopeToQuery(SCOPE);

    change(select('scope-brand'), 'b2');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].brand).toBe('b2');

    const after = scopeToQuery(emitted[0]);
    // The end-to-end assertion. A component that emitted the old brand would still fire the
    // callback and still pass a weaker test.
    expect(after).not.toEqual(before);
    expect(after.brand_id).toBe('b2');
  });

  it('preserves the date range and comparison when only the brand changes', () => {
    // A scope change that silently reset the dates would move every number on the page for a
    // reason the operator did not ask for.
    render();
    change(select('scope-brand'), 'b1');
    expect(emitted[0].range).toEqual(SCOPE.range);
    expect(emitted[0].comparison).toBe(SCOPE.comparison);
  });

  it('going back to all brands DROPS brand_id rather than sending a sentinel', () => {
    render({ scope: { ...SCOPE, brand: 'b1' } });
    change(select('scope-brand'), ALL_BRANDS);
    expect(scopeToQuery(emitted[0]).brand_id).toBeUndefined();
  });

  it('offers every brand plus the all-brands option', () => {
    render();
    const options = Array.from(select('scope-brand').options).map((o) => o.value);
    expect(options).toEqual([ALL_BRANDS, 'b1', 'b2']);
  });

  it('says brands are loading rather than showing an empty list', () => {
    // An empty selector during load is indistinguishable from "you have no brands".
    render({ brands: [], brandsLoading: true });
    expect(select('scope-brand').textContent).toMatch(/Loading brands/i);
    expect(select('scope-brand').disabled).toBe(true);
  });
});

describe('the comparison window is stated, not implied', () => {
  it('spells out the exact dates being compared against', () => {
    // "vs previous period" tells an operator nothing about which days were compared, and that
    // is exactly where an off-by-one hides.
    render();
    expect(container.textContent).toMatch(/2026-08-28 to 2026-09-03/);
  });

  it('says so plainly when no comparison is selected', () => {
    render({ scope: { ...SCOPE, comparison: 'none' } });
    expect(container.textContent).toMatch(/no comparison/i);
    expect(container.textContent).not.toMatch(/2026-08-28/);
  });

  it('reports the window length inclusively', () => {
    render();
    expect(container.textContent).toMatch(/7 days/);
  });
});

describe('freshness is reported, never invented', () => {
  it('renders the elapsed time since the given fetch', () => {
    render({ fetchedAt: '2026-09-10T11:58:00Z' });
    expect(container.querySelector('[data-testid="freshness"]')!.textContent).toBe('Updated 2 min ago');
  });

  it('says nothing has loaded rather than showing a time', () => {
    // The defect this guards: a badge that reports the render moment as the data's age claims
    // freshness for a page that has loaded nothing at all.
    render({ fetchedAt: null });
    expect(container.querySelector('[data-testid="freshness"]')!.textContent).toBe('Not loaded yet');
  });

  it('does not change when only the render happens again', () => {
    // Purity, observable from outside: re-rendering with identical props must produce an
    // identical label. A clock read at render time would drift.
    render({ fetchedAt: '2026-09-10T11:00:00Z' });
    const first = container.querySelector('[data-testid="freshness"]')!.textContent;
    render({ fetchedAt: '2026-09-10T11:00:00Z' });
    expect(container.querySelector('[data-testid="freshness"]')!.textContent).toBe(first);
  });
});
