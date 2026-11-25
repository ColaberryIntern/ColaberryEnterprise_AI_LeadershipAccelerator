import React, { useState } from 'react';
import type { BatchSession, MapWeek, PlanDemand, PlanSignal } from '../../../../services/weeklyLivePlanApi';
import { BANDS, centralToday, CONVERT, daysBetween, FACTORS, shortDate, TEACH, VIRAL } from './planModel';

/** The pieces of the planner that only display: demand bars, signals, the curriculum map and the rubric. */
export function DemandBars({ demand, weeks }: { demand: PlanDemand[]; weeks: MapWeek[] }): React.ReactElement {
  const top = Math.max(4, ...demand.map((d) => Math.min(d.multiple ?? 0, 16)));
  return (
    <section className="cls-card" data-testid="demand-bars">
      <h2 className="cls-card-title">YouTube demand by week</h2>
      <p className="cls-hint">The best recent video on each week, as a multiple of its channel's usual views. The longest bar is capped at 16 times.</p>
      {demand.length === 0 && <p className="cls-empty">Not measured yet. The first run measures it.</p>}
      <ul className="clp-bars">
        {weeks.map((w) => {
          const d = demand.find((x) => x.week === w.week);
          if (!d && demand.length === 0) return null;
          const text = !d || d.failed ? 'Not measured' : d.multiple === null ? 'No usual view count' : `${d.multiple.toFixed(1)}x`;
          return (
            <li key={w.week} className="clp-bar" data-testid={`demand-${w.week}`}>
              <span className="clp-bar-name">Week {w.week}. {w.theme}{w.coveredInLast4 ? ' (covered)' : ''}</span>
              <span className="clp-bar-track" aria-hidden="true"><span className={`clp-bar-fill clp-s${d?.score ?? 0}`} style={{ width: `${d?.multiple ? Math.max(2, (Math.min(d.multiple, 16) / top) * 100) : 0}%` }} /></span>
              <span className="clp-bar-value">{text}{d && !d.failed && d.score !== null ? ` · ${d.score}/5` : ''}{d?.thin_median ? ' · few uploads' : ''}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SignalList({ signals }: { signals: PlanSignal[] }): React.ReactElement {
  const [factor, setFactor] = useState(0);
  const kept = signals.filter((s) => !s.dropped_reason);
  const dropped = signals.filter((s) => s.dropped_reason);
  const shown = factor ? kept.filter((s) => s.factors.includes(factor)) : kept;
  return (
    <section className="cls-card" data-testid="signals">
      <h2 className="cls-card-title">News signals ({kept.length})</h2>
      <div className="clp-chips" role="group" aria-label="Filter by viral factor" data-testid="factor-filter">
        {[0, ...Object.keys(FACTORS).map(Number)].map((f) => (
          <button key={f} type="button" className="clp-chip clp-chip-btn" aria-pressed={factor === f} onClick={() => setFactor(f)} data-testid={`factor-${f}`}>
            {f ? FACTORS[f] : 'All'} ({f ? kept.filter((s) => s.factors.includes(f)).length : kept.length})
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="cls-empty">{kept.length ? 'No story carries this factor.' : 'No stories yet.'}</p>}
      <ul className="clp-list">
        {shown.map((s) => (
          <li key={s.id} className="clp-signal" data-testid="signal">
            <span className="cls-row-when">{s.published_at ? shortDate(s.published_at) : 'Date unconfirmed'}</span>
            <div>
              <a className="cls-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.headline}</a>
              <p className="cls-hint">{[s.publisher, s.fits_weeks.length ? `fits week ${s.fits_weeks.join(', ')}` : null].filter(Boolean).join(' · ')}</p>
              {s.idea && <p className="clp-idea">{s.idea}</p>}
              <div className="clp-chips">{s.factors.map((f) => <span key={f} className="clp-chip">{FACTORS[f]}</span>)}</div>
            </div>
          </li>
        ))}
      </ul>
      {dropped.length > 0 && (
        <details className="clp-details">
          <summary>{dropped.length} left out, with reasons</summary>
          <ul className="clp-list">{dropped.map((s) => <li key={s.id}><span>{s.headline}</span> <span className="cls-hint">{s.dropped_reason}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
function when(date: string | null): string {
  if (!date) return 'No date';
  const d = daysBetween(centralToday(), date);
  return d === 0 ? 'Today' : d > 0 ? `In ${days(d)}` : `${days(-d)} ago`;
}

interface CurriculumProps { weeks: MapWeek[]; demand: PlanDemand[]; sessions: BatchSession[]; batchName: string | null }
export function CurriculumTab({ weeks, demand, sessions, batchName }: CurriculumProps): React.ReactElement {
  return (
    <div data-testid="curriculum-map">
      <section className="cls-card">
        <h2 className="cls-card-title">12 weeks: covered, planned, open</h2>
        <ul className="clp-chips clp-legend" data-testid="map-legend">
          {([['covered', 'Covered'], ['planned', 'Planned'], ['open', 'Open']] as const).map(([k, label]) => <li key={k} className={`clp-chip clp-key is-${k}`}>{label}</li>)}
        </ul>
        <div className="clp-weeks">
          {weeks.map((w) => {
            const state = w.planned ? 'planned' : w.timesCovered ? 'covered' : 'open';
            const d = demand.find((x) => x.week === w.week);
            return (
              <div key={w.week} className={`clp-week is-${state}`} data-testid={`map-week-${w.week}`}>
                <strong>Week {w.week}</strong>
                <span>{w.theme}</span>
                {w.planned && <span className="cls-row-when">Planned for {shortDate(w.planned.date)}: {w.planned.title}</span>}
                {w.lastCovered && <span className="cls-row-when">Covered {shortDate(w.lastCovered)}{w.daysAgo === null ? '' : w.daysAgo === 0 ? ', today' : `, ${days(w.daysAgo)} ago`}{w.lastTitle ? `: ${w.lastTitle}` : ''}</span>}
                {state === 'open' && <span className="cls-row-when">Open</span>}
                <span className="cls-hint">{!d || d.failed ? 'Demand not measured' : d.multiple === null ? 'Demand: no usual view count' : `Demand ${d.multiple.toFixed(1)}x`}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="cls-card">
        <h2 className="cls-card-title">Every live session{batchName ? ` (${batchName})` : ''}</h2>
        {sessions.length === 0 ? <p className="cls-empty">No sessions in this batch yet.</p> : (
          <table className="clp-table" data-testid="session-table">
            <thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col">Week</th><th scope="col">When</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {sessions.map((x) => (
                <tr key={x.id}><td>{x.date ? shortDate(x.date) : ''}</td><td>{x.title}</td><td>{x.week ? `Week ${x.week}` : 'Not tagged'}</td><td>{when(x.date)}</td><td>{x.status || ''}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Lines({ title, rows }: { title: string; rows: readonly (readonly [string, number | string])[] }): React.ReactElement {
  return (
    <section className="cls-card">
      <h2 className="cls-card-title">{title}</h2>
      <dl className="clp-lines">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}

export function RubricTab(): React.ReactElement {
  return (
    <div data-testid="rubric">
      <p className="cls-sub">Topic score = Teach 40% + Viral 40% + Convert 20%. A topic needs 85 and at least 3 of the 10 viral factors to go ahead.</p>
      <div className="clp-rubric">
        <Lines title="Teach" rows={TEACH.map(([, label, w]) => [label, w] as const)} />
        <Lines title="Viral" rows={VIRAL} />
        <Lines title="Convert" rows={CONVERT} />
        <Lines title="What the score means" rows={BANDS} />
      </div>
    </div>
  );
}
