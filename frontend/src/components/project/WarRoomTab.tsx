import React, { useEffect, useState, useCallback } from 'react';
import portalApi from '../../utils/portalApi';
import WorkstationLauncher from './WorkstationLauncher';

interface WarRoomData {
  progress: {
    requirementsCompletionPct: number;
    productionReadinessScore: number;
    breakdown: any;
    computedAt: string;
  } | null;
  current_action: {
    id: string;
    title: string;
    action_type: string;
    reason: string;
    status: string;
    confidence_score: number;
    completion_type?: string;
    metadata?: any;
  } | null;
  requirements: Array<{
    requirement_id: string;
    requirement_key: string;
    requirement_text: string;
    verification_status: string;
    verification_confidence: number;
    verification_notes: string;
    semantic_status: string | null;
    semantic_confidence: number;
    semantic_reasoning: string | null;
  }>;
  recent_activity: Array<{
    type: string;
    timestamp: string;
    title: string;
    detail: string;
    confidence: number;
  }>;
  coverage_summary: {
    total: number;
    verified_complete: number;
    verified_partial: number;
    not_verified: number;
  };
  artifact_graph: {
    nodes: any[];
    edges: any[];
  };
  risk_summary?: {
    risks: Array<{
      risk_level: string;
      risk_type: string;
      reason: string;
      suggested_action: string;
      confidence: number;
    }>;
    anomalies: Array<{
      anomaly_type: string;
      details: any;
      severity: string;
    }>;
    health: {
      health_score: number;
      velocity_score: number;
      stability_score: number;
    };
  };
}

