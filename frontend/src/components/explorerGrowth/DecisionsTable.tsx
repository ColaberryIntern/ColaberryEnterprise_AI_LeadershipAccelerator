import React, { useState } from 'react';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import DecisionWhyModal from './DecisionWhyModal';
import { useExplorerData } from './useExplorerData';
import type { ExplorerDecisionPage } from '../../services/explorerGrowthApi';

/**
 * The table behind both Decisions and Shadow.
 *
 * They read the same rows; Shadow narrows to what WOULD have gone out and frames
 * it as a review. Sharing the table keeps the two from drifting into disagreeing
 * about the same decision — which is exactly what happened once already in this
 * programme, when two surfaces read one corrupt column differently and one said
 * "registered" while the other asked the same person to sign up.
 */

interface Props {
  fetcher: () => Promise<ExplorerDecisionPage>;
  /** Must change whenever the fetcher's inputs change. */
  cacheKey: string;
  emptyMessage: string;
  emptyHint?: string;
  onPage: (offset: number) => void;
  offset: number;
  pageSize: number;
  /** Shadow shows who it would have gone to; Decisions shows what happened. */
  showRecipient?: boolean;
}

export default function DecisionsTable({
  fetcher,
  cacheKey,
  emptyMessage,
  emptyHint,
  onPage,
  offset,
  pageSize,
  showRecipient,
}: Props) {
  const page = useExplorerData(fetcher, cacheKey);
  const [why, setWhy] = useState<string | null>(null);

  return (
    <>
      <AsyncPanel
        state={page}
        isEmpty={(p) => p.rows.length === 0}
        emptyMessage={emptyMessage}
        emptyHint={emptyHint ?? 'The request succeeded — this is an empty result, not a failure.'}
        onRetry={page.reload}
      >
        {(p) => (
          <>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    {showRecipient && <th>Would go to</th>}
                    {!showRecipient && <th>Learner</th>}
                    <th>Action</th>
                    <th>State</th>
                    <th className="text-end">Content</th>
                    <th className="text-end">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="fw-semibold">{r.email_normalized ?? '—'}</div>
                        <div className="text-muted small font-monospace">
                          {r.enrollment_id.slice(0, 8)}…
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          label={r.selected_action ?? '—'}
                          tone={r.selected_action === 'WAIT' ? 'neutral' : 'info'}
                        />
                        {r.channel && <div className="text-muted small mt-1">via {r.channel}</div>}
                      </td>
                      <td className="small">
                        {r.primary_state ? r.primary_state.replace(/_/g, ' ') : '—'}
                      </td>
                      <td className="text-end">
                        {r.asset_count > 0 ? (
                          r.asset_count
                        ) : (
                          // A gap, but only where content was expected: a WAIT
                          // carrying none is correct, not a shortfall.
                          <span
                            className={
                              r.selected_action && r.selected_action !== 'WAIT'
                                ? 'text-warning fw-semibold'
                                : 'text-muted'
                            }
                            title={
                              r.selected_action && r.selected_action !== 'WAIT'
                                ? 'This action carries nothing to send or show'
                                : undefined
                            }
                          >
                            {r.selected_action && r.selected_action !== 'WAIT' ? 'gap' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => setWhy(r.id)}
                        >
                          {/* The count is on the button so a row advertises that
                              it has something worth opening. */}
                          Why?{' '}
                          {r.suppressed_count > 0 && (
                            <span className="badge bg-secondary ms-1">{r.suppressed_count}</span>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex justify-content-between align-items-center p-3 border-top">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={offset === 0}
                onClick={() => onPage(Math.max(0, offset - pageSize))}
              >
                <i className="ri-arrow-left-line me-1" aria-hidden="true" />
                Previous
              </button>
              <span className="text-muted small">
                {offset + 1}–{Math.min(offset + p.rows.length, p.total)} of {p.total.toLocaleString()}
                {p.decision_date && <> · run of {p.decision_date}</>}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={offset + pageSize >= p.total}
                onClick={() => onPage(offset + pageSize)}
              >
                Next
                <i className="ri-arrow-right-line ms-1" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </AsyncPanel>

      {why && <DecisionWhyModal decisionId={why} onClose={() => setWhy(null)} />}
    </>
  );
}
