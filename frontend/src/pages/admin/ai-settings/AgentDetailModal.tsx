import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface AgentDetail {
  agent: {
    id: string;
    agent_name: string;
    agent_type: string;
    status: string;
    category: string;
    trigger_type: string;
    schedule: string | null;
    description: string | null;
    enabled: boolean;
    run_count: number;
    error_count: number;
    avg_duration_ms: number | null;
    last_run_at: string | null;
    last_error: string | null;
    last_error_at: string | null;
    module: string | null;
    source_file: string | null;
    config: Record<string, any> | null;
    last_result: Record<string, any> | null;
    next_run_at: string | null;
    next_run_label: string | null;
  };
  recent_activity: Array<{
    id: string;
    action: string;
    result: string;
    confidence: number | null;
    duration_ms: number | null;
    trace_id: string | null;
    created_at: string;
    campaign?: { name: string; status: string };
  }>;
  actions_today: number;
  errors_today: number;
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'primary',
  paused: 'warning',
  error: 'danger',
};

const CATEGORY_COLORS: Record<string, string> = {
  outbound: 'primary',
  behavioral: 'info',
  maintenance: 'secondary',
  ai_ops: 'warning',
  accelerator: 'success',
};

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AgentDetailModal({
  agentId,
  onClose,
  onRefresh,
}: {
  agentId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/ai-ops/registry/${agentId}`);
        setDetail(data);
      } catch (err) {
        console.error('Failed to fetch agent detail:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  const handleControl = async (action: string) => {
    setControlLoading(true);
    try {
      await api.post(`/api/admin/ai-ops/registry/${agentId}/control`, { action });
      const { data } = await api.get(`/api/admin/ai-ops/registry/${agentId}`);
      setDetail(data);
      onRefresh();
    } catch (err) {
      console.error('Failed to control agent:', err);
    } finally {
      setControlLoading(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              Agent Detail
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : !detail ? (
              <p className="text-muted">Agent not found</p>
            ) : (
              <>
                {/* Header */}
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <div>
                    <h5 className="fw-bold mb-1">{detail.agent.agent_name}</h5>
                    <div className="d-flex gap-2 align-items-center">
                      <span className={`badge bg-${STATUS_COLORS[detail.agent.status] || 'secondary'}`}>
                        {detail.agent.status}
                      </span>
                      <span className={`badge bg-${CATEGORY_COLORS[detail.agent.category] || 'secondary'}`}>
                        {detail.agent.category?.replace('_', ' ')}
                      </span>
                      <span className={`badge bg-${detail.agent.enabled ? 'success' : 'danger'}`}>
                        {detail.agent.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <div className="d-flex gap-1">
                    {detail.agent.status === 'paused' ? (
                      <button className="btn btn-sm btn-outline-success" onClick={() => handleControl('resume')} disabled={controlLoading}>
                        Resume
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-warning" onClick={() => handleControl('pause')} disabled={controlLoading}>
                        Pause
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${detail.agent.enabled ? 'btn-outline-danger' : 'btn-outline-success'}`}
                      onClick={() => handleControl(detail.agent.enabled ? 'disable' : 'enable')}
                      disabled={controlLoading}
                    >
                      {detail.agent.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>

                {/* Description */}
                {detail.agent.description && (
                  <div className="mb-3">
                    <label className="form-label small fw-medium text-muted">Description</label>
                    <p className="mb-0">{detail.agent.description}</p>
                  </div>
                )}

                {/* Metadata */}
                <div className="row g-3 mb-4">
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Type</div>
                        <div className="fw-medium small">{detail.agent.agent_type}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Schedule</div>
                        <code className="small">{detail.agent.schedule || '—'}</code>
                        {detail.agent.next_run_label && (
                          <div className="small text-primary mt-1">Next: {detail.agent.next_run_label}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Module</div>
                        <div className="fw-medium small">{detail.agent.module || '—'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Source</div>
                        <div className="fw-medium small text-truncate" title={detail.agent.source_file || ''}>
                          {detail.agent.source_file || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance KPIs */}
                <div className="row g-3 mb-4">
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Total Runs</div>
                        <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>{detail.agent.run_count}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Avg Duration</div>
                        <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary-light)' }}>
                          {formatDuration(detail.agent.avg_duration_ms)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Actions Today</div>
                        <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-accent)' }}>{detail.actions_today}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-6 col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body py-2 text-center">
                        <div className="small text-muted">Errors Today</div>
                        <div className="h5 fw-bold mb-0" style={{ color: detail.errors_today > 0 ? 'var(--color-secondary)' : 'var(--color-accent)' }}>
                          {detail.errors_today}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Last Error */}
                {detail.agent.last_error && (
                  <div className="alert alert-danger small mb-4">
                    <strong>Last Error</strong> ({timeAgo(detail.agent.last_error_at)}):
                    <div className="mt-1">{detail.agent.last_error}</div>
                  </div>
                )}

                {/* Config */}
                {detail.agent.config && Object.keys(detail.agent.config).length > 0 && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Configuration</label>
                    <pre className="small bg-light p-3 rounded mb-0" style={{ maxHeight: 200, overflow: 'auto' }}>
                      {JSON.stringify(detail.agent.config, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Last Result */}
                {detail.agent.last_result && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Last Execution Result</label>
                    <div className="bg-light p-3 rounded small">
                      {(() => {
                        const r = detail.agent.last_result!;
                        if (r.campaigns_scanned != null) {
                          return (
                            <div className="d-flex flex-wrap gap-3">
                              <span>Scanned <strong>{r.campaigns_scanned}</strong> campaign(s)</span>
                              {r.healthy != null && <span className="badge bg-success">{r.healthy} healthy</span>}
                              {r.degraded != null && r.degraded > 0 && <span className="badge bg-warning text-dark">{r.degraded} degraded</span>}
                              {r.critical != null && r.critical > 0 && <span className="badge bg-danger">{r.critical} critical</span>}
                              <span className="text-muted">{formatDuration(r.duration_ms)}</span>
                            </div>
                          );
                        }
                        if (r.campaigns_processed != null) {
                          const actionCount = r.actions_taken ?? 0;
                          const errorCount = r.errors ?? 0;
                          return (
                            <div className="d-flex flex-wrap gap-3">
                              <span>Processed <strong>{r.campaigns_processed}</strong> item(s)</span>
                              <span>{actionCount > 0 ? <strong>{actionCount} action(s) taken</strong> : <span className="text-muted">No issues detected</span>}</span>
                              {errorCount > 0 && <span className="badge bg-danger">{errorCount} error(s)</span>}
                              <span className="text-muted">{formatDuration(r.duration_ms)}</span>
                            </div>
                          );
                        }
                        return <pre className="mb-0" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(r, null, 2)}</pre>;
                      })()}
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                <div>
                  <label className="form-label small fw-medium text-muted">
                    Recent Executions ({detail.recent_activity.length})
                  </label>
                  {detail.recent_activity.length === 0 ? (
                    <p className="text-muted small">No execution history yet</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0 small">
                        <thead className="table-light">
                          <tr>
                            <th>Action</th>
                            <th>Campaign</th>
                            <th>Result</th>
                            <th>Confidence</th>
                            <th>Duration</th>
                            <th>Time</th>
                            <th>Trace</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.recent_activity.map((a) => (
                            <tr key={a.id}>
                              <td>
                                {a.action === 'scan_completed_no_issues' ? (
                                  <span className="text-muted">No issues detected</span>
                                ) : a.action === 'agent_execution_completed' ? (
                                  <span className="text-muted">Completed (no details)</span>
                                ) : (
                                  <span>{a.action}</span>
                                )}
                              </td>
                              <td className="text-muted">{a.campaign?.name || '—'}</td>
                              <td>
                                <span className={`badge bg-${RESULT_COLORS[a.result] || 'secondary'}`}>
                                  {a.result}
                                </span>
                              </td>
                              <td>
                                {a.confidence != null ? (
                                  <span className={`badge bg-${Number(a.confidence) >= 0.8 ? 'success' : Number(a.confidence) >= 0.6 ? 'warning' : 'danger'}`}>
                                    {(Number(a.confidence) * 100).toFixed(0)}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td>{formatDuration(a.duration_ms)}</td>
                              <td className="text-muted">{timeAgo(a.created_at)}</td>
                              <td>
                                {a.trace_id ? (
                                  <code className="small" title={a.trace_id}>
                                    {a.trace_id.substring(0, 8)}
                                  </code>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
