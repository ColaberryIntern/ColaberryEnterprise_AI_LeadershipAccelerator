import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import { getRevenuePayments, RevenueTransaction, RevenueSummary } from '../../services/revenueApi';
import { getSubscriptionAnalytics, SubscriptionAnalytics } from '../../services/subscriptionAnalyticsApi';
import { issueRefund } from '../../services/refundApi';
import AttentionPanel from '../../components/admin/revenue/AttentionPanel';
import SubscriptionKpiRow from '../../components/admin/revenue/SubscriptionKpiRow';
import PlanBreakdownCard from '../../components/admin/revenue/PlanBreakdownCard';
import UpcomingPaymentsCard from '../../components/admin/revenue/UpcomingPaymentsCard';
import TenureRetentionFunnel from '../../components/admin/revenue/TenureRetentionFunnel';
import PaymentsLedgerTable from '../../components/admin/revenue/PaymentsLedgerTable';
import { money } from '../../components/admin/revenue/format';

function AdminRevenueDashboardPage() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [txns, setTxns] = useState<RevenueTransaction[]>([]);
  const [analytics, setAnalytics] = useState<SubscriptionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [payments, subs] = await Promise.all([getRevenuePayments(), getSubscriptionAnalytics()]);
      setSummary(payments.summary);
      setTxns(payments.transactions);
      setAnalytics(subs);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load revenue data');
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
        subtitle="Subscription health and every payment collected through PaySimple."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Revenue' }]}
        actions={<Link to="/admin/refunds" className="btn btn-sm btn-danger">Issue refund</Link>}
      />

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {notice && <div className="alert alert-success py-2">{notice}</div>}

      {analytics && <AttentionPanel rows={analytics.attention} />}

      {analytics && <SubscriptionKpiRow kpis={analytics.kpis} />}

      {analytics && (
        <div className="row g-3 mb-3">
          <div className="col-lg-6"><PlanBreakdownCard rows={analytics.planBreakdown} /></div>
          <div className="col-lg-6"><TenureRetentionFunnel buckets={analytics.tenureFunnel} /></div>
        </div>
      )}

      {analytics && (
        <div className="row g-3 mb-3">
          <div className="col-12"><UpcomingPaymentsCard payments={analytics.upcomingPayments} /></div>
        </div>
      )}

      <SectionCard title="Cash collected" subtitle="Real cash reconciliation — a different lens than the subscription KPIs above." icon="safe-2-line">
        <div className="row g-3">
          <div className="col-6 col-lg-3"><StatCard label="Collected" value={money(summary?.collected || 0)} icon="money-dollar-circle-line" tone="success" hint="Real cash · matches the dashboard" /></div>
          <div className="col-6 col-lg-3"><StatCard label="Memberships" value={money(summary?.memberships || 0)} icon="vip-crown-2-line" tone="primary" hint={`${summary?.membershipCount || 0} active`} /></div>
          <div className="col-6 col-lg-3"><StatCard label="Open House deposits" value={money(summary?.deposits || 0)} icon="ticket-2-line" tone="info" hint={`${summary?.depositAvailableCount || 0} held · $50 each`} /></div>
          <div className="col-6 col-lg-3"><StatCard label={summary && summary.refunds > 0 ? 'Refunds' : 'Net collected'} value={summary && summary.refunds > 0 ? `−${money(summary.refunds)}` : money(summary?.net || 0)} icon="refund-2-line" tone={summary && summary.refunds > 0 ? 'warning' : 'neutral'} hint={summary && summary.refunds > 0 ? `net ${money(summary.net)}` : `${summary?.refundCount || 0} refunds`} /></div>
        </div>
      </SectionCard>

      {summary && (
        <div className="alert alert-success py-2 d-flex align-items-center gap-2 mt-3">
          <i className="ri-checkbox-circle-line" aria-hidden="true"></i>
          <span className="small">
            <strong>Reconciled</strong> — {money(summary.memberships)} memberships + {money(summary.deposits)} deposits − {money(summary.refunds)} refunds = <strong>{money(summary.collected - summary.refunds)}</strong>, matching the dashboard Revenue tile.
          </span>
        </div>
      )}

      <div className="row g-3 mb-1 mt-1">
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

      <PaymentsLedgerTable summary={summary} txns={txns} onRefund={onRefund} refunding={refunding} />
    </>
  );
}

export default AdminRevenueDashboardPage;
