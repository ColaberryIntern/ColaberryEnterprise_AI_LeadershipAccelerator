import React from 'react';
import { BillingRow } from '../../../adminOs/personTypes';
import SectionCard from '../shell/SectionCard';
import { Unknown } from './primitives';

/**
 * What this person has paid, per enrolment row.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * An unrecorded amount renders as "Not recorded", never as $0 — the same rule
 * the Explorer score follows. A zero payment is a real fact (a $0-to-start
 * account) and an unknown amount is not; collapsing them would make a free
 * Explorer and a billing gap look identical on the one screen where the
 * difference decides whether somebody gets chased for money.
 */
export default function PaymentRecordTab({ billing }: { billing: BillingRow[] }) {
  return (
    <SectionCard title="Billing" padded={false}>
      {billing.length === 0 ? (
        <p className="text-muted small p-4 mb-0 text-center">No enrolment records, so nothing to bill.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm mb-0 align-middle">
            <thead className="table-light">
              <tr><th>Payment status</th><th>Method</th><th className="text-end">Amount paid</th></tr>
            </thead>
            <tbody>
              {billing.map((b) => (
                <tr key={b.enrollmentId}>
                  <td>{b.paymentStatus || <Unknown />}</td>
                  <td>{b.paymentMethod || <Unknown />}</td>
                  {/* Not $0. An unrecorded amount and a zero payment differ. */}
                  <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {b.amountPaid === null || b.amountPaid === undefined
                      ? <Unknown />
                      : `$${Number(b.amountPaid).toLocaleString()}`}
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
