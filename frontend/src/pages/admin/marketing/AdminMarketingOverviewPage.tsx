import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionCard, EmptyState } from '../../../components/admin/shell';
import NeedsAttentionQueue, { type AttentionItem, type ExcludedSignal } from './NeedsAttentionQueue';
import {
  getNeedsAttention, getMarketingOverview,
  type MarketingOverview, type OverviewAccount, type UpcomingPost,
} from '../../../services/marketingOpsApi';
import { listBrands, type Brand } from '../../../services/adminBrandApi';
import { expiryPhrase, presentHealth, providerLabel, pluralPosts, scheduleLabel } from './overviewFormat';

/**
 * Marketing Overview - the landing page, rebuilt around the work instead of the numbers.
 *
 * What used to open at /admin/marketing was a 1,478-line analytics dashboard whose default tab
 * was a funnel chart. It contained no link to Brands, the Composer, the Calendar, the Content
 * queue or the Publishing queue - so the first screen answered "how did we perform?" to a
 * person who had opened it to find out what to do next. The analytics did not get worse; they
 * moved to /admin/marketing/performance, one click away, where they remain the right answer to
 * the question they actually answer.
 *
 * This page answers four questions and nothing else:
 *
 *   what needs me?           -> the attention queue
 *   what is about to go out? -> the next posts, soonest first
 *   can we still publish?    -> account health, before a token dies rather than after
 *   how did it go?           -> one line, linking to Performance
 *
 * Every block is a door into the page behind it. That is the property the old landing page
 * lacked entirely, and it is why the tab read as a pile of loose parts.
 */

const ALL = '__all__';

function HealthDot({ tone }: { tone: string }) {
  return (
    <span
      className={`d-inline-block rounded-circle bg-${tone} me-2`}
      style={{ width: 8, height: 8 }}
      aria-hidden="true"
    />
  );
}

function UpcomingRow({ post }: { post: UpcomingPost }) {
  const channels = post.providers.length
    ? post.providers.map(providerLabel).join(' · ')
    : 'No channel chosen';
  return (
    <Link
      to={`/admin/marketing/composer/${post.id}`}
      className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none border-bottom"
    >
      <span
        className={`small fw-semibold text-nowrap ${post.late ? 'text-danger' : 'text-body'}`}
        style={{ minWidth: '9.5rem' }}
      >
        {scheduleLabel(post.scheduled_for)}
      </span>
      <span className="flex-grow-1 text-truncate text-body">{post.title || 'Untitled post'}</span>
      <span className="small text-muted text-nowrap d-none d-md-inline">{channels}</span>
      {post.late && <span className="badge bg-danger-subtle text-danger-emphasis">Late</span>}
      {post.status === 'publishing' && (
        <span className="badge bg-info-subtle text-info-emphasis">Publishing</span>
      )}
    </Link>
  );
}

function AccountRow({ account }: { account: OverviewAccount }) {
  const { label, tone } = presentHealth(account.health);
  const phrase = expiryPhrase(account.expires_in_days);
  return (
    <div className="d-flex align-items-center gap-3 px-3 py-2 border-bottom">
      <span className="fw-semibold small text-nowrap" style={{ minWidth: '7rem' }}>
        {providerLabel(account.provider)}
      </span>
      <span className="flex-grow-1 text-truncate small">
        {account.display_name}
        {account.brand_name && <span className="text-muted"> {'·'} {account.brand_name}</span>}
      </span>
      <span className={`small text-nowrap text-${tone}`}>
        <HealthDot tone={tone} />
        {label}
      </span>
      {phrase && <span className="small text-muted text-nowrap d-none d-lg-inline">{phrase}</span>}
    </div>
  );
}

