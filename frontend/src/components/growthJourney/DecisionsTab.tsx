import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listDecisions, listTransitions } from '../../services/growthJourneyInspectApi';
import type { DecisionMode, DecisionRow } from '../../services/growthJourneyInspectApi';
import type { JourneyTerminology } from './journeyWords';
import { safeText } from './journeyText';
import {
  JourneyPagingFooter, JourneyEmpty, JourneyFilterBar, JourneySelect,
  JourneyTextFilter, MaskedValue, PAGE_LIMIT,
} from './journeyPaging';
import DecisionWhyModal from './DecisionWhyModal';

/**
 * Decisions, and the state transitions they produced (Phase 6, T614).
 *
 * ── SHADOW IS THE DEFAULT, AND THAT IS THE POINT ────────────────────────────
 *
 * `/decisions` defaults `mode` to `shadow`, not `all`. Nothing in this system sends;
 * every decision on file today is a shadow decision, and an operator who flips to
 * `live` and sees nothing has learned something real rather than hit an empty table.
 * So the mode filter shows its default and the empty state names the mode.
 *
 * ── `executed` IS NOT `live` ────────────────────────────────────────────────
 *
 * A row carries both `mode` and `executed`, and they answer different questions:
 * `mode` is whether the decision was allowed to act, `executed` is whether anything
 * happened. A shadow decision is never executed; a live decision may be unexecuted
 * because the executor has not run. Rendering only one of them would let a reader
 * infer the other, so both are columns.
 *
 * ── TWO READS, ONE TAB, AND THEY FAIL INDEPENDENTLY ─────────────────────────
 *
 * The transitions read is a different endpoint with a different envelope and the ONE
 * of the nine that honours `program_id`. It is panelled separately so an outage in
 * one does not blank the other - the same reasoning as Overview's two panels.
 *
 * ── `reason` IS MASKED BY THE API ON ONE READ AND NOT THE OTHER ─────────────
 *
 * `/decisions` projects `reason` as free text with no masking; `/decisions/transitions`
 * puts it through `safeField` and reports the outcome in `reason_redacted`. So the
 * same-named column is handled differently in the two tables below, deliberately:
 * the list is masked client-side, the transitions row reports what the API already
 * did. Collapsing them would either double-mask or under-mask.
 */

const MODES: readonly { value: DecisionMode; label: string }[] = [
  { value: 'shadow', label: 'shadow (the API default)' },
  { value: 'live', label: 'live' },
  { value: 'all', label: 'both modes' },
];

interface Props {
  words: JourneyTerminology;
  brandName?: string | null;
  unseeded?: boolean;
  /** Only the transitions read accepts this; the decisions list ignores it. */
  programId?: string;
}

