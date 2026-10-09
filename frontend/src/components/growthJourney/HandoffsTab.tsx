import React from 'react';
import { Link } from 'react-router-dom';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listHandoffQueue } from '../../services/growthJourneyQueueApi';
import type { HandoffQueueRow } from '../../services/growthJourneyQueueApi';
import type { JourneyTerminology } from './journeyWords';
import { safeText, decimalText } from './journeyText';
import {
  JourneyPagingFooter, JourneyEmpty, JourneyFilterBar, JourneySelect, PAGE_LIMIT,
} from './journeyPaging';

/**
 * The ranked handoff queue (Phase 6, T615).
 *
 * ── THE ORDER IS NOT WHAT IT LOOKS LIKE, AND THE CAPTION SAYS SO ────────────
 *
 * The SQL order is `urgent DESC, expected_value DESC, created_at ASC`, with two
 * properties a "highest value first" label would misrepresent:
 *
 *   1. `expected_value` is nullable and Postgres sorts NULLs FIRST on `DESC` with
 *      no `NULLS LAST` clause. So handoffs with no expected value sit ABOVE
 *      high-value ones inside the same urgency bucket. Calling this column
 *      "highest value first" would be false for exactly the rows an operator most
 *      needs to trust.
 *   2. There is no tiebreaker on `id`, so rows identical on all three keys have an
 *      unstable relative order across pages - a row can appear twice or not at all
 *      while paging. The footer says the ordering is unstable rather than letting
 *      someone treat page 2 as disjoint from page 1.
 *
 * `priority` is returned and is NOT part of the ordering. It is rendered as its own
 * column precisely so nobody infers that it ranks anything.
 *
 * ── `expected_value` IS A STRING ────────────────────────────────────────────
 *
 * DECIMAL over JSON, raw-serialised: `"1500.00"`, not `1500`. The same trap as
 * `confidence` on the classification tab, so it goes through `decimalText`. Any
 * arithmetic or numeric sort on it here would be wrong; the SQL sort is numeric and
 * correct, and this screen does not re-sort.
 *
 * ── THE MANAGER-INBOX LINK IS ABSENT, DELIBERATELY ──────────────────────────
 *
 * T615's spec asks for a link to the executor's manager inbox at
 * `/admin/agents/<id>` "resolved from the registry's agent id". THERE IS NO SUCH
 * ID. `StatusRegistryAgent` carries `agent_name`, `enabled` and `last_run_at`; the
 * controller's `AiAgent.findAll` does not select `id`; and a handoff row carries no
 * agent reference at all - `assigned_to_id` is a human identifier from the tickets
 * actor vocabulary. Building `/admin/agents/${agent_name}` would be a link to
 * nothing, so the deliverable is dropped and recorded rather than faked. The
 * two-line backend fix (add `id` to that select and to the registry type) is noted
 * for T617.
 */

const STATUSES: readonly { value: string; label: string }[] = [
  { value: 'open', label: 'open (queued, assigned, accepted — the API default)' },
  { value: 'queued', label: 'queued' },
  { value: 'assigned', label: 'assigned' },
  { value: 'accepted', label: 'accepted' },
  { value: 'dispositioned', label: 'dispositioned' },
  { value: 'returned_to_ai', label: 'returned_to_ai' },
  { value: 'expired', label: 'expired' },
  { value: 'cancelled', label: 'cancelled' },
  { value: 'all', label: 'every status' },
];

const QUEUES: readonly { value: string; label: string }[] = [
  { value: '', label: 'every queue' },
  { value: 'admissions', label: 'admissions' },
  { value: 'sales', label: 'sales' },
  { value: 'solution_architect', label: 'solution_architect' },
  { value: 'support', label: 'support' },
  { value: 'ali', label: 'ali' },
  { value: 'human_review', label: 'human_review' },
];

function PriorityBadge({ row }: { row: HandoffQueueRow }) {
  const tone = row.priority === 'critical' ? 'bg-danger'
    : row.priority === 'high' ? 'bg-warning text-dark'
      : row.priority === 'low' ? 'bg-light text-dark border' : 'bg-secondary';
  return (
    <>
      <span className={`badge ${tone}`}>{safeText(row.priority)}</span>
      {row.urgent && <span className="badge bg-danger ms-1">urgent</span>}
    </>
  );
}

