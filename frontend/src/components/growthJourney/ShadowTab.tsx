import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listShadowRuns } from '../../services/growthJourneyInspectApi';
import type { ShadowResult } from '../../services/growthJourneyInspectApi';
import { safeText } from './journeyText';
import {
  JourneyPagingFooter, JourneyEmpty, JourneyFilterBar, JourneySelect, PAGE_LIMIT,
} from './journeyPaging';

/**
 * Shadow runs: whether the crons that would decide are actually running
 * (Phase 6, T614).
 *
 * ── THIS TAB IS NOT BRAND-SCOPED, AND IT MUST NOT PRETEND TO BE ─────────────
 *
 * `/shadow/runs` does not accept `brand_id`. Zod strips it, the SQL carries no brand
 * clause, and the response echoes `scope.brand_id === null`. A brand filter here
 * would be a control that silently does nothing, which is worse than no control - so
 * there isn't one, and the panel says why.
 *
 * It is also the ONLY one of the nine that answers real rows to an admin with no
 * tenant membership, deliberately: whether the schedulers ran is an operational fact
 * about the deployment, not about a brand's data. So the no-memberships warning that
 * belongs on every other tab would be wrong here.
 *
 * ── `counts_available` IS A FACT, NOT A FEATURE FLAG ────────────────────────
 *
 * It is hard-coded `false` and the backend cannot learn otherwise: this table holds
 * no per-run detail. Rendering it as a toggle would suggest someone could switch it
 * on. It renders as a sentence saying no per-run counts exist.
 *
 * ── A FAILURE SHOWS A TRACE ID AND NOTHING ELSE ─────────────────────────────
 *
 * `reason` and `stack_trace` are deliberately never projected, so a failed run is
 * `result: 'failed'` plus a `trace_id`. The table says that explicitly rather than
 * leaving a blank where a reason would go - an operator needs to know the detail is
 * in the logs, not missing.
 */

const RESULTS: readonly { value: string; label: string }[] = [
  { value: '', label: 'any result' },
  { value: 'success', label: 'success' },
  { value: 'failed', label: 'failed' },
  { value: 'skipped', label: 'skipped' },
  { value: 'pending', label: 'pending' },
];

const WINDOWS: readonly { value: string; label: string }[] = [
  { value: '7', label: '7 days (the API default)' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '365 days (the maximum)' },
];

export default function ShadowTab() {
  const [result, setResult] = React.useState('');
  const [agent, setAgent] = React.useState('');
  const [windowDays, setWindowDays] = React.useState('7');
  const [offset, setOffset] = React.useState(0);

  const state = useGrowthJourneyData(
    () => listShadowRuns({
      result: (result || undefined) as ShadowResult | undefined,
      agent: agent || undefined,
      window_days: Number(windowDays),
      limit: PAGE_LIMIT,
      offset,
    }),
    `shadow:${result}:${agent}:${windowDays}:${offset}`,
  );

  // The agent list comes from the response, which always returns all three registry
  // names rather than narrowing to the filtered one - so the dropdown is built from
  // the server's list and cannot drift from it.
  const agentOptions = React.useMemo(() => ([
    { value: '', label: 'any agent' },
    ...(state.data?.agents ?? []).map((a) => ({ value: a, label: a })),
  ]), [state.data]);

  return (
    <section>
      <h2 className="h5 mb-3">Did the shadow runs happen?</h2>
      <JourneyFilterBar
        right={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={state.reload}>
            Reload
          </button>
        )}
      >
        <JourneySelect
          label="Window"
          value={windowDays}
          options={WINDOWS}
          onChange={(v) => { setWindowDays(v); setOffset(0); }}
        />
        <JourneySelect
          label="Agent"
          value={agent}
          options={agentOptions}
          onChange={(v) => { setAgent(v); setOffset(0); }}
        />
        <JourneySelect
          label="Result"
          value={result}
          options={RESULTS}
          onChange={(v) => { setResult(v); setOffset(0); }}
        />
      </JourneyFilterBar>

      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          <>
            <div className="alert alert-light border small mb-3" role="note">
              This read is <strong>not brand-scoped</strong>: whether a scheduler ran is a
              fact about the deployment, so the API accepts no brand filter and returns
              rows even to an admin with no tenant memberships.
              {!data.counts_available && (
                <>
                  {' No per-run counts exist for these rows — the table stores no '
                    + 'per-run detail, so a run reports its result and duration only.'}
                </>
              )}
            </div>
            {data.rows.length === 0 ? (
              <JourneyEmpty
                noun={`shadow runs in the last ${data.window_days} days`}
                hint="An empty list here means the crons have not run in this window, which is a different answer from a brand having no data."
              />
            ) : (
              <>
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span className="fw-semibold">Shadow runs</span>
                    <span className="small text-muted">
                      window applied by the server: {data.window_days} days
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="table table-hover mb-0 align-middle">
                        <caption className="small text-muted">
                          A failed run carries a trace id and nothing more: the reason and
                          stack trace are deliberately never served to this screen, so the
                          detail is in the logs rather than missing.
                        </caption>
                        <thead className="table-light">
                          <tr>
                            <th scope="col">Agent</th>
                            <th scope="col">Result</th>
                            <th scope="col">Duration</th>
                            <th scope="col">Trace</th>
                            <th scope="col">Started</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.rows.map((row) => (
                            <tr key={row.id}>
                              <th scope="row" className="fw-normal">
                                <code>{safeText(row.agent)}</code>
                              </th>
                              <td>
                                <span className={`badge ${
                                  row.result === 'success' ? 'bg-success'
                                    : row.result === 'failed' ? 'bg-danger'
                                      : row.result === 'pending' ? 'bg-info text-dark'
                                        : 'bg-secondary'}`}
                                >
                                  {safeText(row.result)}
                                </span>
                              </td>
                              <td>
                                {row.duration_ms === null
                                  ? <span className="text-muted">not recorded</span>
                                  : `${row.duration_ms} ms`}
                              </td>
                              <td>
                                {row.trace_id
                                  ? <code className="small">{safeText(row.trace_id)}</code>
                                  : <span className="text-muted">none</span>}
                              </td>
                              <td><span className="small text-muted">{row.started_at}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <JourneyPagingFooter page={data} onOffset={setOffset} noun="shadow runs" />
              </>
            )}
          </>
        )}
      </AsyncPanel>
    </section>
  );
}
