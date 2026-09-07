/**
 * "What needs attention".
 *
 * Every card here is computed from the data currently on screen and shows the
 * arithmetic that produced it. Nothing is written in advance. A card that cannot
 * meet its own evidence bar says so and is styled as a caution rather than a
 * finding, because a confident sentence about nine leads is worse than silence.
 */

import React from 'react';
import type { Insight } from './journeyMetrics';

interface Props {
  insights: Insight[];
  onFocus: (nodeId: string) => void;
  loading: boolean;
}

const TONE: Record<Insight['kind'], { label: string; color: string }> = {
  leak: { label: 'Largest leak', color: '#FB2832' },
  opportunity: { label: 'Best opportunity', color: '#2BA39A' },
  quality: { label: 'Data quality', color: '#E8920C' },
};

export default function JourneyInsightRail({
  insights,
  onFocus,
  loading,
}: Props): React.ReactElement {
  return (
    <div>
      <h3 className="h6 mb-1">What needs attention</h3>
      <p className="text-muted small mb-3">
        Calculated from the paths currently shown, not stored.
      </p>

      {loading && <div className="text-muted small">Recalculating…</div>}

      {!loading && insights.length === 0 && (
        <div className="text-muted small">
          Nothing to flag: no drop-off, no path above the evidence floor, and the graph
          engine reported no data-quality warnings for this view.
        </div>
      )}

      {!loading &&
        insights.map((insight) => {
          const tone = TONE[insight.kind];
          return (
            <div
              key={`${insight.kind}-${insight.title}`}
              className="border rounded p-3 mb-2"
              style={{
                background: 'var(--surface-raised, #fff)',
                borderLeft: `3px solid ${insight.sufficient ? tone.color : '#8C8C8C'}`,
              }}
            >
              <div
                className="fw-bold text-uppercase"
                style={{
                  fontSize: '0.62rem',
                  letterSpacing: '0.06em',
                  color: insight.sufficient ? tone.color : '#8C8C8C',
                }}
              >
                {insight.sufficient ? tone.label : 'Insufficient data'}
              </div>
              <div className="fw-semibold small mt-1">{insight.title}</div>
              <p className="text-muted mb-2" style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                {insight.detail}
              </p>
              {/* The working, shown rather than summarised, so the claim above can be
                  checked instead of trusted. */}
              <div
                className="text-muted font-monospace"
                style={{ fontSize: '0.68rem', opacity: 0.85 }}
              >
                {insight.evidence}
              </div>
              {insight.focusNodeId && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary w-100 mt-2"
                  style={{ fontSize: '0.72rem' }}
                  onClick={() => onFocus(insight.focusNodeId!)}
                >
                  Show me this path
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}
