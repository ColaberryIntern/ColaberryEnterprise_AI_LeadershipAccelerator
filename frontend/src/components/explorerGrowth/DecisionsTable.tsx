import React, { useState } from 'react';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import DecisionWhyModal from './DecisionWhyModal';
import LearnerName from './LearnerName';
import { useExplorerData } from './useExplorerData';
import type { ExplorerDecisionPage, ExplorerDecisionRow } from '../../services/explorerGrowthApi';

/**
 * The table behind both Decisions and Shadow.
 *
 * They read the same rows; Shadow narrows to what WOULD have gone out and frames
 * it as a review. Sharing the table keeps the two from drifting into disagreeing
 * about the same decision — which is exactly what happened once already in this
 * programme, when two surfaces read one corrupt column differently and one said
 * "registered" while the other asked the same person to sign up.
 */

/** The status the draft stage writes when the send-time quality gate refused the copy. */
const REJECTED = 'explorer_draft_rejected';

/**
 * What this learner would have read, in one cell.
 *
 * Four distinct states, and collapsing any pair of them would mislead:
 *
 *   a subject            - the draft exists and passed the gate
 *   a subject + REFUSED  - the draft exists and the gate refused it. This is the
 *                          most interesting row on the page and the easiest to
 *                          hide, because refused copy still HAS a subject and
 *                          renders identically unless the status is read.
 *   "not drafted yet"    - an actionable email decision with no draft. Honest
 *                          absence: the draft stage runs 20 minutes after the
 *                          Governor and is flag-gated, so before it has run every
 *                          row looks like this.
 *   an em dash           - nothing was ever going to be sent (a WAIT, or a
 *                          non-email action). Not a gap, so not flagged as one.
 */
export function DraftSubject({ row }: { row: ExplorerDecisionRow }) {
  if (row.draft_subject) {
    const refused = row.draft_status === REJECTED;
    return (
      <>
        <div className={refused ? 'text-muted' : ''} title={row.draft_subject}>
          {row.draft_subject}
        </div>
        {refused && (
          <div className="small mt-1">
            <span className="badge bg-warning text-dark" data-testid="draft-refused">
              refused by the quality gate
            </span>
          </div>
        )}
      </>
    );
  }

  // Mirrors the Why modal's rule rather than re-deriving it from an action list:
  // an email decision carrying a campaign is one that SHOULD have produced copy.
  const expectsOne = row.channel === 'email' && row.selected_action !== 'WAIT';
  return (
    <span className="text-muted small">
      {expectsOne ? 'not drafted yet' : '—'}
    </span>
  );
}

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
                    {/* The subject sits second, next to the person who would read
                        it. Before Phase 2 the only way to see the copy was to open
                        one modal per decision, so answering "did the right
                        messaging go out" across 142 rows meant 142 clicks. */}
                    <th>Message</th>
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
                        {/* 2026-10-26: the 360 profile and the GHL record, one click each */}
                        <div className="fw-semibold"><LearnerName enrollmentId={r.enrollment_id} email={r.email_normalized} leadId={r.lead_id} ghlUrl={r.ghl_url} /></div>
                        <div className="text-muted small font-monospace">
                          {r.enrollment_id.slice(0, 8)}…
                        </div>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <DraftSubject row={r} />
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
