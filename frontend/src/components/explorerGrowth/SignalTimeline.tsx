import React from 'react';
import type { LearnerSignals, ScorePoint } from '../../services/explorerGrowthApi';

/**
 * SignalTimeline — the score history, and a stated absence where a timeline
 * would be.
 *
 * ── IT MUST NOT DRAW AN EMPTY CHART ─────────────────────────────────────────
 *
 * §27 describes this as a "signal timeline with weights + decay". That timeline
 * does not exist. `explorer_journey_decisions.triggering_signals` is declared,
 * defaults to `[]`, and **no code path writes it** — the Governor never
 * references the column and 0 of 612 production rows are populated.
 *
 * An empty chart here would say "this learner produced no signals" about
 * learners whose scores demonstrably moved: for one real enrollment the E-score
 * read 11, 11, 10, 10, 9, 9 across six snapshot dates. That is a decay curve, so
 * the signals plainly exist — they are simply not recorded.
 *
 * So the component states the absence and shows what IS observable. Refusing
 * and reporting beats substituting something shaped like data.
 */

function Sparkline({ series }: { series: ScorePoint[] }) {
  if (series.length < 2) return null;
  const max = Math.max(...series.flatMap((p) => [p.e_score, p.i_score, p.f_score]), 1);

  const line = (pick: (p: ScorePoint) => number, colour: string, label: string) => (
    <div className="d-flex align-items-end gap-1" style={{ height: 40 }} title={label}>
      {series.map((p) => (
        <div
          key={`${label}-${p.as_of_date}`}
          style={{
            width: 10,
            height: `${Math.max((pick(p) / max) * 100, 2)}%`,
            backgroundColor: colour,
            borderRadius: 2,
          }}
          title={`${p.as_of_date}: ${pick(p)}`}
        />
      ))}
    </div>
  );

  return (
    <div className="d-flex gap-4 flex-wrap">
      <div>
        <div className="text-muted small mb-1">Engagement</div>
        {line((p) => p.e_score, 'var(--status-info)', 'Engagement')}
      </div>
      <div>
        <div className="text-muted small mb-1">Intent</div>
        {line((p) => p.i_score, 'var(--red-500)', 'Intent')}
      </div>
      <div>
        <div className="text-muted small mb-1">Friction</div>
        {line((p) => p.f_score, 'var(--status-warning)', 'Friction')}
      </div>
    </div>
  );
}

export default function SignalTimeline({ signals }: { signals: LearnerSignals }) {
  const summary = signals.summary as
    | { engagement?: Record<string, number>; highestIntentTier?: number; recentIntentTier?: number }
    | null;

  return (
    <>
      {signals.series.length === 0 ? (
        <div className="text-muted small mb-3">
          No score snapshots in this window. The nightly recompute writes one per learner per day.
        </div>
      ) : (
        <>
          <Sparkline series={signals.series} />
          <div className="table-responsive mt-3">
            <table className="table table-sm mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th className="text-end">E</th>
                  <th className="text-end">I</th>
                  <th className="text-end">F</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {signals.series.map((p) => (
                  <tr key={p.as_of_date}>
                    <td className="text-nowrap">{p.as_of_date}</td>
                    <td className="text-end">{p.e_score}</td>
                    <td className="text-end">{p.i_score}</td>
                    <td className="text-end">{p.f_score}</td>
                    <td className="small">{p.primary_state.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {summary && (
        <div className="mt-3 small">
          <span className="text-muted">Highest intent tier reached: </span>
          <strong>{summary.highestIntentTier ?? '—'}</strong>
        </div>
      )}

      {/* The absence, stated. Not an empty chart. */}
      {!signals.per_signal_timeline_available && (
        <div className="alert alert-secondary py-2 px-3 small mt-3 mb-0">
          <div className="fw-semibold mb-1">
            <i className="ri-information-line me-1" aria-hidden="true" />
            No per-signal timeline is available — and that is a fact about the system, not about
            this learner.
          </div>
          <div>{signals.timeline_absent_reason}</div>
        </div>
      )}
    </>
  );
}
