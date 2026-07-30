import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, StatusBadge } from '../shell';
import { UpcomingPayment } from '../../../services/subscriptionAnalyticsApi';
import { PLAN_LABEL, fmtDate, money } from './format';

interface Props {
  payments: UpcomingPayment[];
  limit?: number;
}

const urgencyTone = (inDays: number): 'danger' | 'warning' | 'neutral' => {
  if (inDays <= 3) return 'danger';
  if (inDays <= 14) return 'warning';
  return 'neutral';
};

/** Active subscriptions soonest-to-renew first — since V1 billing is manual
 *  renewal (not auto-charged), this is the "who needs a reminder" list. */
export default function UpcomingPaymentsCard({ payments, limit = 12 }: Props) {
  const shown = payments.slice(0, limit);
  return (
    <SectionCard
      title="Upcoming renewals"
      subtitle="Next payment due, soonest first — renewal is a manual checkout, not an auto-charge."
      icon="calendar-check-line"
      padded={false}
    >
      {shown.length === 0 ? (
        <p className="text-muted small px-3 py-3 mb-0">No active subscriptions with an upcoming renewal date.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Payer</th><th>Plan</th><th>Due</th><th className="text-end">Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.enrollment_id}>
                  <td>
                    <div className="fw-medium">{p.payer_name}</div>
                    <div className="small text-muted"><code>{p.payer_email}</code></div>
                  </td>
                  <td className="small text-muted">{PLAN_LABEL[p.plan]}</td>
                  <td className="small text-nowrap">
                    {fmtDate(p.due_date)} <StatusBadge label={`${p.in_days}d`} tone={urgencyTone(p.in_days)} />
                  </td>
                  <td className="text-end fw-semibold text-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(p.amount)}
                  </td>
                  <td className="text-end">
                    <Link
                      to={`/admin/accelerator?enrollment=${p.enrollment_id}&name=${encodeURIComponent(p.payer_name)}`}
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
      )}
    </SectionCard>
  );
}
