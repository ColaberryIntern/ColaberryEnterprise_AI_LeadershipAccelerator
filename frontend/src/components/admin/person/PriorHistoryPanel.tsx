import React from 'react';
import { CcppHistory } from '../../../adminOs/personTypes';
import { Stat, fmtDate } from './primitives';

/**
 * What this person did with Colaberry before this platform existed.
 *
 * Sits in Data & trust because that is where the profile answers "how much of
 * this should you believe": for a third of the database (8,408 of 24,771
 * people measured 2026-09-10) the platform's own record starts mid-story, and
 * a reader judging someone on Postgres alone is judging an excerpt.
 *
 * Three states, deliberately distinct:
 *   unavailable   CCPP could not be read. Says so. NOT the same as no history.
 *   no history    Reached CCPP, they are not in it. They are genuinely new.
 *   history       Shown.
 */
export default function PriorHistoryPanel({ history }: { history: CcppHistory | null | undefined }) {
  if (!history) return null;

  if (!history.available) {
    return (
      <div className="alert alert-warning small mb-0">
        <strong>Earlier history could not be read.</strong>
        <div className="mt-1">{history.unavailableReason}</div>
        <div className="mt-1 text-muted">
          This is a gap in the connection, not evidence they have no history.
        </div>
      </div>
    );
  }

  if (history.enrolments.length === 0) {
    return (
      <p className="text-muted small mb-0">
        No record in the previous system. They are new to Colaberry, not a returning customer.
      </p>
    );
  }

  const money = (n: number | null) => (n === null ? null : `$${n.toLocaleString()}`);

  return (
    <>
      <div className="row g-3 mb-3">
        <Stat label="Prior enrolments" value={history.enrolments.length} />
        <Stat
          label="Listed fees"
          value={money(history.totalListedFees)}
          hint="what the courses cost, not what they paid"
        />
        <Stat
          label="Ever placed"
          value={history.everHired === null ? null : (history.everHired ? 'Yes' : 'No')}
          tone={history.everHired ? 'success' : undefined}
        />
        <Stat
          label="Certified"
          value={history.everCertified === null ? null : (history.everCertified ? 'Yes' : 'No')}
          tone={history.everCertified ? 'success' : undefined}
        />
      </div>

      <div className="table-responsive mb-3">
        <table className="table table-sm table-hover mb-0">
          <thead className="table-light">
            <tr><th>Course</th><th>Started</th><th className="text-end">Fee</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {history.enrolments.map((e, i) => (
              <tr key={`${e.className}-${i}`}>
                <td>
                  <div className="fw-medium">{e.className ?? e.courseName ?? 'Unnamed course'}</div>
                  {e.courseFormat && <div className="text-muted small">{e.courseFormat}</div>}
                </td>
                <td className="small text-muted">{fmtDate(e.classStartDate) ?? '—'}</td>
                <td className="text-end">{money(e.fee) ?? '—'}</td>
                <td>
                  {e.hired && <span className="badge bg-success-subtle text-success-emphasis me-1">hired</span>}
                  {e.certified && <span className="badge bg-info-subtle text-info-emphasis me-1">certified</span>}
                  {e.cancelled && <span className="badge bg-danger-subtle text-danger-emphasis me-1">cancelled</span>}
                  {e.reenrolled && <span className="badge bg-secondary-subtle text-secondary-emphasis">re-enrolled</span>}
                  {!e.hired && !e.certified && !e.cancelled && !e.reenrolled && (
                    <span className="text-muted small">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {history.payments ? (
        <p className="small text-muted">
          <strong className="text-body">Actually paid:</strong>{' '}
          {history.payments.paysimpleAmount !== null && (
            <>PaySimple {money(history.payments.paysimpleAmount)} over {history.payments.paysimpleCount} payments. </>
          )}
          {history.payments.paypalAmount ? <>PayPal {money(history.payments.paypalAmount)}.</> : null}
        </p>
      ) : (
        <p className="small text-muted">
          No payment summary on file, so what they actually paid is unknown — the fees above are list prices.
        </p>
      )}

      {history.disc && (
        <div className="border rounded p-3">
          <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
            Working style (DISC)
          </div>
          {history.disc.dominantTrait && (
            <div className="mb-2">
              Strongest trait: <strong>{history.disc.dominantTrait}</strong>
            </div>
          )}
          <div className="d-flex flex-wrap gap-3 small text-muted">
            <span>D <strong className="text-body">{history.disc.dominance ?? '—'}</strong></span>
            <span>I <strong className="text-body">{history.disc.influencer ?? '—'}</strong></span>
            <span>S <strong className="text-body">{history.disc.steadiness ?? '—'}</strong></span>
            <span>C <strong className="text-body">{history.disc.compliance ?? '—'}</strong></span>
            <span>Leadership <strong className="text-body">{history.disc.leadership ?? '—'}</strong></span>
            <span>Negotiation <strong className="text-body">{history.disc.negotiation ?? '—'}</strong></span>
            <span>Goal focus <strong className="text-body">{history.disc.goalOrientation ?? '—'}</strong></span>
          </div>
        </div>
      )}
    </>
  );
}
