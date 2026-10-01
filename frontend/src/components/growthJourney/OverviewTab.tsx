import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import {
  getHealth,
  getReadiness,
  type JourneyHealth,
  type Readiness,
  type ReadinessItem,
} from '../../services/growthJourneyApi';

/**
 * Overview — is this system ready to be switched on, and is it healthy while dark?
 * (Phase 6, T613)
 *
 * Two reads, two questions, deliberately not merged. Readiness is a RUNBOOK -
 * seventeen checks, each with what was found and what would make it ready.
 * Health is an OPERATIONAL snapshot of a system that is currently executing
 * nothing. Averaging them into one "score" would hide the only thing an operator
 * needs, which is the first blocked item.
 *
 * ── `ready: null` IS A THIRD ANSWER, NOT A FALSE ────────────────────────────
 *
 * Several checks cannot be answered from inside the process - they need a
 * migration run, or a human decision. The backend returns `null` for those and
 * counts them in neither numerator nor denominator. Rendering null as "not
 * ready" would invent blockers; rendering it as ready would invent progress. It
 * gets its own row style and its own count.
 *
 * ── EVERY NUMBER CARRIES ITS `as_of` ────────────────────────────────────────
 *
 * This phase's contract makes a count served without freshness a failing
 * condition, because a stale count and a current one are the same pixels. Both
 * panels print the instant their read was computed, and `truncated` is surfaced
 * loudly: a capped read is a FLOOR, not a total, and an operator reading 500 as
 * "500" when it means "at least 500" would draw the wrong conclusion.
 */

/** The three answers a readiness check can give, as a row style rather than a colour alone. */
function ReadyBadge({ ready }: { ready: boolean | null }) {
  if (ready === null) {
    return <span className="badge bg-secondary">unknown</span>;
  }
  return ready
    ? <span className="badge bg-success">ready</span>
    : <span className="badge bg-warning text-dark">blocked</span>;
}

function ReadinessPanel({ data, nextMove }: { data: Readiness; nextMove: string | null }) {
  const blocked = data.items.filter((i) => i.ready === false);
  const unknown = data.items.filter((i) => i.ready === null);
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="fw-semibold">Launch readiness</span>
        <span className="small text-muted">
          {data.score.ready} of {data.score.known} known checks ready
          {data.score.unknown > 0 && <> · {data.score.unknown} unknown</>}
          {data.score.pct !== null && <> · {data.score.pct}%</>}
          {' · as of '}
          {data.as_of}
        </span>
      </div>
      <div className="card-body">
        {nextMove ? (
          <p className="mb-3">
            <strong>Next move:</strong> <code>{nextMove}</code> — the first blocked check in list order.
          </p>
        ) : (
          <p className="mb-3 text-muted">
            Nothing is blocked. {unknown.length > 0 && <>{unknown.length} checks cannot be answered from here.</>}
          </p>
        )}
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <caption className="small text-muted">
              Every check carries what was found and what would make it ready, so the list reads as a runbook.
            </caption>
            <thead className="table-light">
              <tr>
                <th scope="col">Check</th>
                <th scope="col">State</th>
                <th scope="col">What was found</th>
                <th scope="col">What would make it ready</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: ReadinessItem) => (
                <tr key={item.key}>
                  <th scope="row" className="fw-normal"><code>{item.key}</code></th>
                  <td><ReadyBadge ready={item.ready} /></td>
                  <td>{item.reason}</td>
                  <td className="text-muted">{item.next_move}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {blocked.length === 0 && unknown.length === 0 && (
          <p className="mt-3 mb-0 text-muted">All seventeen checks are ready.</p>
        )}
      </div>
    </div>
  );
}

function HealthPanel({ data }: { data: JourneyHealth }) {
  const receiptTotal = data.receipts.reduce((n, r) => n + r.count, 0);
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="fw-semibold">Health</span>
        <span className="small text-muted">
          {data.window_hours}h window · ledger read {data.ledger_read} · as of {data.as_of}
        </span>
      </div>
      <div className="card-body">
        {data.truncated.length > 0 && (
          // A capped read is a FLOOR. Saying so is the difference between "500"
          // and "at least 500", and an operator acting on the former is acting on
          // a number that does not exist.
          <div className="alert alert-warning" role="status">
            <strong>Some counts below are floors, not totals.</strong> These reads hit their row cap:{' '}
            {data.truncated.map((t) => `${t.read} (cap ${t.cap})`).join(', ')}.
          </div>
        )}
        <div className="row g-3">
          <div className="col-md-6">
            <h3 className="h6">Receipts by status</h3>
            {receiptTotal === 0 ? (
              <p className="text-muted mb-0">No execution receipts in the window. Expected while the system is dark.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {data.receipts.map((r) => (
                  <li key={r.status}>
                    <code>{r.status}</code>: {r.count}
                    {r.oldest_hours !== null && <span className="text-muted"> · oldest {r.oldest_hours}h</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="small text-muted mt-2 mb-0">
              {data.stuck_pending_review.count} awaiting review for over {data.stuck_pending_review.over_hours}h ·{' '}
              {data.journey_hold_rows} hold rows
            </p>
          </div>
          <div className="col-md-6">
            <h3 className="h6">Held and refused</h3>
            <p className="mb-1">
              Held: <strong>{data.held.total}</strong>
              {Object.keys(data.held.by_reason).length > 0 && (
                <span className="text-muted"> ({Object.entries(data.held.by_reason).map(([k, v]) => `${k} ${v}`).join(', ')})</span>
              )}
            </p>
            <p className="mb-1">
              Refused: <strong>{data.refused.total}</strong>
              {data.refused.capped && <span className="text-muted"> — capped, so this is a floor</span>}
            </p>
            <h3 className="h6 mt-3">Crons</h3>
            {data.crons.length === 0 ? (
              <p className="text-muted mb-0">No journey crons registered.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {data.crons.map((c) => (
                  <li key={c.agent_name}>
                    <code>{c.agent_name}</code>: {c.state}
                    {c.minutes_since !== null && <span className="text-muted"> · {c.minutes_since}m ago</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OverviewTab() {
  const readiness = useGrowthJourneyData(getReadiness, 'readiness');
  const health = useGrowthJourneyData(getHealth, 'health');

  return (
    <>
      <h2 className="h5 mb-3">Overview</h2>
      <AsyncPanel state={readiness} onRetry={readiness.reload}>
        {(r) => <ReadinessPanel data={r} nextMove={r.next_move} />}
      </AsyncPanel>
      <AsyncPanel state={health} onRetry={health.reload}>
        {(h) => <HealthPanel data={h} />}
      </AsyncPanel>
    </>
  );
}
