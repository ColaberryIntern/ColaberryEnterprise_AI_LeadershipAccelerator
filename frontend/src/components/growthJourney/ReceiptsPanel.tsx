import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { getReceipts } from '../../services/growthJourneyPerformanceApi';
import { safeText } from './journeyText';
import { JourneyPagingFooter, JourneyEmpty, PAGE_LIMIT } from './journeyPaging';

/**
 * Execution receipts: what the system actually did, or refused to do
 * (Phase 6, T615).
 *
 * ── WHY THIS PANEL EXISTS AT ALL ────────────────────────────────────────────
 *
 * T615's first pass shipped `getReceipts` with NO CONSUMER - the client function
 * existed and nothing called it, so the audit trail T606 was built to expose was
 * unreachable from this workspace. The verifier found it, and it is the exact trap
 * this project's own doctrine names: a producer without a consumer reads as
 * finished work. This panel is the consumer.
 *
 * ── `status_reason` IS NEVER NULL, AND THAT IS THE TRAP ─────────────────────
 *
 * The column is nullable; the API field is not. `safeField` turns a NULL into the
 * literal string `'unknown'`, an `@`-bearing value into `'redacted'` (with
 * `status_reason_redacted: true`), and anything else into the real text truncated
 * to 120 characters - 8 tighter than the column allows. So there are THREE magic
 * values and `null` is never one of them, which means a null-check here would never
 * fire and would quietly render the word "unknown" as though an operator had typed
 * it. Each of the three is rendered as what it is.
 */

interface Props {
  brandId?: string;
  programId?: string;
}

export default function ReceiptsPanel({ brandId, programId }: Props) {
  const [offset, setOffset] = React.useState(0);
  const state = useGrowthJourneyData(
    () => getReceipts({
      brand_id: brandId || undefined,
      program_id: programId || undefined,
      limit: PAGE_LIMIT,
      offset,
    }),
    `receipts:${brandId ?? ''}:${programId ?? ''}:${offset}`,
  );

  return (
    <>
      <h3 className="h6 mt-4 mb-2">Execution receipts</h3>
      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty
              noun="execution receipts"
              scope={data.scope}
              hint="Nothing has been executed in this scope. With the system dark that is the expected answer, not a gap in the audit trail."
            />
          ) : (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className="fw-semibold">Receipts</span>
                  <span className="small text-muted">
                    scope applied: brand <code>{safeText(data.scope.brand_id ?? 'all in scope')}</code>
                  </span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <caption className="small text-muted">
                        One row per thing the executor did or declined to do.{' '}
                        <code>status_reason</code> is masked by the API, which reports which
                        happened: &ldquo;redacted&rdquo; means it held an address,
                        &ldquo;not recorded&rdquo; means the column was empty. A long reason
                        is truncated by the server at 120 characters.
                      </caption>
                      <thead className="table-light">
                        <tr>
                          <th scope="col">Action</th>
                          <th scope="col">Channel</th>
                          <th scope="col">Status</th>
                          <th scope="col">Reason</th>
                          <th scope="col">Campaign</th>
                          <th scope="col">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row" className="fw-normal">
                              <code>{safeText(row.action_type)}</code>
                            </th>
                            <td><code>{safeText(row.channel)}</code></td>
                            <td>
                              <span className="badge bg-light text-dark border">
                                {safeText(row.status)}
                              </span>
                            </td>
                            <td className="text-break">
                              {row.status_reason_redacted
                                ? <span className="badge bg-secondary">redacted by the API</span>
                                : row.status_reason === 'unknown'
                                  ? <span className="text-muted">not recorded</span>
                                  : safeText(row.status_reason)}
                            </td>
                            <td>
                              {row.campaign_key
                                ? <code>{safeText(row.campaign_key)}</code>
                                : <span className="text-muted">none</span>}
                            </td>
                            <td><span className="small text-muted">{safeText(row.created_at)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <JourneyPagingFooter page={data} onOffset={setOffset} noun="receipts" />
            </>
          )
        )}
      </AsyncPanel>
    </>
  );
}
