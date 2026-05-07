import React, { useState } from 'react';
import { useGovernanceRecommendations } from '../../hooks/useGovernanceRecommendations';
import { useAutomationConfidence } from '../../hooks/useAutomationConfidence';
import { usePreparedRemediationPlans } from '../../hooks/usePreparedRemediationPlans';
import { useOperatorOverrides } from '../../hooks/useOperatorOverrides';

const RISK_BG: Record<string, string> = {
  low: '#dcfce7', moderate: '#dbeafe', elevated: '#fef3c7', high: '#fee2e2',
};
const RISK_FG: Record<string, string> = {
  low: '#15803d', moderate: '#0284c7', elevated: '#92400e', high: '#b91c1c',
};
const TIER_BG: Record<string, string> = {
  low: '#fee2e2', moderate: '#fef3c7', high: '#dcfce7',
};
const TIER_FG: Record<string, string> = {
  low: '#b91c1c', moderate: '#92400e', high: '#15803d',
};

export interface OperatorCognitionDashboardProps {
  defaultCollapsed?: boolean;
}

/**
 * Phase 12 — project-level operator cognition dashboard. Renders
 * recommendations (with accept/reject), automation confidence traffic
 * light, prepared plan summary, and recent overrides. State is hook-
 * managed; the dashboard owns its own polling + SSE subscriptions.
 */
export function OperatorCognitionDashboard({ defaultCollapsed = false }: OperatorCognitionDashboardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const recs = useGovernanceRecommendations({ autoFetch: !collapsed });
  const auto = useAutomationConfidence({ autoFetch: !collapsed });
  const plans = usePreparedRemediationPlans({ autoFetch: !collapsed });
  const overrides = useOperatorOverrides({ autoFetch: !collapsed });

  const conf = auto.data?.automation_confidence;

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div
        className="card-header bg-white d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', padding: '8px 12px' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-shield-lock" style={{ color: '#0f172a', fontSize: 13 }}></i>
          <span className="fw-semibold" style={{ fontSize: 12 }}>Operator cognition</span>
          {auto.data && (
            <span className="badge ms-2" style={{ background: TIER_BG[conf?.tier ?? 'moderate'], color: TIER_FG[conf?.tier ?? 'moderate'], fontSize: 9 }}>
              {auto.data.automation_mode} · automation {conf?.confidence ?? 0}/100
            </span>
          )}
          {(recs.streamConnected || auto.streamConnected) && (
            <span className="text-success" title="Live stream connected" style={{ fontSize: 9 }}>● live</span>
          )}
        </div>
        <i className={`bi ${collapsed ? 'bi-chevron-down' : 'bi-chevron-up'}`} style={{ fontSize: 11, color: '#64748b' }}></i>
      </div>
      {!collapsed && (
        <div className="card-body" style={{ padding: '10px 12px', fontSize: 11 }}>
          {/* Top row: confidence + governance summary */}
          {auto.data && (
            <div className="row g-2 mb-3">
              <div className="col-md-3">
                <div className="text-muted mb-1" style={{ fontSize: 10 }}>Automation</div>
                <div className="fw-bold" style={{ fontSize: 16, color: TIER_FG[conf?.tier ?? 'moderate'] }}>
                  {conf?.automation_allowed ? 'Allowed' : 'Blocked'}
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>{conf?.tier ?? '—'}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted mb-1" style={{ fontSize: 10 }}>Active clusters</div>
                <div className="fw-bold" style={{ fontSize: 16 }}>{auto.data.governance_summary.active_clusters}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted mb-1" style={{ fontSize: 10 }}>Override velocity</div>
                <div className="fw-bold" style={{ fontSize: 16, color: auto.data.governance_summary.override_velocity > 4 ? '#b91c1c' : '#0f172a' }}>
                  {auto.data.governance_summary.override_velocity}
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>last 30 min</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted mb-1" style={{ fontSize: 10 }}>Plans (draft)</div>
                <div className="fw-bold" style={{ fontSize: 16 }}>{plans.plans.filter(p => p.status === 'draft').length}</div>
              </div>
            </div>
          )}

          {/* Blocking reasons */}
          {conf?.blocking_reasons && conf.blocking_reasons.length > 0 && (
            <div className="mb-2 p-2" style={{ background: '#fee2e2', borderRadius: 6 }}>
              <div className="fw-semibold mb-1" style={{ fontSize: 10, color: '#b91c1c' }}>
                <i className="bi bi-exclamation-triangle me-1"></i>Automation blocked
              </div>
              <ul className="mb-0" style={{ fontSize: 10, color: '#b91c1c' }}>
                {conf.blocking_reasons.map((r, i) => (<li key={i}>{r}</li>))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div className="text-muted mb-1" style={{ fontSize: 10 }}>Pending recommendations ({recs.recommendations.length})</div>
          {recs.recommendations.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 11 }}>No recommendations awaiting review.</div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {recs.recommendations.slice(0, 5).map(rec => (
                <div key={rec.id} className="p-2" style={{ background: '#f8fafc', borderRadius: 6, border: `1px solid ${RISK_FG[rec.risk_level] || '#e2e8f0'}` }}>
                  <div className="d-flex justify-content-between align-items-start mb-1">
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge" style={{ background: RISK_BG[rec.risk_level], color: RISK_FG[rec.risk_level], fontSize: 9 }}>
                        {rec.risk_level}
                      </span>
                      <span className="fw-semibold" style={{ fontSize: 11 }}>{rec.type.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="d-flex gap-1">
                      <button className="btn btn-sm btn-success" style={{ fontSize: 9, padding: '2px 8px' }}
                        onClick={() => recs.decide(rec.id, 'accepted')}>
                        <i className="bi bi-check-lg"></i> Accept
                      </button>
                      <button className="btn btn-sm btn-outline-danger" style={{ fontSize: 9, padding: '2px 8px' }}
                        onClick={() => recs.decide(rec.id, 'rejected')}>
                        <i className="bi bi-x"></i> Reject
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11 }}>{rec.recommendation_text}</div>
                  <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                    {rec.rationale} · confidence {rec.confidence}/100 · review within {rec.requires_review_within_min} min
                  </div>
                </div>
              ))}
              {recs.recommendations.length > 5 && (
                <div className="text-muted" style={{ fontSize: 10 }}>…and {recs.recommendations.length - 5} more.</div>
              )}
            </div>
          )}

          {/* Recent overrides */}
          {overrides.overrides.length > 0 && (
            <div className="mt-3">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Recent overrides</div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {overrides.overrides.slice(0, 4).map(o => (
                  <li key={o.id} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace text-muted">{o.kind}</span>
                    <span className="text-muted">{new Date(o.recorded_at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(recs.error || auto.error) && (
            <div className="mt-2 text-warning" style={{ fontSize: 10 }}>{recs.error || auto.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
