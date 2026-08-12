import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, StatusBadge } from '../shell';
import { RevenueTransaction, RevenueSummary } from '../../../services/revenueApi';
import { money, fmtAbs, timeAgo } from './format';

interface Props {
  summary: RevenueSummary | null;
  txns: RevenueTransaction[];
  onRefund: (t: RevenueTransaction) => void;
  refunding: string | null;
  onOpenHistory: (enrollmentId: string, name: string) => void;
}

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

/** The reconciled cash ledger (memberships + Open House deposits + refunds),
 *  newest first — unchanged from the original /admin/revenue rebuild, just
 *  extracted into its own file so the page component stays a manageable size. */
export default function PaymentsLedgerTable({ summary, txns, onRefund, refunding, onOpenHistory }: Props) {
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns.filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (q && !t.payer_name.toLowerCase().includes(q) && !t.payer_email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txns, filter, query]);

  const countedShown = filtered.filter((t) => t.counted).length;

  return (
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
                  {t.enrollment_id ? (
                    <button
                      type="button"
                      className="btn btn-link p-0 fw-medium text-decoration-none text-body"
                      style={{ verticalAlign: 'baseline' }}
                      onClick={() => onOpenHistory(t.enrollment_id as string, t.payer_name)}
                      title={`View ${t.payer_name}'s payment history & timeline`}
                    >
                      {t.payer_name}
                    </button>
                  ) : (
                    <div className="fw-medium">{t.payer_name}</div>
                  )}
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
  );
}
