import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listClassifications } from '../../services/growthJourneyInspectApi';
import type { ClassificationRow, ClassificationStatus } from '../../services/growthJourneyInspectApi';
import type { JourneyTerminology } from './journeyWords';
import { safeText, decimalText } from './journeyText';
import {
  JourneyPagingFooter, JourneyEmpty, JourneyFilterBar, JourneySelect, PAGE_LIMIT,
} from './journeyPaging';
import DecisionWhyModal from './DecisionWhyModal';

/**
 * Classifications: what the engine decided each subject IS (Phase 6, T614).
 *
 * ── THE DEFAULT FILTER IS NOT "ALL", AND THE SCREEN SAYS SO ─────────────────
 *
 * `/classifications` defaults `status` to `needs_review`, not `all`. An operator who
 * does not know that reads an empty table as "no classifications exist" when it
 * means "none are awaiting review". The filter is therefore rendered with its
 * default visible and the empty state names the status it was empty FOR.
 *
 * ── THREE FIELDS ON THIS ROW ARE FREE TEXT, AND ONE MAY BE AN EMAIL ─────────
 *
 * This read ships BARE MODEL ROWS - no attributes allow-list - so `intent`,
 * `evidence` and `eligibility` arrive as whatever was written, and `decided_by` may
 * hold an address because the controller falls back to `req.admin.email`. None of it
 * is masked server-side. Everything rendered here goes through `safeText`, and
 * T612's privacy sweep recorded this route in its self-retiring allowlist, so the
 * API-side fix is a known, separate decision for Ali rather than something this tab
 * pretends away.
 *
 * ── `confidence` IS A STRING ────────────────────────────────────────────────
 *
 * DECIMAL(4,3) over JSON is `"0.820"`. The `why` route coerces it; this list route
 * does not. `decimalText` handles both so the two views agree to the same digits,
 * and a missing confidence renders as absent rather than as 0.00.
 */

const STATUSES: readonly { value: ClassificationStatus; label: string }[] = [
  { value: 'needs_review', label: 'needs_review (the API default)' },
  { value: 'proposed', label: 'proposed' },
  { value: 'confirmed', label: 'confirmed' },
  { value: 'rejected', label: 'rejected' },
  { value: 'all', label: 'all statuses' },
];

interface Props {
  words: JourneyTerminology;
  brandName?: string | null;
  unseeded?: boolean;
}

function StatusBadge({ row }: { row: ClassificationRow }) {
  // Text, never colour alone: a11y rule 7, and an operator reading a screenshot.
  const tone = row.status === 'confirmed' ? 'bg-success'
    : row.status === 'rejected' ? 'bg-secondary'
      : row.status === 'needs_review' ? 'bg-warning text-dark' : 'bg-info text-dark';
  return (
    <>
      <span className={`badge ${tone}`}>{row.status}</span>
      {row.requires_human_review && (
        <span className="badge bg-warning text-dark ms-1">needs a human</span>
      )}
      {row.locked && <span className="badge bg-dark ms-1">locked</span>}
    </>
  );
}

export default function ClassificationTab({ words, brandName, unseeded }: Props) {
  const [status, setStatus] = React.useState<ClassificationStatus>('needs_review');
  const [offset, setOffset] = React.useState(0);
  const [why, setWhy] = React.useState<ClassificationRow | null>(null);

  const state = useGrowthJourneyData(
    () => listClassifications({ status, limit: PAGE_LIMIT, offset }),
    `classifications:${status}:${offset}`,
  );

  return (
    <section>
      <h2 className="h5 mb-3">How each {words.subject} was classified</h2>
      <JourneyFilterBar
        right={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={state.reload}>
            Reload
          </button>
        )}
      >
        <JourneySelect
          label="Status"
          value={status}
          options={STATUSES}
          onChange={(v) => { setStatus(v as ClassificationStatus); setOffset(0); }}
        />
      </JourneyFilterBar>

      {/*
        * No `isEmpty`/`emptyMessage` on AsyncPanel: its empty branch SHORT-CIRCUITS
        * the children, so passing both meant the richer `JourneyEmpty` below never
        * rendered and the scope-naming sentence was dead code. One of the two owns
        * this, and it is the one that names the brand and the unseeded case.
        */}
      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty
              noun={`classifications with status ${data.status}`}
              brandName={brandName}
              unseeded={unseeded}
              hint={
                data.status === 'needs_review'
                  ? 'This is the API’s default filter rather than everything on file — switch to "all statuses" to see whether any exist.'
                  : undefined
              }
            />
          ) : (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className="fw-semibold">Classifications</span>
                  <span className="small text-muted">
                    status filter echoed by the server: <code>{data.status}</code>
                  </span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <caption className="small text-muted">
                        Free-text columns on this read are not masked by the API, so
                        {' '}<code>intent</code>, <code>evidence</code> and{' '}
                        <code>decided_by</code> are masked here instead. A classification
                        is a statement about a {words.subject}, not an action taken.
                      </caption>
                      <thead className="table-light">
                        <tr>
                          <th scope="col">{words.subject}</th>
                          <th scope="col">{words.pipeline}</th>
                          <th scope="col">Status</th>
                          <th scope="col">Confidence</th>
                          <th scope="col">Intent</th>
                          <th scope="col">Decided by</th>
                          <th scope="col">Created</th>
                          <th scope="col"><span className="visually-hidden">Why</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row" className="fw-normal">
                              <code>{safeText(row.subject_ref)}</code>
                              {row.referral_target_brand_id && (
                                <span className="badge bg-info text-dark ms-1">referred on</span>
                              )}
                            </th>
                            <td>
                              {row.primary_path
                                ? <code>{safeText(row.primary_path)}</code>
                                : <span className="text-muted">none chosen</span>}
                              {row.secondary_paths.length > 0 && (
                                <span className="small text-muted d-block">
                                  also: {row.secondary_paths.map((p) => safeText(p)).join(', ')}
                                </span>
                              )}
                            </td>
                            <td><StatusBadge row={row} /></td>
                            <td>
                              {decimalText(row.confidence)}
                              {row.ai_involved && (
                                <span className="small text-muted d-block">AI involved</span>
                              )}
                            </td>
                            <td className="text-break">{safeText(row.intent)}</td>
                            <td className="text-break">{safeText(row.decided_by)}</td>
                            <td><span className="small text-muted">{row.created_at}</span></td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => setWhy(row)}
                              >
                                Why
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <JourneyPagingFooter page={data} onOffset={setOffset} noun="classifications" />
            </>
          )
        )}
      </AsyncPanel>

      {why && (
        <DecisionWhyModal
          kind="classification"
          id={why.id}
          subjectRef={safeText(why.subject_ref)}
          onClose={() => setWhy(null)}
        />
      )}
    </section>
  );
}
