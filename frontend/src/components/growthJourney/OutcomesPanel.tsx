import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { getOutcomes } from '../../services/growthJourneyPerformanceApi';
import { safeText } from './journeyText';
import { JourneyPagingFooter, JourneyEmpty, PAGE_LIMIT } from './journeyPaging';

/**
 * Outcomes: what happened to people, as distinct from what the system did
 * (Phase 6, T615).
 *
 * A receipt says "the executor sent this". An outcome says "this person enrolled".
 * They are different facts from different tables and an operator reading one as the
 * other would draw the wrong conclusion about whether the journey works, which is
 * why the two panels sit side by side rather than merging.
 *
 * ── A DELIBERATELY NARROW PROJECTION ────────────────────────────────────────
 *
 * The read drops `value` (a DECIMAL), `metadata` (JSONB), `lead_id` and
 * `source_ref` on purpose, so this panel has no money figure to render and no
 * free-text column at all. `scope.program_id` is ALWAYS literal null here because
 * the table has no such column - and `program_id` is a 400 rather than a silent
 * ignore, which is the correct handling and the opposite of what `/rates` does with
 * the same parameter.
 *
 * `subject_ref` is a pointer (`lead:4711`), never an address, and still goes
 * through the mask: this read is not on T612's privacy allowlist, but the one
 * thing worse than masking something clean is not masking something that changed.
 */

interface Props {
  brandId?: string;
}

export default function OutcomesPanel({ brandId }: Props) {
  const [offset, setOffset] = React.useState(0);
  const state = useGrowthJourneyData(
    () => getOutcomes({ brand_id: brandId || undefined, limit: PAGE_LIMIT, offset }),
    `outcomes:${brandId ?? ''}:${offset}`,
  );

  return (
    <>
      <h3 className="h6 mt-4 mb-2">Outcomes</h3>
      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty
              noun="outcomes"
              scope={data.scope}
              hint="No outcome has been recorded in this scope. An outcome is something that happened to a person, so an empty list here is a different fact from an empty receipt list."
            />
          ) : (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className="fw-semibold">Outcomes</span>
                  <span className="small text-muted">
                    scope applied: brand <code>{safeText(data.scope.brand_id ?? 'all in scope')}</code>
                    {' '}· programme not a filter on this read
                  </span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <caption className="small text-muted">
                        What happened to a person, not what the system did. The monetary
                        value and the metadata behind each row are deliberately not served
                        to this screen, so the counts are the whole answer rather than a
                        failed load.
                      </caption>
                      <thead className="table-light">
                        <tr>
                          <th scope="col">Subject</th>
                          <th scope="col">Outcome</th>
                          <th scope="col">Source</th>
                          <th scope="col">Occurred</th>
                          <th scope="col">Traces to</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row" className="fw-normal">
                              <code>{safeText(row.subject_ref)}</code>
                            </th>
                            <td>
                              <span className="badge bg-light text-dark border">
                                {safeText(row.outcome_type)}
                              </span>
                            </td>
                            <td><code>{safeText(row.source)}</code></td>
                            <td><span className="small text-muted">{safeText(row.occurred_at)}</span></td>
                            <td className="small text-muted">
                              {row.handoff_id && <>handoff <code>{safeText(row.handoff_id)}</code></>}
                              {row.decision_id && <> decision <code>{safeText(row.decision_id)}</code></>}
                              {!row.handoff_id && !row.decision_id && (
                                <span className="text-muted">nothing in the journey</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <JourneyPagingFooter page={data} onOffset={setOffset} noun="outcomes" />
            </>
          )
        )}
      </AsyncPanel>
    </>
  );
}
