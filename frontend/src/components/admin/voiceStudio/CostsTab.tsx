import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { getCosts } from '../../../services/voiceStudioApi';
import { NO_DATA } from './voiceStudioFormat';
import { centralTime, useStudioLoad } from './studioLoad';

/** Costs & Operations (VS3.5): actual and estimated spend kept apart; a missing price is "No data", never $0. */
export default function CostsTab(): React.ReactElement {
  const [days, setDays] = useState(30);
  const { data, blocked } = useStudioLoad(() => getCosts(days), [days], 'Costs could not be loaded.');
  if (blocked || !data) return blocked as React.ReactElement;
  return (
    <>
      <div className="btn-group btn-group-sm mb-3" role="group" aria-label="Time window">
        {[7, 30, 90].map((d) => <button key={d} type="button" className={`btn ${days === d ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={days === d} onClick={() => setDays(d)}>Last {d} days</button>)}
      </div>
      <div className="row g-3">
        <div className="col-lg-6">
          <SectionCard title="Spend by provider" icon="money-dollar-circle-line">
            {data.byProvider.length === 0 ? <p className="text-muted small mb-0" data-testid="spend-empty">No usage recorded in this window.</p> : (
              <table className="table table-sm small mb-0"><thead className="table-light"><tr><th scope="col">Provider</th><th scope="col">Source</th><th scope="col" className="text-end">USD</th><th scope="col" className="text-end">Unpriced rows</th></tr></thead>
                <tbody>{data.byProvider.map((p) => (
                  <tr key={`${p.provider}-${p.measured}`} data-testid={`spend-${p.provider}-${p.measured ? 'actual' : 'estimated'}`}><td>{p.provider}</td><td>{p.measured ? 'Actual' : 'Estimated'}</td><td className="text-end">{p.usd === null ? NO_DATA : `$${Number(p.usd).toFixed(4)}`}</td><td className="text-end">{p.unpriced} of {p.rows}</td></tr>
                ))}</tbody></table>
            )}
          </SectionCard>
        </div>
        <div className="col-lg-6">
          <SectionCard title="Caps and alerts" icon="alarm-warning-line">
            <ul className="small mb-0" data-testid="caps">
              <li>Test calls: {data.caps.testAttemptsPerRun} attempts per run, {data.caps.testMaxSeconds} seconds each, ${data.caps.testBudgetUsd} per run. Enforced.</li>
              <li>Live spend cap and alerts: not set up. They are required before live traffic.</li>
            </ul>
          </SectionCard>
        </div>
        <div className="col-lg-6">
          <SectionCard title="Right now" icon="pulse-line">
            <p className="small mb-1" data-testid="active">Active calls: {data.activeCalls}</p>
            <p className="small mb-0">Dial reservations in this window: {data.reservations.length ? data.reservations.map((r) => `${r.status} ${r.n}`).join(', ') : 'none'}</p>
          </SectionCard>
        </div>
        <div className="col-lg-6">
          <SectionCard title="Dead letters" icon="mail-forbid-line" subtitle="Calls whose dial outcome is unknown. They are never retried automatically.">
            {data.deadLetters.length === 0 ? <p className="text-muted small mb-0">None in this window.</p> : <ul className="small mb-0" data-testid="dead">{data.deadLetters.map((d) => <li key={d.id}>{centralTime(d.created_at)}: {d.error_class ?? 'unknown cause'} ({d.id})</li>)}</ul>}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
