import React, { useState } from 'react';
import { apiErrorMessage, deleteSpend, type SpendRecord } from '../../../../services/adSpendApi';
import { centsToUsd, periodLabel, SOURCE_LABEL } from './adSpendFormat';

/**
 * Every recorded spend row in the last 90 days, newest first. Rows from different sources for the
 * same days are all listed (so a typed figure can be compared with what Meta reported); the report
 * counts only one per campaign per day, which is why this table has no grand total.
 *
 * Delete is two clicks on the row itself, not a browser confirm dialog.
 */

interface Props {
  records: SpendRecord[];
  onChanged: () => void;
}

export default function AdSpendTable({ records, onChanged }: Props) {
  const [arming, setArming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: number) => {
    setError(null);
    try {
      await deleteSpend(id);
      setArming(null);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete that row.'));
    }
  };

  if (records.length === 0) {
    return <p className="small text-muted mb-0" data-testid="spend-empty">No spend recorded in the last 90 days.</p>;
  }

  return (
    <>
      {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}
      <div className="table-responsive">
        <table className="table table-sm align-middle small mb-0" aria-label="Recorded ad spend">
          <thead>
            <tr>
              <th scope="col">Days</th>
              <th scope="col">Campaign</th>
              <th scope="col">Placement</th>
              <th scope="col" className="text-end">Amount</th>
              <th scope="col">Source</th>
              <th scope="col">By</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} data-testid="spend-row">
                <td className="text-nowrap">{periodLabel(r)}</td>
                <td>
                  {r.campaignName || r.campaignRef}
                  {r.campaignName && <span className="d-block text-muted">{r.campaignRef}</span>}
                  {r.note && <span className="d-block text-muted fst-italic">{r.note}</span>}
                </td>
                <td>{r.placement || '—'}</td>
                <td className="text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{centsToUsd(r.amountCents)}</td>
                <td><span className="badge text-bg-light border">{SOURCE_LABEL[r.source]}</span></td>
                <td className="text-muted">{r.enteredBy ?? '—'}</td>
                <td className="text-end text-nowrap">
                  {arming === r.id ? (
                    <>
                      <button type="button" className="btn btn-sm btn-danger me-1" onClick={() => remove(r.id)}>Delete</button>
                      <button type="button" className="btn btn-sm btn-link" onClick={() => setArming(null)}>Keep</button>
                    </>
                  ) : (
                    <button
                      type="button" className="btn btn-sm btn-outline-secondary"
                      aria-label={`Delete ${centsToUsd(r.amountCents)} for ${r.campaignRef} on ${periodLabel(r)}`}
                      title={r.source === 'meta_api' ? 'A synced row comes back on the next sync.' : undefined}
                      onClick={() => setArming(r.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
