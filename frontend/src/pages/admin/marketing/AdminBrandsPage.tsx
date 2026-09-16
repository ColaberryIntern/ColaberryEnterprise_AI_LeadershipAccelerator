import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import BrandReadinessPanel from './BrandReadinessPanel';
import ChannelAccountsPanel from './ChannelAccountsPanel';
import {
  getVaultStatus,
  getLinkedInStatus,
  listChannelAccounts,
  revokeChannelAccount,
  startLinkedInConnect,
  errorMessageOf,
  type ChannelAccount,
  type VaultStatus,
} from '../../../services/channelAccountApi';
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
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsBusy, setAccountsBusy] = useState(false);
  const [linkedInConfigured, setLinkedInConfigured] = useState<boolean | null>(null);
  const [connectNotice, setConnectNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // LinkedIn sends the browser back here after consent with ?linkedin=connected|error. Read it
  // once, say what happened in words, and clear it from the address bar so a reload does not
  // repeat the message. Through the router, not window.location, so the page behaves the same
  // wherever it is mounted.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const outcome = params.get('linkedin');
    if (!outcome) return;
    if (outcome === 'connected') {
      setConnectNotice({ tone: 'success', text: 'LinkedIn account connected. Posts for this brand can now publish directly.' });
      const brand = params.get('brand');
      if (brand) setSelectedBrandId(brand);
    } else {
      setConnectNotice({ tone: 'danger', text: connectFailureText(params.get('reason')) });
    }
    // Consuming the query changes location.search, which re-runs this effect once more; it then
    // finds no `linkedin` key and returns. No dependency is hidden to stop that.
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    getLinkedInStatus().then((s) => setLinkedInConfigured(s.configured)).catch(() => setLinkedInConfigured(false));
  }, []);

  const handleConnect = useCallback(async () => {
    if (!selectedBrandId) return;
    setAccountsBusy(true);
    try {
      const { url } = await startLinkedInConnect(selectedBrandId);
      // The whole window goes to LinkedIn; it comes back to this page via the callback.
      window.location.assign(url);
    } catch (err) {
      setConnectNotice({ tone: 'danger', text: errorMessageOf(err, 'The LinkedIn connection could not be started.') });
      setAccountsBusy(false);
    }
  }, [selectedBrandId]);

  /**
   * Accounts and vault status are fetched together because the panel cannot tell an honest
   * story with only one of them: an empty list means something different depending on whether
   * connecting is possible at all.
   */
  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const [status, rows] = await Promise.all([
        getVaultStatus(),
        listChannelAccounts(selectedBrandId ? { brand_id: selectedBrandId } : {}),
      ]);
      setVault(status);
      setAccounts(rows);
    } catch (err) {
      setAccountsError(errorMessageOf(err, 'Connected accounts could not be loaded.'));
    } finally {
      setAccountsLoading(false);
    }
  }, [selectedBrandId]);

  useEffect(() => { void fetchAccounts(); }, [fetchAccounts]);

  const handleRevoke = useCallback(async (accountId: string) => {
    setAccountsBusy(true);
    try {
      await revokeChannelAccount(accountId);
      await fetchAccounts();
    } catch (err) {
      setAccountsError(errorMessageOf(err, 'The account could not be disconnected.'));
    } finally {
      setAccountsBusy(false);
    }
  }, [fetchAccounts]);

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
      <SectionCard title="Connected accounts" icon="links-line" padded={false}>
        {connectNotice && (
          <div className={`alert alert-${connectNotice.tone} m-3 mb-0 py-2 small`} role="status" data-testid="linkedin-connect-notice">
            {connectNotice.text}
          </div>
        )}
        <ChannelAccountsPanel
          loading={accountsLoading}
          error={accountsError}
          vault={vault}
          accounts={accounts}
          brandId={selectedBrandId}
          // The sign-in flow exists; what can still be missing is the LinkedIn app itself (the
          // server has no client id/secret). Said in words rather than as a dead button.
          connectDisabledReason={linkedInConfigured === false
            ? 'LinkedIn is not configured on this server yet (LINKEDIN_CLIENT_ID / SECRET / REDIRECT_URI). Networks stay in handoff mode until it is.'
            : null}
          busy={accountsBusy}
          onConnect={handleConnect}
          onRevoke={handleRevoke}
          onRetry={fetchAccounts}
        />
      </SectionCard>
    </>
  );
}

/** The callback's `reason` codes, in words an operator can act on. */
export function connectFailureText(reason: string | null): string {
  switch (reason) {
    case 'cancelled': return 'The LinkedIn connection was cancelled before finishing. Nothing was saved.';
    case 'StateExpired': return 'The LinkedIn sign-in took longer than ten minutes and expired. Start it again.';
    case 'StateInvalid': return 'The LinkedIn sign-in could not be verified. Start it again from this page.';
    case 'ExchangeFailed': return 'LinkedIn refused the sign-in code. Start the connection again.';
    case 'VaultUnavailable': return 'The credential store is not configured on this server, so the account could not be saved.';
    case 'BrandNotFound': return 'The brand this connection was started for no longer exists.';
    case 'provider_refused': return 'LinkedIn refused the connection. Check the app is approved for Share on LinkedIn and try again.';
    default: return `The LinkedIn connection failed${reason ? ` (${reason})` : ''}. Start it again; if it repeats, check the server log.`;
  }
}

export default AdminBrandsPage;
