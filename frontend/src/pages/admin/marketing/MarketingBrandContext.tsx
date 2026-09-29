import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listBrands, type Brand } from '../../../services/adminBrandApi';
import {
  ALL_BRANDS, brandLabel, brandParam, defaultStore, readRememberedBrand, rememberBrand, resolveBrand,
  type BrandStore,
} from './brandScope';

/**
 * The Marketing tab's brand, held once for every page under it.
 *
 * Before this, Overview and Brands each loaded the brand list and kept their own choice, and the
 * two queues had no brand at all. Now the list is fetched once, the choice is made once, and
 * every page reads it - which is the single change that makes the tab behave like one product
 * rather than six.
 *
 * A FAILED BRAND LIST IS NOT AN EMPTY ONE. If the request fails the switcher says so and stays
 * on "all brands", rather than rendering an empty dropdown that reads as "you have no brands".
 */

export interface MarketingBrandValue {
  /** A brand id, or ALL_BRANDS. */
  brandId: string;
  setBrandId: (next: string) => void;
  brands: Brand[];
  brandsLoading: boolean;
  brandsError: string | null;
  /** "All brands", or the brand's name. */
  label: string;
  /** `{ brand_id }` for an API call, or undefined for every brand. */
  params: { brand_id: string } | undefined;
  /** The chosen brand, or null when looking at all of them. */
  brand: Brand | null;
}

const MarketingBrandContext = createContext<MarketingBrandValue | null>(null);

export interface MarketingBrandProviderProps {
  children: React.ReactNode;
  /** Injectable for tests; production reads localStorage. */
  store?: BrandStore | null;
  /** Injectable for tests. */
  load?: typeof listBrands;
}

export function MarketingBrandProvider({ children, store, load = listBrands }: MarketingBrandProviderProps) {
  const storeRef = useRef<BrandStore | null>(store === undefined ? defaultStore() : store);
  const [brandId, setBrandIdState] = useState<string>(() => readRememberedBrand(storeRef.current) ?? ALL_BRANDS);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandsError, setBrandsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((r) => {
        if (cancelled) return;
        setBrands(r.brands);
        setBrandsError(null);
        // A remembered brand that has since been archived, or that this person can no longer
        // see, would filter every page to nothing. Fall back rather than show an empty product.
        setBrandIdState((current) => resolveBrand(current, r.brands));
      })
      .catch(() => {
        if (cancelled) return;
        setBrands([]);
        setBrandsError('The brand list could not be loaded, so this is showing every brand.');
      })
      .finally(() => { if (!cancelled) setBrandsLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const setBrandId = useCallback((next: string) => {
    setBrandIdState(next);
    rememberBrand(storeRef.current, next);
  }, []);

  /**
   * Memoised on the brand ALONE, so its identity survives the brand list arriving.
   *
   * Pages put `params` in the dependency list of the callback that fetches. When it was rebuilt
   * with the rest of the value, `{ brand_id }` was a new object on every provider render, so
   * every page refetched each time anything here changed - and the tests raced with the second
   * request. One stable object per brand; nothing refetches unless the brand actually changed.
   */
  const params = useMemo(() => brandParam(brandId), [brandId]);

  const value = useMemo<MarketingBrandValue>(() => ({
    brandId,
    setBrandId,
    brands,
    brandsLoading,
    brandsError,
    label: brandLabel(brandId, brands),
    params,
    brand: brands.find((b) => b.id === brandId) ?? null,
  }), [brandId, setBrandId, brands, brandsLoading, brandsError, params]);

  return <MarketingBrandContext.Provider value={value}>{children}</MarketingBrandContext.Provider>;
}

/**
 * The brand every marketing page reads. Throws outside the provider on purpose: a page that
 * quietly defaulted to "all brands" because someone forgot to wrap it is the silent-wrong-scope
 * bug this context exists to remove.
 */
export function useMarketingBrand(): MarketingBrandValue {
  const value = useContext(MarketingBrandContext);
  if (!value) throw new Error('useMarketingBrand must be used inside <MarketingBrandProvider>.');
  return value;
}