interface Props {
  words: JourneyTerminology;
  brandName?: string | null;
  unseeded?: boolean;
}

export default function HandoffsTab({ words, brandName, unseeded }: Props) {
  const [status, setStatus] = React.useState('open');
  const [queue, setQueue] = React.useState('');
  const [offset, setOffset] = React.useState(0);

  const state = useGrowthJourneyData(
    () => listHandoffQueue({
      status, owner_queue: queue || undefined, limit: PAGE_LIMIT, offset,
    }),
    `handoffs:${status}:${queue}:${offset}`,
  );

  return (
    <section>
      <h2 className="h5 mb-3">Who is waiting for a human</h2>
      <JourneyFilterBar
        right={(
          <div className="d-flex gap-2 align-items-end">
            <Link className="btn btn-outline-secondary btn-sm" to="/admin/tickets?source=growth_journey">
              Ticket board
            </Link>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={state.reload}>
              Reload
            </button>
          </div>
        )}
      >
        <JourneySelect
          label="Status"
          value={status}
          options={STATUSES}
          onChange={(v) => { setStatus(v); setOffset(0); }}
        />
        <JourneySelect
          label="Queue"
          value={queue}
          options={QUEUES}
          onChange={(v) => { setQueue(v); setOffset(0); }}
        />
      </JourneyFilterBar>

      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          data.rows.length === 0 ? (
            <JourneyEmpty
              noun={`${data.status} handoffs`}
              brandName={brandName}
              unseeded={unseeded}
              hint={data.status === 'open'
                ? 'This is the API’s default filter — queued, assigned and accepted only. Switch to "every status" to see dispositioned and expired rows.'
                : undefined}
            />
          ) : (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className="fw-semibold">Handoff queue</span>
                  <span className="small text-muted">
                    status <code>{safeText(data.status)}</code>
                    {data.owner_queue && <> · queue <code>{safeText(data.owner_queue)}</code></>}
                  </span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <caption className="small text-muted">
                        Ordered urgent first, then by expected value, then oldest first.
                        Two caveats worth knowing: a handoff with NO expected value sorts
                        above valued ones in its urgency bucket, and rows identical on all
                        three keys have no stable order across pages.{' '}
                        <code>priority</code> is shown but does not affect the ranking.
                      </caption>
                      <thead className="table-light">
                        <tr>
                          <th scope="col">{words.subject}</th>
                          <th scope="col">Queue</th>
                          <th scope="col">Priority</th>
                          <th scope="col">Expected value</th>
                          <th scope="col">Status</th>
                          <th scope="col">Waiting since</th>
                          <th scope="col">Ticket</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row" className="fw-normal">
                              <Link to={`/admin/growth-journey/handoffs/${row.id}`}>
                                <code>{safeText(row.subject_ref)}</code>
                              </Link>
                            </th>
                            <td><code>{safeText(row.owner_queue)}</code></td>
                            <td><PriorityBadge row={row} /></td>
                            <td>
                              {row.expected_value === null
                                ? <span className="text-muted">none recorded</span>
                                : decimalText(row.expected_value)}
                            </td>
                            <td>
                              <span className="badge bg-light text-dark border">{safeText(row.status)}</span>
                              {row.assignment_blocked_reason && (
                                <span className="small text-muted d-block">
                                  blocked: {safeText(row.assignment_blocked_reason)}
                                </span>
                              )}
                            </td>
                            <td><span className="small text-muted">{safeText(row.created_at)}</span></td>
                            <td>
                              {row.ticket_id
                                ? <Link to={`/admin/tickets?source=growth_journey`}>{safeText(row.ticket_id)}</Link>
                                : <span className="text-muted">no ticket</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <JourneyPagingFooter page={data} onOffset={setOffset} noun="handoffs" />
              <p className="small text-muted mt-1">
                Paging this queue is not stable: the server&rsquo;s order has no tiebreaker,
                so a row identical to another on urgency, value and age can move between
                pages. Treat a page as a sample, not as a disjoint slice.
              </p>
            </>
          )
        )}
      </AsyncPanel>
    </section>
  );
}
