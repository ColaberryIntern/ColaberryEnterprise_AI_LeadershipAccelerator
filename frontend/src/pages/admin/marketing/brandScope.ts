import type { Brand } from '../../../services/adminBrandApi';

/**
 * brandScope - which brand the Marketing tab is looking at, remembered between pages and reloads.
 *
 * WHY. Loomly asks "which calendar?" once, in a switcher that persists, and every screen after
 * that belongs to it. We asked "which brand?" separately on Overview and on Brands - two pickers
 * that did not share an answer - and not at all on the Content and Publishing queues, which had
 * no brand concept in their code. That is most of what made the tab feel like loose pieces.
 *
 * WHAT IS REMEMBERED, AND WHAT IS NOT. The choice is a per-person convenience, so it lives in
 * `localStorage`, never on the server: it changes nothing about what anyone is allowed to see.
 * Every read is guarded - a private window, blocked site data, or a browser that throws on
 * access must leave the tab working, showing all brands.
 *
 * A REMEMBERED BRAND IS ONLY HONOURED IF IT STILL EXISTS. Brands get archived, and an operator's
 * tenant scope can change between sessions. Restoring an id that is no longer in the list would
 * filter every page to nothing and look like an outage, so `resolveBrand` falls back to all.
 */

/** The switcher's "everything" option. Not a brand id, and never sent to an API. */
export const ALL_BRANDS = '__all__';

export const BRAND_STORAGE_KEY = 'colaberry.marketing.brandId';

/** Just enough of `Storage` to be faked in a test. */
export interface BrandStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's store, or null when it cannot be reached. Never throws. */
export function defaultStore(): BrandStore | null {
  try {
    const s = window.localStorage;
    // Touching it is the only reliable test: Safari's private mode throws on setItem, not on read.
    const probe = '__brand_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readRememberedBrand(store: BrandStore | null): string | null {
  if (!store) return null;
  try {
    return store.getItem(BRAND_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberBrand(store: BrandStore | null, brandId: string): void {
  if (!store) return;
  try {
    if (brandId === ALL_BRANDS) store.removeItem(BRAND_STORAGE_KEY);
    else store.setItem(BRAND_STORAGE_KEY, brandId);
  } catch {
    // A browser that will not store it still has to work; the choice just does not survive.
  }
}

/**
 * The brand to actually use: the remembered one when it is still a brand this person can see,
 * otherwise all. `brands` being empty means the list has not loaded yet - that is not evidence
 * the remembered brand is gone, so it is kept.
 */
export function resolveBrand(remembered: string | null, brands: readonly Brand[]): string {
  if (!remembered || remembered === ALL_BRANDS) return ALL_BRANDS;
  if (brands.length === 0) return remembered;
  return brands.some((b) => b.id === remembered) ? remembered : ALL_BRANDS;
}

/** What to send an API: the brand id, or nothing at all for "every brand". */
export function brandParam(brandId: string): { brand_id: string } | undefined {
  return brandId === ALL_BRANDS ? undefined : { brand_id: brandId };
}

/** The name to show in the switcher and in headings. */
export function brandLabel(brandId: string, brands: readonly Brand[]): string {
  if (brandId === ALL_BRANDS) return 'All brands';
  return brands.find((b) => b.id === brandId)?.name ?? 'Unknown brand';
}