export default function DecisionsTab({ words, brandName, unseeded, programId }: Props) {
  const [mode, setMode] = React.useState<DecisionMode>('shadow');
  const [subject, setSubject] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [why, setWhy] = React.useState<DecisionRow | null>(null);

  const decisions = useGrowthJourneyData(
    () => listDecisions({ mode, subject_ref: subject || undefined, limit: PAGE_LIMIT, offset }),
    `decisions:${mode}:${subject}:${offset}`,
  );
  const transitions = useGrowthJourneyData(
    () => listTransitions({ program_id: programId || undefined, limit: PAGE_LIMIT, offset: 0 }),
    `transitions:${programId ?? ''}`,
  );

  return (
    <section>
      <h2 className="h5 mb-3">What was decided for each {words.subject}</h2>
      <JourneyFilterBar
        right={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={decisions.reload}>
            Reload
          </button>
        )}
      >
        <JourneySelect
          label="Mode"
          value={mode}
          options={MODES}
          onChange={(v) => { setMode(v as DecisionMode); setOffset(0); }}
        />
        <JourneyTextFilter
          label={`${words.subject} pointer`}
          value={subject}
          placeholder="lead:4711"
          onCommit={(v) => { setSubject(v); setOffset(0); }}
        />
      </JourneyFilterBar>

      <AsyncPanel state={decisions} onRetry={decisions.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty
              noun={`${data.mode} decisions`}
              brandName={brandName}
              unseeded={unseeded}
              hint={data.mode === 'live'
                ? 'Nothing in this system sends yet, so an empty live list is the expected answer rather than a fault.'
                : undefined}
            />
          ) : (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className="fw-semibold">Decisions</span>
                  <span className="small text-muted">
                    mode echoed by the server: <code>{data.mode}</code>
                  </span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <caption className="small text-muted">
                        <code>mode</code> is whether the decision was allowed to act;
                        {' '}<code>executed</code> is whether anything happened. A shadow
                        decision is never executed, and a live one can be unexecuted
                        because the executor has not run.
                      </caption>
                      <thead className="table-light">
                        <tr>
                          <th scope="col">{words.subject}</th>
                          <th scope="col">Date</th>
                          <th scope="col">Action</th>
                          <th scope="col">Mode</th>
                          <th scope="col">Executed</th>
                          <th scope="col">Reason</th>
                          <th scope="col"><span className="visually-hidden">Why</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row" className="fw-normal">
                              <code>{safeText(row.subject_ref)}</code>
                            </th>
                            <td><span className="small text-muted">{row.decision_date}</span></td>
                            <td>
                              {row.selected_action
                                ? <code>{safeText(row.selected_action)}</code>
                                : <span className="text-muted">no action chosen</span>}
                              {row.selected_channel && (
                                <span className="small text-muted d-block">
                                  via {safeText(row.selected_channel)}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${row.mode === 'live' ? 'bg-danger' : 'bg-secondary'}`}>
                                {row.mode}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${row.executed ? 'bg-success' : 'bg-light text-dark border'}`}>
                                {row.executed ? 'executed' : 'not executed'}
                              </span>
                            </td>
                            <td className="text-break">{safeText(row.reason)}</td>
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
              <JourneyPagingFooter page={data} onOffset={setOffset} noun="decisions" />
            </>
          )
        )}
      </AsyncPanel>

      <h3 className="h6 mt-4 mb-2">State transitions</h3>
      <AsyncPanel state={transitions} onRetry={transitions.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty noun="state transitions" brandName={brandName} unseeded={unseeded} />
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="fw-semibold">Transitions</span>
                <span className="small text-muted">
                  scope applied: brand <code>{data.scope.brand_id ?? 'all in scope'}</code>,
                  {' '}programme <code>{data.scope.program_id ?? 'all in scope'}</code>
                </span>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <caption className="small text-muted">
                      <code>reason</code> and <code>requested_by</code> are masked by the
                      API, which reports WHICH happened: &ldquo;redacted&rdquo; means the
                      column held an address, &ldquo;not recorded&rdquo; means it was
                      empty. Those are different facts.
                    </caption>
                    <thead className="table-light">
                      <tr>
                        <th scope="col">{words.subject}</th>
                        <th scope="col">Type</th>
                        <th scope="col">From</th>
                        <th scope="col">To</th>
                        <th scope="col">Reason</th>
                        <th scope="col">Requested by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr key={row.id}>
                          <th scope="row" className="fw-normal">
                            <code>{safeText(row.subject_ref)}</code>
                          </th>
                          <td>
                            <code>{safeText(row.transition_type)}</code>
                            <span className="small text-muted d-block">{safeText(row.status)}</span>
                          </td>
                          <td>{row.from_state ? <code>{safeText(row.from_state)}</code> : <span className="text-muted">none</span>}</td>
                          <td>{row.to_state ? <code>{safeText(row.to_state)}</code> : <span className="text-muted">none</span>}</td>
                          <td><MaskedValue value={row.reason} redacted={row.reason_redacted} /></td>
                          <td><MaskedValue value={row.requested_by} redacted={row.requested_by_redacted} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        )}
      </AsyncPanel>

      {why && (
        <DecisionWhyModal
          kind="decision"
          id={why.id}
          subjectRef={safeText(why.subject_ref)}
          onClose={() => setWhy(null)}
        />
      )}
    </section>
  );
}