export default function AdminMarketingOverviewPage() {
  const [brand, setBrand] = useState<string>(ALL);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionExcluded, setAttentionExcluded] = useState<ExcludedSignal[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [attentionError, setAttentionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBrands()
      // A failed brand list leaves the selector on "All brands", which narrows nothing and
      // claims nothing - the right fallback rather than an error the operator cannot act on.
      .then((r) => { if (!cancelled) setBrands(r.brands); })
      .catch(() => { if (!cancelled) setBrands([]); });
    return () => { cancelled = true; };
  }, []);

  const loadOverview = useCallback(async (b: string) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      setOverview(await getMarketingOverview(b === ALL ? undefined : { brand_id: b }));
    } catch {
      // Cleared, not left stale: the previous brand's schedule under the new brand's label is
      // worse than an honest error, because it looks like an answer.
      setOverview(null);
      setOverviewError('The overview could not be loaded.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadAttention = useCallback(async (b: string) => {
    setAttentionLoading(true);
    setAttentionError(null);
    try {
      const q = await getNeedsAttention(b === ALL ? undefined : { brand_id: b });
      setAttentionItems(q.items);
      setAttentionExcluded(q.excluded);
    } catch {
      setAttentionItems([]);
      setAttentionExcluded([]);
      setAttentionError('The attention queue could not be loaded.');
    } finally {
      setAttentionLoading(false);
    }
  }, []);

  useEffect(() => { loadOverview(brand); }, [loadOverview, brand]);
  useEffect(() => { loadAttention(brand); }, [loadAttention, brand]);

  const upcoming = overview?.upcoming ?? [];
  const accounts = overview?.accounts ?? [];
  const handoff = overview?.handoff_providers ?? [];
  const usable = accounts.filter((a) => presentHealth(a.health).usable).length;
  const ready = overviewLoading || overviewError !== null;

  return (
    <>
      <PageHeader
        title="Marketing"
        icon="broadcast-line"
        subtitle="What needs you, what is going out, and whether we can still publish."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Marketing' }]}
        actions={<Link className="btn btn-sm btn-primary" to="/admin/marketing/composer">+ New post</Link>}
      />

      <div className="px-3 py-3">
        <div className="d-flex align-items-center gap-2 mb-3">
          <label htmlFor="overview-brand" className="small text-muted mb-0">Brand</label>
          <select
            id="overview-brand"
            className="form-select form-select-sm"
            style={{ maxWidth: '18rem' }}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          >
            <option value={ALL}>All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="row g-3">
          <div className="col-12 col-xl-7">
            <SectionCard title="Needs you" icon="alarm-warning-line" padded={false} className="mb-3">
              <NeedsAttentionQueue
                loading={attentionLoading}
                error={attentionError}
                items={attentionItems}
                excluded={attentionExcluded}
                onRetry={() => loadAttention(brand)}
              />
            </SectionCard>

            <SectionCard
              title="Going out next"
              icon="send-plane-line"
              padded={false}
              actions={<Link className="btn btn-sm btn-link p-0" to="/admin/marketing/calendar">View calendar</Link>}
            >
              {overviewLoading && <div className="px-3 py-4 text-center text-muted small">Loading</div>}
              {!overviewLoading && overviewError && (
                <div className="px-3 py-3 d-flex align-items-center justify-content-between gap-2">
                  <span className="small text-danger">{overviewError}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => loadOverview(brand)}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!ready && upcoming.length === 0 && (
                <EmptyState
                  icon="calendar-schedule-line"
                  title="Nothing scheduled"
                  description="When you schedule a post it appears here, soonest first, with the account it will go out from."
                  actionLabel="Write a post"
                  to="/admin/marketing/composer"
                />
              )}
              {!ready && upcoming.map((p) => <UpcomingRow key={p.id} post={p} />)}
              {overview?.upcoming_truncated && (
                <div className="px-3 py-2 small text-muted">
                  More are scheduled than fit here.{' '}
                  <Link to="/admin/marketing/calendar">See the calendar</Link>.
                </div>
              )}
            </SectionCard>
          </div>

          <div className="col-12 col-xl-5">
            <SectionCard
              title="Accounts"
              icon="link"
              padded={false}
              className="mb-3"
              actions={<Link className="btn btn-sm btn-link p-0" to="/admin/marketing/brands">Manage brands</Link>}
            >
              {overviewLoading && <div className="px-3 py-4 text-center text-muted small">Loading</div>}
              {!ready && accounts.length === 0 && (
                <EmptyState
                  icon="plug-line"
                  title="No accounts connected"
                  description="Connect a LinkedIn account and posts can go out from here. Until then every network is posted by hand."
                  actionLabel="Connect an account"
                  to="/admin/marketing/brands"
                />
              )}
              {!ready && accounts.map((a) => <AccountRow key={a.id} account={a} />)}
              {!ready && handoff.length > 0 && (
                <div className="px-3 py-2 small text-muted">
                  {/* Named rather than hidden: an operator who does not know a network is
                      hand-posted assumes a scheduled post went out on it. */}
                  Posted by hand: {handoff.map(providerLabel).join(' · ')}
                </div>
              )}
            </SectionCard>

            <SectionCard title={`Last ${overview?.recent.window_days ?? 30} days`} icon="line-chart-line">
              <div className="d-flex align-items-baseline justify-content-between gap-3">
                <div>
                  <div className="h3 mb-0 fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {overviewLoading ? '—' : pluralPosts(overview?.recent.published ?? 0)}
                  </div>
                  {/* Counts receipts from the networks, not posts we believed we sent. */}
                  <div className="small text-muted">published to a network</div>
                </div>
                <Link className="btn btn-sm btn-outline-secondary text-nowrap" to="/admin/marketing/performance">
                  Performance
                </Link>
              </div>
              <hr className="my-3" />
              <div className="small text-muted">
                {accounts.length === 0
                  ? 'No accounts connected yet.'
                  : `${usable} of ${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} can publish today.`}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}
