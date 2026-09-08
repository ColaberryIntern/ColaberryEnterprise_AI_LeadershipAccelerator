/**
 * The five headline figures.
 *
 * Every tile takes its colour from the stage it measures, so the eye can move
 * between a tile and its column in the diagram without a legend. A figure the
 * payload does not carry renders as an em dash with a reason, never as zero —
 * "0 enrolled" and "we were not told" are different claims.
 */

import React from 'react';
import type { Kpi } from './journeyMetrics';
import { stageColor } from './journeyPalette';

interface Props {
  kpis: Kpi[];
  isDark: boolean;
  loading: boolean;
}

export default function JourneyKpiStrip({ kpis, isDark, loading }: Props): React.ReactElement {
  return (
    <div className="row g-2 mb-3" role="group" aria-label="Journey summary">
      {kpis.map((k) => {
        const color = stageColor(k.tone, isDark);
        const unavailable = k.value === null;
        return (
          <div className="col-6 col-lg" key={k.key}>
            <div
              className="h-100 p-2 rounded"
              style={{
                background: 'var(--surface-sunken, #f7f7f6)',
                borderLeft: `4px solid ${color}`,
                opacity: loading ? 0.55 : 1,
              }}
            >
              <div className="small text-muted">{k.label}</div>
              <div className="fw-bold" style={{ fontSize: '1.4rem', lineHeight: 1.15 }}>
                {unavailable ? '—' : k.value!.toLocaleString()}
              </div>
              <div className="small text-muted">
                {unavailable
                  ? 'not reported for this view'
                  : k.rate === null
                    ? k.rateLabel
                    : `${k.rate.toFixed(1)}% ${k.rateLabel}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
