import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { getRevenuePayments, RevenueTransaction, RevenueSummary } from '../../services/revenueApi';
import { issueRefund } from '../../services/refundApi';

const money = (n: number): string =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtAbs = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

// "just now" / "17m ago" / "5h ago" / "yesterday" / "3d ago" / "Jul 4"
const timeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const typeMeta: Record<RevenueTransaction['type'], { label: string; tone: 'success' | 'info' | 'danger' }> = {
  membership: { label: 'Membership', tone: 'success' },
  deposit: { label: 'Deposit', tone: 'info' },
  refund: { label: 'Refund', tone: 'danger' },
};

const statusTone = (s: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
  const k = (s || '').toLowerCase();
  if (['active', 'settled', 'succeeded'].includes(k)) return 'success';
  if (k === 'available') return 'info';
  if (['pending', 'applied'].includes(k)) return 'warning';
  if (['failed', 'void'].includes(k)) return 'danger';
  return 'neutral';
};

type TypeFilter = 'all' | 'membership' | 'deposit' | 'refund';

function AdminRevenueDashboardPage() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [txns, setTxns] = useState<RevenueTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [refunding, setRefunding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getRevenuePayments();
      setSummary(data.summary);
      setTxns(data.transactions);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefund = async (t: RevenueTransaction) => {
    if (!t.paysimple_payment_id) return;
    setError(null); setNotice(null);
    if (!window.confirm(`Refund ${money(t.amount)} to ${t.payer_name}? This moves money via PaySimple and voids any account credit the payment granted.`)) return;
    setRefunding(t.id);
    try {
      const { refund } = await issueRefund({ payment_id: t.paysimple_payment_id });
      setNotice(`${refund.method === 'void' ? 'Voided' : 'Refunded'} ${money(refund.amount_cents / 100)} for ${t.payer_name}.`);
      await load();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const msg = err?.response?.data?.message;
      setError(
        code === 'already_reversed' ? 'That payment was already voided/refunded.'
          : code === 'not_settled' ? (msg || 'That payment has not settled yet — refund it after it settles.')
          : code === 'paysimple_error' ? `PaySimple refused the refund: ${msg || 'unknown error'}`
          : msg || 'Refund failed.'
      );
    } finally {
      setRefunding(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns.filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (q && !t.payer_name.toLowerCase().includes(q) && !t.payer_email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txns, filter, query]);

  const countedShown = filtered.filter((t) => t.counted).length;

  const pct = (n: number): number => {
    if (!summary) return 0;
    const denom = summary.memberships + summary.deposits || 1;
    return Math.max(2, Math.round((n / denom) * 100));
  };

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div></div>;
  }

  return (
    <>
      <PageHeader
        title="Revenue"
        icon="money-dollar-circle-line"
        subtitle="Every payment collected through PaySimple — memberships, Open House deposits, and refunds."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Revenue' }]}
        actions={<Link to="/admin/refunds" className="btn btn-sm btn-danger">Issue refund</Link>}
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3"><StatCard label="Collected" value={money(summary?.collected || 0)} icon="money-dollar-circle-line" tone="success" hint="Real cash · matches the dashboard" /></div>
          <div className="col-6 col-lg-3"><StatCard label="Memberships" value={money(summary?.memberships || 0)} icon="vip-crown-2-line" tone="primary" hint={`${summary?.membershipCount || 0} active`} /></div>
          <div className="col-6 col-lg-3"><StatCard label="Open House deposits" value={money(summary?.deposits || 0)} icon="ticket-2-line" tone="info" hint={`${summary?.depositAvailableCount || 0} held · $50 each`} /></div>
          <div className="col-6 col-lg-3"><StatCard label={summary && summary.refunds > 0 ? 'Refunds' : 'Net collected'} value={summary && summary.refunds > 0 ? `−${money(summary.refunds)}` : money(summary?.net || 0)} icon="refund-2-line" tone={summary && summary.refunds > 0 ? 'warning' : 'neutral'} hint={summary && summary.refunds > 0 ? `net ${money(summary.net)}` : `${summary?.refundCount || 0} refunds`} /></div>
        </div>
      </PageHeader>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {notice && <div className="alert alert-success py-2">{notice}</div>}

      {summary && (
        <div className="alert alert-success py-2 d-flex align-items-center gap-2">
          <i className="ri-checkbox-circle-line" aria-hidden="true"></i>
          <span className="small">
            <strong>Reconciled</strong> — {money(summary.memberships)} memberships + {money(summary.deposits)} deposits − {money(summary.refunds)} refunds = <strong>{money(summary.collected - summary.refunds)}</strong>, matching the dashboard Revenue tile.
          </span>
        </div>
      )}

      <div className="row g-3 mb-1">
        <div className="col-lg-7">
          <SectionCard title="Collected by type" icon="pie-chart-2-line">
            {summary && ([
              { label: 'Memberships', amount: summary.memberships, color: '#15803d' },
              { label: 'Deposits', amount: summary.deposits, color: '#1f5fd0' },
              { label: 'Refunds', amount: -summary.refunds, color: '#b4302a' },
            ]).map((b) => (
              <div key={b.label} className="d-flex align-items-center gap-3 my-2" style={{ fontSize: 13 }}>
                <span style={{ width: 96, color: 'var(--bs-secondary-color)' }}>{b.label}</span>
                <span className="flex-grow-1" style={{ height: 9, borderRadius: 6, background: 'var(--bs-tertiary-bg)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${pct(Math.abs(b.amount))}%`, background: b.color, borderRadius: 6 }}></span>
                </span>
                <span className="fw-semibold text-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{b.amount < 0 ? '−' : ''}{money(b.amount)}</span>
              </div>
            ))}
          </SectionCard>
        </div>
        <div className="col-lg-5">
          <SectionCard title="Deposits in flight" icon="flight-takeoff-line">
            <div className="d-flex gap-3 align-items-start">
              <div className="fw-bold" style={{ fontSize: 32, lineHeight: 1, color: '#1f5fd0', fontVariantNumeric: 'tabular-nums' }}>{summary?.depositAvailableCount || 0}</div>
              <p className="small text-muted mb-0">
                <strong className="text-body">{money(summary?.deposits || 0)} held</strong> as Open House seat deposits — each a $50 “hold your spot” credit applied to the member’s first subscription charge. Watch how many convert to paid memberships.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title={`All payments (${filtered.length})`} icon="exchange-dollar-line" padded={false}>
        <div className="d-flex justify-content-end align-items-center gap-2 flex-wrap px-3 pt-3 pb-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="Filter by type">
            {(['all', 'membership', 'deposit', 'refund'] as TypeFilter[]).map((f) => (
              <button key={f} type="button" className={`btn ${filter === f ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'membership' ? 'Memberships' : f === 'deposit' ? 'Deposits' : 'Refunds'}
              </button>
            ))}
          </div>
          <input className="form-control form-control-sm" style={{ width: 190 }} placeholder="Search payer…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>When</th><th>Payer</th><th>Type</th><th>Plan</th>
                <th className="text-end">Amount</th><th>Status</th><th>PaySimple ID</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted py-4">No payments match those filters.</td></tr>
              ) : filtered.map((t) => (
                <tr key={t.id} style={t.counted ? undefined : { opacity: 0.62 }}>
                  <td className="small text-muted text-nowrap" title={fmtAbs(t.date)}>{timeAgo(t.date)}</td>
                  <td>
                    <div className="fw-medium">{t.payer_name}</div>
                    <div className="small text-muted"><code>{t.payer_email}</code></div>
                    <div className="d-flex gap-3 mt-1">
                      {t.lead_id != null ? (
                        <Link to={`/admin/leads/${t.lead_id}`} className="small text-decoration-none d-inline-flex align-items-center gap-1" title={`Open lead profile for ${t.payer_name}`}>
                          <i className="ri-contacts-line" aria-hidden="true"></i>Lead
                        </Link>
                      ) : (
                        <span className="small text-muted d-inline-flex align-items-center gap-1" title="No lead record for this email"><i className="ri-contacts-line" aria-hidden="true"></i>Lead</span>
                      )}
                      {t.enrollment_id ? (
                        <Link to={`/admin/accelerator?enrollment=${t.enrollment_id}&name=${encodeURIComponent(t.payer_name)}`} className="small text-decoration-none d-inline-flex align-items-center gap-1" title={`Open student profile for ${t.payer_name}`}>
                          <i className="ri-graduation-cap-line" aria-hidden="true"></i>Student
                        </Link>
                      ) : (
                        <span className="small text-muted d-inline-flex align-items-center gap-1" title="No student record for this payment"><i className="ri-graduation-cap-line" aria-hidden="true"></i>Student</span>
                      )}
                    </div>
                  </td>
                  <td><StatusBadge label={typeMeta[t.type].label} tone={typeMeta[t.type].tone} /></td>
                  <td className="small text-muted">{t.plan || '—'}</td>
                  <td className="text-end fw-semibold text-nowrap" style={{ fontVariantNumeric: 'tabular-nums', color: t.type === 'refund' ? 'var(--bs-danger)' : undefined }}>
                    {t.type === 'refund' ? '−' : ''}{money(t.amount)}
                  </td>
                  <td><StatusBadge label={t.status} tone={statusTone(t.status)} /></td>
                  <td className="small text-muted text-nowrap"><code>{t.paysimple_payment_id || '—'}</code></td>
                  <td className="text-end">
                    {t.refundable && (
                      <button className="btn btn-sm btn-outline-danger" disabled={refunding === t.id} onClick={() => onRefund(t)}>
                        {refunding === t.id ? '…' : 'Refund'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex justify-content-between align-items-center px-3 py-2 small text-muted border-top flex-wrap gap-2">
          <span>Showing {filtered.length} payment{filtered.length === 1 ? '' : 's'} · {countedShown} counted toward revenue</span>
          <span>Counted total: <strong className="text-success" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(summary?.collected || 0)}</strong></span>
        </div>
      </SectionCard>
    </>
  );
}

export default AdminRevenueDashboardPage;
