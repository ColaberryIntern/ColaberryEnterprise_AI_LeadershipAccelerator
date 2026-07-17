import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { lookupPayment, issueRefund, listRefunds, PaymentLookup, RefundRow } from '../../services/refundApi';

const money = (cents: number): string => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string): string => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const statusTone = (s: string): 'success' | 'warning' | 'danger' | 'neutral' =>
  s === 'succeeded' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'danger' : 'neutral';

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentId, setPaymentId] = useState('');
  const [lookup, setLookup] = useState<PaymentLookup | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchRefunds = useCallback(async () => {
    try { setRefunds(await listRefunds()); }
    catch (err: any) { setError(err?.response?.data?.error || 'Failed to load refunds'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRefunds(); }, [fetchRefunds]);

  const onLookup = async () => {
    setError(null); setNotice(null); setLookup(null);
    const id = paymentId.trim();
    if (!id) { setError('Enter a PaySimple payment ID'); return; }
    setBusy(true);
    try {
      const p = await lookupPayment(id);
      setLookup(p);
    } catch (err: any) {
      const code = err?.response?.data?.error;
      setError(code === 'payment_not_found' ? 'No PaySimple payment found with that ID.'
        : code === 'billing_unconfigured' ? 'Payments are not configured in this environment.'
        : err?.response?.data?.message || 'Could not look up that payment.');
    } finally { setBusy(false); }
  };

  const onRefund = async () => {
    if (!lookup) return;
    setError(null); setNotice(null);
    const label = `${lookup.method === 'void' ? 'void' : 'refund'} of ${money(lookup.refundable_cents)} for ${lookup.name || lookup.email || lookup.id}`;
    if (!window.confirm(`Confirm full ${label}? This moves money via PaySimple and cannot be undone here.`)) return;
    setBusy(true);
    try {
      const { refund } = await issueRefund({ payment_id: lookup.id, reason: reason.trim() || undefined });
      setNotice(`${refund.method === 'void' ? 'Voided' : 'Refunded'} ${money(refund.amount_cents)}${refund.voided_credit_cents ? ` · voided ${money(refund.voided_credit_cents)} account credit` : ''}.`);
      setLookup(null); setPaymentId(''); setReason('');
      fetchRefunds();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const msg = err?.response?.data?.message;
      setError(code === 'already_reversed' ? 'That payment was already voided/refunded.'
        : code === 'not_settled' ? (msg || 'That payment has not settled yet — refund it after it settles.')
        : code === 'partial_unsupported' ? (msg || 'Partial refunds are not supported.')
        : code === 'invalid_amount' ? (msg || 'That exceeds the refundable balance.')
        : code === 'paysimple_error' ? `PaySimple refused the refund: ${msg || 'unknown error'}`
        : msg || 'Refund failed.');
      fetchRefunds(); // a failed row is recorded — surface it
    } finally { setBusy(false); }
  };

  const summary = useMemo(() => {
    const succeeded = refunds.filter((r) => r.status === 'succeeded');
    return {
      count: succeeded.length,
      total: succeeded.reduce((s, r) => s + r.amount_cents, 0),
      failed: refunds.filter((r) => r.status === 'failed').length,
      creditVoided: succeeded.reduce((s, r) => s + (r.voided_credit_cents || 0), 0),
    };
  }, [refunds]);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div></div>;
  }

  return (
    <>
      <PageHeader
        title="Refunds"
        icon="refund-2-line"
        subtitle="Look up a PaySimple payment and issue a refund or void. Refunding a payment also voids any account credit it granted."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Refunds' }]}
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3"><StatCard label="Refunds" value={summary.count} icon="refund-2-line" tone="primary" /></div>
          <div className="col-6 col-lg-3"><StatCard label="Refunded" value={money(summary.total)} icon="money-dollar-circle-line" tone="success" /></div>
          <div className="col-6 col-lg-3"><StatCard label="Credit voided" value={money(summary.creditVoided)} icon="coupon-3-line" tone="info" /></div>
          <div className="col-6 col-lg-3"><StatCard label="Failed" value={summary.failed} icon="error-warning-line" tone={summary.failed ? 'warning' : 'neutral'} /></div>
        </div>
      </PageHeader>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {notice && <div className="alert alert-success py-2">{notice}</div>}

      <SectionCard title="Issue a refund" icon="refund-2-line" className="mb-4">
        <div className="row g-2 align-items-end">
          <div className="col-md-6">
            <label className="form-label small fw-medium">PaySimple payment ID</label>
            <div className="d-flex gap-2">
              <input className="form-control form-control-sm" value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onLookup(); }}
                placeholder="e.g. 154860344" />
              <button className="btn btn-sm btn-outline-primary" disabled={busy} onClick={onLookup}>Look up</button>
            </div>
            <span className="text-muted small">Find the ID in PaySimple or the payment-notification email.</span>
          </div>
        </div>

        {lookup && (
          <div className="mt-3 border-top pt-3">
            <div className="row g-3">
              <div className="col-md-3"><div className="small text-muted">Payer</div><div className="fw-semibold">{lookup.name || '—'}</div><div className="small text-muted">{lookup.email || 'no email on file'}</div></div>
              <div className="col-md-2"><div className="small text-muted">Amount</div><div className="fw-semibold">{money(lookup.amount_cents)}</div></div>
              <div className="col-md-2"><div className="small text-muted">Status</div><div><StatusBadge label={lookup.status} tone="neutral" /></div></div>
              <div className="col-md-2"><div className="small text-muted">Refundable</div><div className="fw-semibold">{money(lookup.refundable_cents)}</div></div>
              <div className="col-md-3"><div className="small text-muted">Method</div><div><StatusBadge label={lookup.method === 'void' ? 'void (in window)' : 'refund (full)'} tone={lookup.method === 'void' ? 'info' : 'primary'} /></div></div>
            </div>
            {!lookup.refundable_now && lookup.refundable_cents > 0 && (
              <div className="alert alert-warning py-2 mt-2 mb-0">
                This payment is <strong>{lookup.status}</strong> and hasn’t settled yet
                {lookup.settles_on ? <> — a refund can be issued after it settles (<strong>~{lookup.settles_on}</strong>).</> : ' — a refund can be issued once it settles.'}
              </div>
            )}
            <div className="row g-2 mt-1">
              <div className="col-md-8">
                <label className="form-label small fw-medium">Reason (optional)</label>
                <input className="form-control form-control-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate charge, customer request" />
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <button className="btn btn-sm btn-danger w-100" disabled={busy || !lookup.refundable_now} onClick={onRefund}>
                  {busy ? 'Processing…' : (lookup.method === 'void' ? `Void ${money(lookup.refundable_cents)}` : `Refund ${money(lookup.refundable_cents)}`)}
                </button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent refunds" icon="history-line" padded={false}>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr><th>When</th><th>Payer</th><th>Payment</th><th>Amount</th><th>Method</th><th>Status</th><th>Credit voided</th><th>By</th></tr>
            </thead>
            <tbody>
              {refunds.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted py-3">No refunds yet.</td></tr>
              ) : refunds.map((r) => (
                <tr key={r.id}>
                  <td className="small text-muted">{fmtDate(r.created_at)}</td>
                  <td>{r.customer_email || '—'}</td>
                  <td className="small"><code>{r.paysimple_payment_id}</code></td>
                  <td className="fw-semibold">{money(r.amount_cents)}</td>
                  <td className="small">{r.method}</td>
                  <td><StatusBadge label={r.status} tone={statusTone(r.status)} />{r.status === 'failed' && r.error && <span className="d-block text-danger small" style={{ maxWidth: 260 }}>{r.error}</span>}</td>
                  <td className="small">{r.voided_credit_cents ? money(r.voided_credit_cents) : '—'}</td>
                  <td className="small text-muted">{r.issued_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
