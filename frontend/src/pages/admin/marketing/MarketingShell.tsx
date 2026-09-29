import React, { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MarketingBrandProvider, useMarketingBrand } from './MarketingBrandContext';
import { ALL_BRANDS } from './brandScope';
import ConnectionBanner from './ConnectionBanner';
import { listChannelAccounts, type ChannelAccount } from '../../../services/channelAccountApi';

/**
 * The frame every Marketing page sits in.
 *
 * Loomly puts a calendar switcher top-left and scopes every screen to it. This is the same idea:
 * one bar, above every marketing page, holding the brand. Pages below it read the choice instead
 * of asking for it again, which is why the per-page pickers could go.
 *
 * It is a ROUTE layout, not a component each page renders, so a new marketing page inherits the
 * frame by being routed here - rather than by remembering to include it.
 */

function BrandBar() {
  const { brandId, setBrandId, brands, brandsLoading, brandsError } = useMarketingBrand();

  return (
    <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom bg-light" data-testid="marketing-brand-bar">
      <label className="form-label small text-muted mb-0" htmlFor="marketing-brand">Brand</label>
      <select
        id="marketing-brand"
        className="form-select form-select-sm"
        style={{ maxWidth: '18rem' }}
        value={brandId}
        disabled={brandsLoading && brands.length === 0}
        onChange={(e) => setBrandId(e.target.value)}
        data-testid="marketing-brand-select"
      >
        <option value={ALL_BRANDS}>All brands</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {brandId !== ALL_BRANDS && (
        <span className="small text-muted d-none d-md-inline">
          Everything below is this brand only.
        </span>
      )}
      {/* A failed list is not an empty one, and the difference matters to whoever reads it. */}
      {brandsError && <span className="small text-danger" data-testid="marketing-brand-error">{brandsError}</span>}
    </div>
  );
}

/**
 * Connection trouble, on every marketing screen.
 *
 * Accounts are read ONCE here rather than per page, and across every brand: a LinkedIn that
 * stopped working on another brand is still a post that will not go out. A failed read shows
 * nothing at all - a banner that cannot say what is wrong is worse than no banner.
 */
function ConnectionWatch() {
  const { brands } = useMarketingBrand();
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    listChannelAccounts({})
      .then((rows) => { if (!cancelled) setAccounts(rows); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  const brandNames = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  return <ConnectionBanner accounts={accounts} brandNames={brandNames} />;
}

export default function MarketingShell() {
  return (
    <MarketingBrandProvider>
      <ConnectionWatch />
      <BrandBar />
      <Outlet />
    </MarketingBrandProvider>
  );
}