function WarRoomTab() {
  const [data, setData] = useState<WarRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/warroom')
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading War Room...</span>
        </div>
        <div className="small text-muted mt-2">Loading War Room...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="alert alert-warning small">Unable to load War Room data.</div>;
  }

  const cs = data.coverage_summary;
  const completePct = cs.total > 0 ? Math.round((cs.verified_complete / cs.total) * 100) : 0;
  const partialPct = cs.total > 0 ? Math.round((cs.verified_partial / cs.total) * 100) : 0;

  return (
    <>
      {/* Risk Alert Banner */}
      {data.risk_summary && data.risk_summary.risks.length > 0 && (() => {
        const topRisk = data.risk_summary!.risks.reduce((a, b) =>
          a.risk_level === 'high' ? a : b.risk_level === 'high' ? b : a
        );
        const bannerStyle = topRisk.risk_level === 'high'
          ? { bg: '#fef2f2', border: '#ef4444', color: '#991b1b', icon: 'bi-exclamation-octagon-fill' }
          : topRisk.risk_level === 'medium'
          ? { bg: '#fef3c7', border: '#f59e0b', color: '#92400e', icon: 'bi-exclamation-triangle-fill' }
          : { bg: '#d1fae5', border: '#10b981', color: '#065f46', icon: 'bi-info-circle-fill' };
        return (
          <div className="p-3 rounded mb-4 small" style={{ background: bannerStyle.bg, border: `1px solid ${bannerStyle.border}` }}>
            <div className="fw-bold mb-1" style={{ color: bannerStyle.color }}>
              <i className={`bi ${bannerStyle.icon} me-2`}></i>
              {topRisk.risk_level.toUpperCase()} RISK: {topRisk.risk_type.replace(/_/g, ' ')}
            </div>
            <div style={{ color: bannerStyle.color }}>{topRisk.reason}</div>
            <div className="mt-1 fw-medium" style={{ color: bannerStyle.color }}>
              <i className="bi bi-arrow-right me-1"></i>{topRisk.suggested_action}
            </div>
          </div>
        );
      })()}

      {/* Health Scores */}
      {data.risk_summary?.health && (
        <div className="row g-3 mb-4">
          <div className="col-md-4">
            <StatCard icon="bi-heart-pulse" value={`${Math.round(data.risk_summary.health.health_score * 100)}%`} label="Health Score"
              color={data.risk_summary.health.health_score >= 0.7 ? 'var(--color-accent)' : data.risk_summary.health.health_score >= 0.4 ? '#f59e0b' : 'var(--color-secondary)'} />
          </div>
          <div className="col-md-4">
            <StatCard icon="bi-lightning" value={`${Math.round(data.risk_summary.health.velocity_score * 100)}%`} label="Velocity" color="var(--color-primary)" />
          </div>
          <div className="col-md-4">
            <StatCard icon="bi-shield-check" value={`${Math.round(data.risk_summary.health.stability_score * 100)}%`} label="Stability" color="var(--color-primary-light)" />
          </div>
        </div>
      )}

      {/* AI Workstation */}
      <div className="mb-4">
        <WorkstationLauncher />
      </div>

      {/* Header Stats */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <StatCard
            icon="bi-speedometer2"
            value={`${data.progress?.productionReadinessScore || 0}%`}
            label="Readiness Score"
            color={(data.progress?.productionReadinessScore || 0) >= 70 ? 'var(--color-accent)' : 'var(--color-secondary)'}
          />
        </div>
        <div className="col-md-3">
          <StatCard
            icon="bi-list-check"
            value={`${data.progress?.requirementsCompletionPct || 0}%`}
            label="Requirements"
            color="var(--color-primary)"
          />
        </div>
        <div className="col-md-3">
          <StatCard
            icon="bi-check-circle"
            value={`${cs.verified_complete}/${cs.total}`}
            label="Verified Complete"
            color="var(--color-accent)"
          />
        </div>
        <div className="col-md-3">
          <StatCard
            icon="bi-activity"
            value={`${data.recent_activity.length}`}
            label="Recent Events"
            color="var(--color-primary-light)"
          />
        </div>
      </div>

      {/* Current Action + System Decision */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-rocket-takeoff me-2" style={{ color: 'var(--color-primary)' }}></i>
              Current Action
            </div>
            <div className="card-body">
              {data.current_action ? (
                <>
                  <div className="fw-bold small mb-1">{data.current_action.title}</div>
                  <div className="d-flex gap-2 mb-2">
                    <ActionTypeBadge type={data.current_action.action_type} />
                    <span className={`badge ${data.current_action.status === 'accepted' ? 'bg-primary' : 'bg-secondary'}`}>
                      {data.current_action.status}
                    </span>
                    {data.current_action.completion_type && data.current_action.completion_type !== 'manual' && (
                      <span className="badge bg-info text-dark">{data.current_action.completion_type}</span>
                    )}
                  </div>
                  <div className="small text-muted">{data.current_action.reason}</div>
                  <div className="small mt-1">
                    Confidence: <strong>{Math.round(data.current_action.confidence_score * 100)}%</strong>
                  </div>
                </>
              ) : (
                <div className="text-muted small">
                  <i className="bi bi-check-circle-fill me-1" style={{ color: 'var(--color-accent)' }}></i>
                  No pending action — all requirements may be complete.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-graph-up me-2" style={{ color: 'var(--color-accent)' }}></i>
              Progress Breakdown
            </div>
            <div className="card-body">
              {data.progress?.breakdown ? (
                <div className="small">
                  <BreakdownBar label="Artifacts" score={data.progress.breakdown.artifactCompletion.score} detail={`${data.progress.breakdown.artifactCompletion.submitted}/${data.progress.breakdown.artifactCompletion.required}`} />
                  <BreakdownBar label="Requirements" score={data.progress.breakdown.requirementsCoverage.score} detail={`${data.progress.breakdown.requirementsCoverage.matched}/${data.progress.breakdown.requirementsCoverage.total}`} />
                  <BreakdownBar label="GitHub" score={data.progress.breakdown.githubHealth.score} detail={`${data.progress.breakdown.githubHealth.fileCount} files`} />
                  <BreakdownBar label="Portfolio" score={data.progress.breakdown.portfolioQuality.score} detail={`avg ${Math.round(data.progress.breakdown.portfolioQuality.avgScore)}%`} />
                  <BreakdownBar label="Workflow" score={data.progress.breakdown.workflowProgress.score} detail={data.progress.breakdown.workflowProgress.stage} />
                </div>
              ) : (
                <div className="text-muted small">No progress data available.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Requirement Coverage + Activity Feed */}
      <div className="row g-3 mb-4">
        <div className="col-md-7">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold small d-flex justify-content-between">
              <span><i className="bi bi-shield-check me-2" style={{ color: 'var(--color-primary)' }}></i>Requirement Coverage</span>
              <span className="text-muted">{completePct}% complete, {partialPct}% partial</span>
            </div>
            <div className="card-body p-0">
              {/* Coverage bar */}
              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="progress" style={{ height: 8 }}>
                  <div className="progress-bar bg-success" style={{ width: `${completePct}%` }}></div>
                  <div className="progress-bar bg-warning" style={{ width: `${partialPct}%` }}></div>
                </div>
              </div>
              {/* Requirements list */}
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {data.requirements.length > 0 ? data.requirements.map((req) => (
                  <div
                    key={req.requirement_id}
                    className="px-3 py-2 small"
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                    onClick={() => setExpandedReq(expandedReq === req.requirement_id ? null : req.requirement_id)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <span className="fw-medium me-2">{req.requirement_key}</span>
                        <VerificationBadge status={req.verification_status} />
                      </div>
                      <span className="text-muted">{Math.round(req.verification_confidence * 100)}%</span>
                    </div>
                    {expandedReq === req.requirement_id && (
                      <div className="mt-2 ps-2" style={{ borderLeft: '3px solid var(--color-border)' }}>
                        <div className="text-muted mb-1">{req.requirement_text}</div>
                        {req.verification_notes && <div className="text-muted mb-1"><strong>Notes:</strong> {req.verification_notes}</div>}
                        {req.semantic_reasoning && (
                          <div className="mb-1">
                            <strong>Semantic:</strong> <SemanticBadge status={req.semantic_status} /> {req.semantic_reasoning}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="p-3 text-muted small">No requirements extracted yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-5">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-clock-history me-2" style={{ color: 'var(--color-primary)' }}></i>
              Activity Feed
            </div>
            <div className="card-body p-0" style={{ maxHeight: 350, overflow: 'auto' }}>
              {data.recent_activity.length > 0 ? data.recent_activity.map((event, i) => (
                <div key={i} className="px-3 py-2 small" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <i className={`bi ${event.type === 'verification' ? 'bi-shield-check' : 'bi-arrow-right-circle'} me-1`}
                        style={{ color: event.type === 'verification' ? 'var(--color-primary)' : 'var(--color-accent)' }}></i>
                      <span className="fw-medium">{event.title}</span>
                    </div>
                    <span className="text-muted text-nowrap ms-2" style={{ fontSize: '0.7rem' }}>
                      {event.timestamp ? formatTime(event.timestamp) : ''}
                    </span>
                  </div>
                  {event.detail && <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>{truncate(event.detail, 120)}</div>}
                  {event.confidence > 0 && (
                    <div className="mt-1">
                      <span className="badge bg-light text-dark border" style={{ fontSize: '0.65rem' }}>
                        {Math.round(event.confidence * 100)}% confidence
                      </span>
                    </div>
                  )}
                </div>
              )) : (
                <div className="p-3 text-muted small">No activity recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Anomalies */}
      {data.risk_summary && data.risk_summary.anomalies.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">
            <i className="bi bi-bug me-2" style={{ color: '#f59e0b' }}></i>
            Detected Anomalies ({data.risk_summary.anomalies.length})
          </div>
          <div className="card-body p-0">
            {data.risk_summary.anomalies.map((anomaly, i) => (
              <div key={i} className="px-3 py-2 small d-flex justify-content-between align-items-start" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <span className="fw-medium">{anomaly.anomaly_type.replace(/_/g, ' ')}</span>
                  {anomaly.details && (
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {Object.entries(anomaly.details).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                    </div>
                  )}
                </div>
                <span className={`badge ${anomaly.severity === 'high' ? 'bg-danger' : anomaly.severity === 'medium' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                  {anomaly.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artifact Graph Summary */}
      {data.artifact_graph.nodes.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">
            <i className="bi bi-diagram-3 me-2" style={{ color: 'var(--color-primary)' }}></i>
            Artifact Graph ({data.artifact_graph.nodes.length} artifacts, {data.artifact_graph.edges.length} relationships)
          </div>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2">
              {data.artifact_graph.nodes.slice(0, 20).map((node: any) => (
                <span key={node.id} className="badge bg-light text-dark border py-2 px-3">
                  {node.name || node.id}
                </span>
              ))}
              {data.artifact_graph.nodes.length > 20 && (
                <span className="badge bg-secondary py-2 px-3">+{data.artifact_graph.nodes.length - 20} more</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body text-center py-3">
        <i className={`bi ${icon} d-block mb-1`} style={{ color, fontSize: '1.5rem' }}></i>
        <div className="fs-4 fw-bold" style={{ color }}>{value}</div>
        <div className="text-muted small">{label}</div>
      </div>
    </div>
  );
}

function BreakdownBar({ label, score, detail }: { label: string; score: number; detail: string }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'var(--color-accent)' : pct >= 40 ? '#f59e0b' : 'var(--color-secondary)';
  return (
    <div className="mb-2">
      <div className="d-flex justify-content-between mb-1">
        <span>{label}</span>
        <span className="text-muted">{detail} ({pct}%)</span>
      </div>
      <div className="progress" style={{ height: 6 }}>
        <div className="progress-bar" style={{ width: `${pct}%`, backgroundColor: color }}></div>
      </div>
    </div>
  );
}

function ActionTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    create_artifact: { label: 'Create', className: 'bg-primary' },
    update_artifact: { label: 'Update', className: 'bg-warning text-dark' },
    build_feature: { label: 'Build', className: 'bg-info text-dark' },
    fix_issue: { label: 'Fix', className: 'bg-danger' },
  };
  const badge = map[type] || { label: type, className: 'bg-secondary' };
  return <span className={`badge ${badge.className}`}>{badge.label}</span>;
}

function VerificationBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    verified_complete: { label: 'Verified', className: 'bg-success' },
    verified_partial: { label: 'Partial', className: 'bg-warning text-dark' },
    not_verified: { label: 'Not Verified', className: 'bg-secondary' },
  };
  const badge = map[status] || { label: status, className: 'bg-secondary' };
  return <span className={`badge ${badge.className}`}>{badge.label}</span>;
}

function SemanticBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    semantic_aligned: { label: 'Aligned', className: 'bg-success' },
    semantic_partial: { label: 'Partial', className: 'bg-warning text-dark' },
    semantic_not_aligned: { label: 'Not Aligned', className: 'bg-danger' },
    unknown: { label: 'Unknown', className: 'bg-secondary' },
  };
  const badge = map[status] || { label: status, className: 'bg-secondary' };
  return <span className={`badge ${badge.className} me-1`}>{badge.label}</span>;
}

function formatTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}

export default WarRoomTab;
