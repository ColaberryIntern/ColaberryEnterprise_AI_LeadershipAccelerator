import React from 'react';
import SectionCard from '../admin/shell/SectionCard';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import { useExplorerData } from './useExplorerData';
import {
  getDistribution,
  PRIMARY_STATE_ORDER,
  type ExplorerDistribution,
  type ExplorerPrimaryState,
} from '../../services/explorerGrowthApi';

/**
 * Overview — the population, now and over time.
 *
 * The header above already carries the run's counts; this tab answers the other
 * half: what shape is the population in, and is it moving?
 */

/** Journey order, not alphabetical: the roster should read as a progression. */
function orderStates<T extends { primary_state: ExplorerPrimaryState }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      PRIMARY_STATE_ORDER.indexOf(a.primary_state) - PRIMARY_STATE_ORDER.indexOf(b.primary_state),
  );
}

/** Tone by position in the journey, so the bar reads as progress, not category. */
function stateTone(state: ExplorerPrimaryState): 'neutral' | 'info' | 'success' | 'primary' {
  if (state === 'CONVERTED') return 'success';
  if (state === 'ENROLLMENT_READY' || state === 'CONSIDERING_NEXT_STEP') return 'primary';
  if (state === 'NEW_EXPLORER' || state === 'ACTIVATING') return 'neutral';
  return 'info';
}

export function DistributionBar({ counts }: { counts: ExplorerDistribution['today'] }) {
  const total = counts.reduce((n, c) => n + c.count, 0);
  if (total === 0) return null;

  return (
    <>
      <div className="progress mb-3" style={{ height: 14 }} role="img" aria-label="State distribution">
        {orderStates(counts).map((c) => (
          <div
            key={c.primary_state}
            className="progress-bar"
            style={{
              width: `${(c.count / total) * 100}%`,
              // Tokens, never a literal hex — tokens.css is the source of truth.
              backgroundColor:
                stateTone(c.primary_state) === 'success'
                  ? 'var(--status-success)'
                  : stateTone(c.primary_state) === 'primary'
                    ? 'var(--red-500)'
                    : stateTone(c.primary_state) === 'info'
                      ? 'var(--status-info)'
                      : 'var(--neutral-300)',
            }}
            title={`${c.primary_state}: ${c.count}`}
          />
        ))}
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0">
          <thead className="table-light">
            <tr>
              <th>State</th>
              <th className="text-end">Learners</th>
              <th className="text-end">Share</th>
            </tr>
          </thead>
          <tbody>
            {orderStates(counts).map((c) => (
              <tr key={c.primary_state}>
                <td>
                  <StatusBadge label={c.primary_state.replace(/_/g, ' ')} tone={stateTone(c.primary_state)} />
                </td>
                <td className="text-end fw-semibold">{c.count.toLocaleString()}</td>
                <td className="text-end text-muted">{((c.count / total) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Trend({ trend }: { trend: ExplorerDistribution['trend'] }) {
  if (trend.length === 0) {
    return (
      <div className="text-muted small">
        No snapshot history in this window yet. The trend needs at least two nightly runs.
      </div>
    );
  }

  const states = Array.from(
    new Set(trend.flatMap((p) => p.counts.map((c) => c.primary_state))),
  ) as ExplorerPrimaryState[];
  const ordered = states.sort(
    (a, b) => PRIMARY_STATE_ORDER.indexOf(a) - PRIMARY_STATE_ORDER.indexOf(b),
  );

  return (
    <div className="table-responsive">
      <table className="table table-sm mb-0">
        <thead className="table-light">
          <tr>
            <th>Date</th>
            {ordered.map((s) => (
              <th key={s} className="text-end small">
                {s.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((point) => (
            <tr key={point.as_of_date}>
              <td className="text-nowrap">{point.as_of_date}</td>
              {ordered.map((s) => {
                const hit = point.counts.find((c) => c.primary_state === s);
                return (
                  <td key={s} className="text-end">
                    {hit ? (
                      hit.count.toLocaleString()
                    ) : (
                      // An em dash, not 0: this state had no snapshot row that
                      // day, which is not the same as "zero learners were in it".
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewTab() {
  const dist = useExplorerData(() => getDistribution(30), 'distribution:30');

  return (
    <AsyncPanel
      state={dist}
      isEmpty={(d) => d.today.length === 0 && d.trend.length === 0}
      emptyMessage="No learners have been classified yet."
      emptyHint="The nightly recompute populates this. If it has never run, there is nothing to show — which is different from every learner being in no state."
      onRetry={dist.reload}
    >
      {(d) => (
        <div className="row g-3">
          <div className="col-12 col-xl-6">
            <SectionCard title="Where learners are now" icon="pie-chart-line">
              <DistributionBar counts={d.today} />
            </SectionCard>
          </div>

          <div className="col-12 col-xl-6">
            <SectionCard
              title="Overlays"
              icon="stack-line"
              subtitle="Independent of primary state — a learner can carry several."
            >
              {d.overlays.length === 0 ? (
                <div className="text-muted small">No overlays are set on any learner.</div>
              ) : (
                <div className="d-flex flex-wrap gap-2">
                  {d.overlays.map((o) => (
                    <span key={o.overlay} className="d-inline-flex align-items-center gap-1">
                      <StatusBadge
                        label={`${o.overlay.replace(/_/g, ' ')} · ${o.count}`}
                        tone={o.overlay === 'FRICTION' || o.overlay === 'DORMANT' ? 'warning' : 'info'}
                      />
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="col-12">
            <SectionCard
              title="Trend"
              icon="line-chart-line"
              subtitle="From the append-only nightly snapshots — the only source that can say what last week looked like."
            >
              <Trend trend={d.trend} />
            </SectionCard>
          </div>
        </div>
      )}
    </AsyncPanel>
  );
}
