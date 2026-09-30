import {
  ALL_BRANDS, BRAND_STORAGE_KEY, brandLabel, brandParam, readRememberedBrand, rememberBrand,
  resolveBrand, type BrandStore,
} from '../brandScope';
import type { Brand } from '../../../../services/adminBrandApi';

/**
 * Remembering which brand the Marketing tab is looking at.
 *
 * Two properties carry the weight: a browser that refuses to store anything must leave the tab
 * working, and a remembered brand that no longer exists must not silently filter every page to
 * nothing - which would look exactly like an outage.
 */

const brand = (id: string, name: string): Brand => ({
  id, tenant_id: 't-1', name, slug: name.toLowerCase().replace(/\W+/g, '-'),
  status: 'active', default_public_url: null, support_email: null,
});

const BRANDS = [brand('b-1', 'Refactored.ai'), brand('b-2', 'Colaberry Training')];

function memoryStore(initial: Record<string, string> = {}): BrandStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

/** A browser with site data blocked: every access throws. */
const hostileStore: BrandStore = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

describe('remembering the choice', () => {
  it('round-trips a brand', () => {
    const store = memoryStore();
    rememberBrand(store, 'b-2');
    expect(store.data[BRAND_STORAGE_KEY]).toBe('b-2');
    expect(readRememberedBrand(store)).toBe('b-2');
  });

  it('"all brands" is an absence, not a stored value', () => {
    const store = memoryStore({ [BRAND_STORAGE_KEY]: 'b-2' });
    rememberBrand(store, ALL_BRANDS);
    expect(BRAND_STORAGE_KEY in store.data).toBe(false);
    expect(readRememberedBrand(store)).toBeNull();
  });

  it('a browser that refuses to store anything does not break the tab', () => {
    expect(() => rememberBrand(hostileStore, 'b-1')).not.toThrow();
    expect(readRememberedBrand(hostileStore)).toBeNull();
  });

  it('no store at all is the same as nothing remembered', () => {
    expect(readRememberedBrand(null)).toBeNull();
    expect(() => rememberBrand(null, 'b-1')).not.toThrow();
  });
});

describe('honouring it only while it is still real', () => {
  it('keeps a brand that is still in the list', () => {
    expect(resolveBrand('b-2', BRANDS)).toBe('b-2');
  });

  it('falls back to all brands when the remembered one is gone', () => {
    // Archived, or the person's tenant scope changed between sessions. Filtering every page to a
    // brand that cannot be seen would render an empty product and read as an outage.
    expect(resolveBrand('b-gone', BRANDS)).toBe(ALL_BRANDS);
  });

  it('does NOT discard it while the list is still loading', () => {
    // An empty list is "not loaded yet", not "that brand does not exist".
    expect(resolveBrand('b-2', [])).toBe('b-2');
  });

  it('nothing remembered means all brands', () => {
    expect(resolveBrand(null, BRANDS)).toBe(ALL_BRANDS);
    expect(resolveBrand(ALL_BRANDS, BRANDS)).toBe(ALL_BRANDS);
  });
});

describe('what reaches an API and what reaches the screen', () => {
  it('all brands sends no filter at all, rather than a sentinel the server would not understand', () => {
    expect(brandParam(ALL_BRANDS)).toBeUndefined();
    expect(brandParam('b-1')).toEqual({ brand_id: 'b-1' });
  });

  it('names the brand, and says so plainly when it cannot', () => {
    expect(brandLabel(ALL_BRANDS, BRANDS)).toBe('All brands');
    expect(brandLabel('b-1', BRANDS)).toBe('Refactored.ai');
    expect(brandLabel('b-gone', BRANDS)).toBe('Unknown brand');
  });
});
