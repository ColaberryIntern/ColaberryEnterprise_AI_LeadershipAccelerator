import React, { useState } from 'react';
import { useRealtimeRemediationPressure } from '../../hooks/useRealtimeRemediationPressure';
import { useRemediationOutcomeMetrics } from '../../hooks/useRemediationOutcomeMetrics';
import { useRegressionPronePatterns } from '../../hooks/useRegressionPronePatterns';
import type { RemediationIntelligenceReport } from '../../hooks/useRemediationIntelligence';

const TIER_COLOR: Record<string, string> = {
  calm: '#15803d', elevated: '#0284c7', urgent: '#92400e', critical: '#b91c1c',
};
const TIER_BG: Record<string, string> = {
  calm: '#dcfce7', elevated: '#dbeafe', urgent: '#fef3c7', critical: '#fee2e2',
};

export interface RealtimeRemediationDashboardProps {
  bpId: string | null;
  /** Lifted from SystemViewV2 so we don't double-fetch the report. */
  report: RemediationIntelligenceReport | null;
  defaultCollapsed?: boolean;
}

/**
 * Phase 11 — live dashboard. Pressure tier streams via SSE, outcome
 * metrics + regression-prone patterns refresh on mount + on reload.
 * The intelligence report is passed in (lifted state) to avoid double
 * fetching the same surface IssueClusterView already shows.
 */
export function RealtimeRemediationDashboard({ bpId, report, defaultCollapsed = false }: RealtimeRemediationDashboardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pressure = useRealtimeRemediationPressure({ enabled: !collapsed });
  const metrics = useRemediationOutcomeMetrics(bpId, { autoFetch: !collapsed });
  const regression = useRegressionPronePatterns({ autoFetch: !collapsed });

  const tier = pressure.data?.tier ?? 'calm';

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div
        className="card-header bg-white d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', padding: '8px 12px' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-broadcast" style={{ color: '#0f172a', fontSize: 13 }}></i>
          <span className="fw-semibold" style={{ fontSize: 12 }}>Live remediation dashboard</span>
          {pressure.data && (
            <span className="badge ms-2" style={{ background: TIER_BG[tier], color: TIER_COLOR[tier], fontSize: 9 }}>
              Pressure {pressure.data.pressure} · {tier}
            </span>
          )}
          {pressure.connected && (
            <span className="text-success" title="Live stream connected" style={{ fontSize: 9 }}>● live</span>
          )}
        </div>
        <i className={`bi ${collapsed ? 'bi-chevron-down' : 'bi-chevron-up'}`} style={{ fontSize: 11, color: '#64748b' }}></i>
      </div>
      {!collapsed && (
        <div className="card-body" style={{ padding: '10px 12px', fontSize: 11 }}>
          {/* Active clusters */}
          <div className="row g-2">
            <div className="col-md-4">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Active clusters</div>
              <div className="d-flex align-items-baseline gap-2">
                <span className="fw-bold" style={{ fontSize: 18 }}>{report?.clusters?.length ?? 0}</span>
                {report?.summary && (
                  <span className="text-muted" style={{ fontSize: 10 }}>{report.summary}</span>
                )}
              </div>
            </div>
            <div className="col-md-4">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Recent outcomes</div>
              <div className="d-flex align-items-baseline gap-2">
                <span className="fw-bold" style={{ fontSize: 18 }}>{metrics.data?.total_outcomes ?? 0}</span>
                {metrics.data && metrics.data.total_outcomes > 0 && (
                  <span className="text-muted" style={{ fontSize: 10 }}>avg {metrics.data.avg_score}/100</span>
                )}
              </div>
            </div>
            <div className="col-md-4">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Regression-prone signatures</div>
              <div className="d-flex align-items-baseline gap-2">
                <span className="fw-bold" style={{ fontSize: 18, color: (regression.data?.patterns.length || 0) > 0 ? '#b91c1c' : '#15803d' }}>
                  {regression.data?.patterns.length ?? 0}
                </span>
                <span className="text-muted" style={{ fontSize: 10 }}>last 30d</span>
              </div>
            </div>
          </div>

          {/* Best/worst cluster type by score */}
          {metrics.data?.best_cluster_type && (
            <div className="mt-2 d-flex align-items-center gap-3" style={{ fontSize: 11 }}>
              <span className="text-muted" style={{ fontSize: 10 }}>Best cluster type:</span>
              <span className="fw-semibold" style={{ color: '#15803d' }}>{metrics.data.best_cluster_type.cluster_type}</span>
              <span className="text-muted">{metrics.data.best_cluster_type.avg_score}/100 over {metrics.data.best_cluster_type.count} attempts</span>
            </div>
          )}
          {metrics.data?.worst_cluster_type && (
            <div className="d-flex align-items-center gap-3" style={{ fontSize: 11 }}>
              <span className="text-muted" style={{ fontSize: 10 }}>Worst cluster type:</span>
              <span className="fw-semibold" style={{ color: '#b91c1c' }}>{metrics.data.worst_cluster_type.cluster_type}</span>
              <span className="text-muted">{metrics.data.worst_cluster_type.avg_score}/100 over {metrics.data.worst_cluster_type.count} attempts</span>
            </div>
          )}

          {/* Regression-prone patterns */}
          {regression.data?.patterns && regression.data.patterns.length > 0 && (
            <div className="mt-2">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Regression-prone patterns</div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {regression.data.patterns.slice(0, 4).map(p => (
                  <li key={p.cluster_signature} className="d-flex gap-2 mb-1">
                    <span style={{ color: '#b91c1c' }}>×{p.recurrence_count}</span>
                    <span className="font-monospace text-muted">{p.cluster_signature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pressure.error && <div className="mt-2 text-warning" style={{ fontSize: 10 }}>{pressure.error}</div>}
        </div>
      )}
    </div>
  );
}
