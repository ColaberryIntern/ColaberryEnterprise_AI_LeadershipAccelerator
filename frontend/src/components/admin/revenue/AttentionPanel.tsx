import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, StatusBadge } from '../shell';
import { AttentionRow } from '../../../services/subscriptionAnalyticsApi';
import { PLAN_LABEL, fmtDate } from './format';

interface Props {
  rows: AttentionRow[];
}

const KIND_LABEL: Record<AttentionRow['kind'], string> = {
  lapsed: 'Lapsed — access may be stale',
  failed: 'Failed checkout',
};

/** Needs-attention list: lapsed subscriptions (period ended, no renewal) and
 *  failed checkout attempts. Computed from existing data — reporting only, no
 *  access is changed by this dashboard. Sits above every other section since
 *  these are the accounts most likely to need a human to act. */
export default function AttentionPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="alert alert-success py-2 d-flex align-items-center gap-2 mb-3">
        <i className="ri-checkbox-circle-line" aria-hidden="true"></i>
        <span className="small">No lapsed subscriptions or failed payments right now.</span>
      </div>
    );
  }

  return (
    <SectionCard
      title={`Needs attention (${rows.length})`}
      subtitle="Lapsed subscriptions and failed payments, most urgent first."
      icon="alarm-warning-line"
      padded={false}
      className="border-start border-3 border-danger mb-3"
    >
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Payer</th><th>Plan</th><th>Issue</th><th>Since</th><th className="text-end">Overdue</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.enrollment_id}`}>
                <td>
                  <div className="fw-medium">{r.payer_name}</div>
                  <div className="small text-muted"><code>{r.payer_email}</code></div>
                </td>
                <td className="small text-muted">{PLAN_LABEL[r.plan]}</td>
                <td><StatusBadge label={KIND_LABEL[r.kind]} tone="danger" /></td>
                <td className="small text-muted text-nowrap">{fmtDate(r.reference_date)}</td>
                <td className="text-end small text-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {r.kind === 'lapsed' ? `${r.days_overdue}d` : '—'}
                </td>
                <td className="text-end">
                  <Link
                    to={`/admin/accelerator?enrollment=${r.enrollment_id}&name=${encodeURIComponent(r.payer_name)}`}
                    className="btn btn-sm btn-outline-secondary"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
