import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MarketingBrandProvider, useMarketingBrand } from '../MarketingBrandContext';
import { ALL_BRANDS, BRAND_STORAGE_KEY, type BrandStore } from '../brandScope';
import type { Brand } from '../../../../services/adminBrandApi';

/**
 * The frame every Marketing page sits in: one brand, chosen once, remembered, and read by every
 * page below it. This is the change that replaced two pickers that disagreed and two pages with
 * no brand at all.
 */

let container: HTMLDivElement;
let root: Root;

const brand = (id: string, name: string): Brand => ({
  id, tenant_id: 't-1', name, slug: id,
  status: 'active', default_public_url: null, support_email: null,
});
const BRANDS = [brand('b-1', 'Refactored.ai'), brand('b-2', 'Colaberry Training')];

function memoryStore(initial: Record<string, string> = {}): BrandStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

/** A page under the frame: it reads the brand, it never asks for one. */
function Consumer() {
  const { brandId, label, params, brandsError } = useMarketingBrand();
  return (
    <div>
      <span data-testid="id">{brandId}</span>
      <span data-testid="label">{label}</span>
      <span data-testid="params">{JSON.stringify(params ?? null)}</span>
      <span data-testid="err">{brandsError ?? ''}</span>
    </div>
  );
}

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function mount(opts: { store?: BrandStore | null; load?: () => Promise<{ brands: Brand[] }> } = {}) {
  const load = opts.load ?? (async () => ({ brands: BRANDS }));
  await act(async () => {
    root.render(
      <MarketingBrandProvider store={opts.store ?? memoryStore()} load={load as never}>
        <Consumer />
      </MarketingBrandProvider>,
    );
  });
  await flush();
}

const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)!.textContent;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('the brand every marketing page reads', () => {
  it('starts on all brands, and sends no filter', async () => {
    await mount();
    expect(text('id')).toBe(ALL_BRANDS);
    expect(text('label')).toBe('All brands');
    expect(text('params')).toBe('null');
  });

  it('restores the brand chosen last time, and hands pages its filter', async () => {
    await mount({ store: memoryStore({ [BRAND_STORAGE_KEY]: 'b-2' }) });
    expect(text('id')).toBe('b-2');
    expect(text('label')).toBe('Colaberry Training');
    expect(text('params')).toBe('{"brand_id":"b-2"}');
  });

  it('drops a remembered brand that is no longer in the list, instead of filtering everything to nothing', async () => {
    await mount({ store: memoryStore({ [BRAND_STORAGE_KEY]: 'b-archived' }) });
    expect(text('id')).toBe(ALL_BRANDS);
  });

  it('a failed brand list says so and shows every brand - it is not an empty list', async () => {
    await mount({ load: async () => { throw new Error('network'); } });
    expect(text('err')).toMatch(/could not be loaded/);
    expect(text('id')).toBe(ALL_BRANDS);
  });

  it('a browser with site data blocked still works', async () => {
    const hostile: BrandStore = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    await mount({ store: hostile });
    expect(text('id')).toBe(ALL_BRANDS);
  });

  it('refuses to render a page outside the frame rather than defaulting it to all brands', async () => {
    // A page that quietly showed every brand because someone forgot to route it through the
    // shell is the silent-wrong-scope bug this context exists to remove.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => {
      act(() => { root.render(<Consumer />); });
    }).toThrow(/inside <MarketingBrandProvider>/);
    spy.mockRestore();
  });
});
