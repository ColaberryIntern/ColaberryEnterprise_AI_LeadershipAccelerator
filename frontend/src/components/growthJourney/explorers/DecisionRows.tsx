import React, { useState } from 'react';
import StatusBadge from '../../admin/shell/StatusBadge';
import LearnerName from '../../explorerGrowth/LearnerName';
import { DraftSubject } from '../../explorerGrowth/DecisionsTable';
import WhyModal from './WhyModal';
import type { ExplorerDecisionPage } from '../../../services/explorerGrowthApi';

/**
 * The decisions table, shared by the Decisions tab and the Shadow tab.
 *
 * ─── WHY EXPLORER'S `DecisionsTable` COULD NOT BE REUSED ────────────────────
 *
 * It looked reusable: it takes a `fetcher` prop, so handing it a brand-scoped
 * one seemed to be the whole job. Two things stop that.
 *
 * 1. It renders Explorer's own `DecisionWhyModal`, which fetches from the
 *    UNSCOPED client. Every "Why?" click would have left brand scope - the exact
 *    bypass this build exists to prevent, reachable from a table that otherwise
 *    looked correctly scoped.
 * 2. Its `fetcher` returns `ExplorerDecisionPage`, not the scoped envelope, so a
 *    403 would reject inside its `AsyncPanel` and render as a RED FAILURE rather
 *    than the configuration state `ScopeState` exists to show.
 *
 * So the rows are re-created here, taking an already-fetched page, and the
 * caller owns the scope decision. `DraftSubject`, `LearnerName` and
 * `StatusBadge` are Explorer's and pure, so the message column, the per-learner
 * links and every badge tone come from one definition.
 */

interface Props {
  page: ExplorerDecisionPage;
  brandId: string | null;
  brandName: string | null;
  /** Shadow shows who it WOULD have gone to; Decisions shows what happened. */
  showRecipient?: boolean;
  offset: number;
  pageSize: number;
  onPage: (offset: number) => void;
}

export default function DecisionRows({
  page,
  brandId,
  brandName,
  showRecipient,
  offset,
  pageSize,
  onPage,
}: Props) {
  const [why, setWhy] = useState<string | null>(null);

  return (
    <>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>{showRecipient ? 'Would go to' : 'Learner'}</th>
              {/* The subject sits second, next to the person who would read it.
                  Before Phase 2 the only way to see the copy was one modal per
                  decision, so reviewing 142 rows meant 142 clicks. */}
              <th>Message</th>
              <th>Action</th>
              <th>State</th>
              <th className="text-end">Content</th>
              <th className="text-end">Why</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((r) => (
              <tr key={r.id} data-testid="gj-decision-row">
                <td>
                  <div className="fw-semibold">
                    <LearnerName
                      enrollmentId={r.enrollment_id}
                      email={r.email_normalized}
                      leadId={r.lead_id}
                      ghlUrl={r.ghl_url}
                    />
                  </div>
                  <div className="text-muted small font-monospace">
                    {r.enrollment_id.slice(0, 8)}…
                  </div>
                </td>
                <td style={{ maxWidth: 320 }}>
                  <DraftSubject row={r} />
                </td>
                <td>
                  <StatusBadge
                    label={r.selected_action ?? 'none'}
                    tone={r.selected_action === 'WAIT' ? 'neutral' : 'info'}
                  />
                  {r.channel && <div className="text-muted small mt-1">via {r.channel}</div>}
                </td>
                <td className="small">
                  {r.primary_state ? r.primary_state.replace(/_/g, ' ') : 'none'}
                </td>
                <td className="text-end">
                  {r.asset_count > 0 ? (
                    r.asset_count
                  ) : (
                    // A gap, but only where content was expected: a WAIT carrying
                    // none is correct, not a shortfall.
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
                      {r.selected_action && r.selected_action !== 'WAIT' ? 'gap' : 'none'}
                    </span>
                  )}
                </td>
                <td className="text-end">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => setWhy(r.id)}
                  >
                    {/* The count is on the button so a row advertises that it has
                        something worth opening. */}
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
          {offset + 1} to {Math.min(offset + page.rows.length, page.total)} of{' '}
          {page.total.toLocaleString()}
          {page.decision_date && <> · run of {page.decision_date}</>}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={offset + pageSize >= page.total}
          onClick={() => onPage(offset + pageSize)}
        >
          Next
          <i className="ri-arrow-right-line ms-1" aria-hidden="true" />
        </button>
      </div>

      {/* The SCOPED Why modal. Explorer's would leave brand scope on every click. */}
      {why && (
        <WhyModal
          brandId={brandId}
          brandName={brandName}
          decisionId={why}
          onClose={() => setWhy(null)}
        />
      )}
    </>
  );
}
