import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import BrandReadinessPanel from './BrandReadinessPanel';
import ChannelAccountsPanel from './ChannelAccountsPanel';
import {
  getVaultStatus,
  listChannelAccounts,
  listConnectors,
  revokeChannelAccount,
  startConnect,
  errorMessageOf,
  type ChannelAccount,
  type ConnectorKey,
  type ConnectorStatus,
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
  const [connectors, setConnectors] = useState<ConnectorStatus[] | null>(null);
  const [connectorsError, setConnectorsError] = useState<string | null>(null);
  const [connectNotice, setConnectNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // LinkedIn sends the browser back here after consent with ?linkedin=connected|error. Read it
  // once, say what happened in words, and clear it from the address bar so a reload does not
  // repeat the message. Through the router, not window.location, so the page behaves the same
  // wherever it is mounted.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Every other network returns ?connected=<network> or ?connect_error=<reason>.
    const generic = genericConnectNotice(params);
    if (generic) {
      setConnectNotice(generic);
      const brand = params.get('brand');
      if (brand) setSelectedBrandId(brand);
      navigate(location.pathname, { replace: true });
      return;
    }
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
    listConnectors()
      .then((c) => { setConnectors(c); setConnectorsError(null); })
      .catch(() => setConnectorsError('The list of networks could not be loaded. Reload the page to try again.'));
  }, []);

  const handleConnect = useCallback(async (connector: ConnectorKey) => {
    if (!selectedBrandId) return;
    setAccountsBusy(true);
    try {
      const { url } = await startConnect(connector, selectedBrandId);
      // The whole window goes to the network; it comes back to this page via the callback.
      window.location.assign(url);
    } catch (err) {
      setConnectNotice({ tone: 'danger', text: errorMessageOf(err, 'The connection could not be started.') });
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
          connectors={connectors}
          connectorsError={connectorsError}
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

/** Names for the networks' return messages; the Brands list itself comes from the server. */
const NETWORK_NAMES: Record<string, string> = {
  linkedin_org: 'LinkedIn Company Page',
  meta: 'Facebook & Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
};

/**
 * What to say after any network other than LinkedIn personal profiles sends the browser back.
 * Null when the query carries no outcome. Exported for the test: these sentences are what an
 * operator reads at the exact moment they find out whether it worked.
 */
export function genericConnectNotice(params: URLSearchParams): { tone: 'success' | 'danger'; text: string } | null {
  const connected = params.get('connected');
  const failed = params.get('connect_error');
  if (!connected && !failed) return null;
  const name = NETWORK_NAMES[connected ?? params.get('connector') ?? ''];
  // No known network (a hand-edited URL, or UnknownConnector): say it plainly without a name,
  // rather than building "The The network connection failed" from a placeholder.
  if (!name) {
    return connected
      ? { tone: 'success', text: 'Connected. The new accounts are listed below.' }
      : { tone: 'danger', text: `The connection failed${failed ? ` (${failed})` : ''}. Start it again from this page.` };
  }

  if (connected) {
    const n = Number(params.get('count') ?? '1');
    const accounts = `${n} account${n === 1 ? '' : 's'}`;
    return {
      tone: 'success',
      text: `${name} connected: ${accounts} added to this brand. Until direct publishing is switched on for ${name}, its posts are prepared for you to publish by hand.`,
    };
  }

  switch (failed) {
    case 'cancelled': return { tone: 'danger', text: `The ${name} connection was cancelled before finishing. Nothing was saved.` };
    case 'StateExpired': return { tone: 'danger', text: `The ${name} sign-in took longer than ten minutes and expired. Start it again.` };
    case 'StateInvalid':
    case 'StateConnectorMismatch': return { tone: 'danger', text: `The ${name} sign-in could not be verified. Start it again from this page.` };
    case 'NoAccountsFound': return { tone: 'danger', text: `${name} returned no accounts. In its sign-in window, choose the pages or accounts to connect, and check you are an admin of them.` };
    case 'ProviderNotConfigured': return { tone: 'danger', text: `${name} is not set up on this server yet. Open "What it needs" under Connect a network.` };
    case 'BrandNotFound': return { tone: 'danger', text: 'The brand this connection was started for no longer exists.' };
    case 'ExchangeFailed': return { tone: 'danger', text: `${name} refused the sign-in code. Start the connection again.` };
    case 'IdentityFailed': return { tone: 'danger', text: `${name} signed you in but would not say which account it was. Check the app permissions and try again.` };
    case 'VaultUnavailable': return { tone: 'danger', text: 'The credential store is unavailable, so the account could not be saved securely. Nothing was connected.' };
    case 'provider_refused': return { tone: 'danger', text: `${name} refused the connection. Check the app is approved for the permissions it asks for.` };
    default: return { tone: 'danger', text: `The ${name} connection failed${failed ? ` (${failed})` : ''}. Start it again; if it repeats, check the server log.` };
  }
}
