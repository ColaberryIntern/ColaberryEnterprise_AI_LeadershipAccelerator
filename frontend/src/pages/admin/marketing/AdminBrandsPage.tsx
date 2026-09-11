import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import BrandReadinessPanel from './BrandReadinessPanel';
import {
  listBrands,
  getBrandSendReadiness,
  type Brand,
  type BrandSendReadiness,
  type ScopeMode,
} from '../../../services/adminBrandApi';

/**
 * Brand administration — brands, their sending domains, and whether they can actually send.
 *
 * This page is the consumer for `brandSendReadiness()` and `listBrandSenderProfiles()`, which
 * existed in the codebase and were called by nothing: the deliverability picture was computed
 * correctly and reachable from nowhere.
 *
 * All rendering lives in `BrandReadinessPanel`, which takes its entire state as props. This
 * shell only fetches. That split is what makes the four empty states testable as prop
 * combinations instead of as mocked network conditions.
 */

function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [scopeMode, setScopeMode] = useState<ScopeMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<BrandSendReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { brands: rows, scope_mode } = await listBrands();
      setBrands(rows);
      setScopeMode(scope_mode);
      setFetchedAt(new Date().toISOString());
      // Select the first brand so the panel has something to show, but only when the operator
      // has not already chosen one - re-selecting on every refresh would fight the user.
      setSelectedBrandId((current) => current ?? rows[0]?.id ?? null);
    } catch {
      // The message matters: "could not load" and "you have no brands" are different facts and
      // the panel renders them differently.
      setError('The brand list could not be loaded.');
      setBrands([]);
      setScopeMode(null);
      setFetchedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  useEffect(() => {
    if (!selectedBrandId) return;
    let cancelled = false;
    setReadinessLoading(true);
    getBrandSendReadiness(selectedBrandId)
      .then((r) => { if (!cancelled) setReadiness(r); })
      // A readiness failure must not be shown as "nothing configured" — that would turn a
      // server error into a false statement about the brand's setup.
      .catch(() => { if (!cancelled) setReadiness(null); })
      .finally(() => { if (!cancelled) setReadinessLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrandId]);

  /**
   * Derived, never a literal. `updatedAt` is the real fetch time or null — never `new Date()`,
   * which would report the moment this component rendered as the data's freshness.
   */
  const trust: TrustSignal = useMemo(() => ({
    level: error ? 'error' : loading || !fetchedAt ? 'unverified' : 'live',
    source: 'brands',
    updatedAt: fetchedAt,
    summary: error
      ? 'The brand list failed to load. Nothing on this page is current.'
      : loading || !fetchedAt
        ? 'Brand data has not loaded yet.'
        : `${brands.length} brand${brands.length === 1 ? '' : 's'} in scope.`,
    href: '/admin/trust',
    pillars: [{
      name: 'Scope',
      status: error ? 'error' : scopeMode === 'denied' ? 'unverified' : 'live',
      evidence: [{ label: 'Scope mode', value: scopeMode ?? 'not loaded' }],
    }],
  }), [error, loading, fetchedAt, brands.length, scopeMode]);

  return (
    <>
      <PageHeader
        title="Brands"
        icon="price-tag-3-line"
        subtitle="Sending domains, sender profiles, and whether each brand can actually send."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Brands' }]}
        trust={trust}
      />
      <SectionCard title="Send readiness" icon="mail-check-line" padded={false}>
        <BrandReadinessPanel
          loading={loading}
          error={error}
          brands={brands}
          scopeMode={scopeMode}
          selectedBrandId={selectedBrandId}
          readiness={readiness}
          readinessLoading={readinessLoading}
          onSelectBrand={setSelectedBrandId}
          onRetry={fetchBrands}
        />
      </SectionCard>
    </>
  );
}

export default AdminBrandsPage;
