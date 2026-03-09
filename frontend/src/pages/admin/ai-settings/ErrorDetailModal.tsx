import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface ErrorDetailData {
  error: {
    id: string;
    campaign_id: string;
    component: string;
    severity: string;
    error_message: string;
    context: Record<string, any> | null;
    resolved: boolean;
    resolved_at: string | null;
    resolved_by: string | null;
    stack_trace: string | null;
    ai_reasoning: string | null;
    repair_attempt_id: string | null;
    retry_count: number;
    last_retry_at: string | null;
    created_at: string;
    campaign?: { name: string; status: string; type: string };
    repairAttempt?: {
      id: string;
      agent_id: string;
      action: string;
      result: string;
      reason: string | null;
      created_at: string;
      trace_id: string | null;
      agent?: { agent_name: string };
    };
  };
  retry_history: Array<{
    id: string;
    severity: string;
    error_message: string;
    resolved: boolean;
    resolved_by: string | null;
    retry_count: number;
    created_at: string;
  }>;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
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

export default function ErrorDetailModal({
  errorId,
  onClose,
  onResolve,
  onViewTrace,
}: {
  errorId: string;
  onClose: () => void;
  onResolve?: (id: string) => void;
  onViewTrace?: (traceId: string) => void;
}) {
  const [detail, setDetail] = useState<ErrorDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/ai-ops/errors/${errorId}`);
        setDetail(data);
      } catch (err) {
        console.error('Failed to fetch error detail:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [errorId]);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Error Detail</h5>
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
              <p className="text-muted">Error not found</p>
            ) : (
              <>
                {/* Header */}
                <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
                  <span className={`badge bg-${SEVERITY_COLORS[detail.error.severity] || 'secondary'}`}>
                    {detail.error.severity}
                  </span>
                  <span className="badge bg-secondary">{detail.error.component}</span>
                  {detail.error.campaign && (
                    <span className="badge bg-info">{detail.error.campaign.name}</span>
                  )}
                  <span className={`badge bg-${detail.error.resolved ? 'success' : 'danger'}`}>
                    {detail.error.resolved ? 'Resolved' : 'Unresolved'}
                  </span>
                  {detail.error.retry_count > 0 && (
                    <span className="badge bg-warning">{detail.error.retry_count} retries</span>
                  )}
                </div>

                {/* Error Message */}
                <div className="alert alert-danger mb-4">
                  <strong>Error Message</strong>
                  <div className="mt-1">{detail.error.error_message}</div>
                </div>

                {/* Timestamps */}
                <div className="row g-3 mb-4 small">
                  <div className="col-sm-4">
                    <label className="form-label fw-medium text-muted">Occurred</label>
                    <div>{new Date(detail.error.created_at).toLocaleString()}</div>
                  </div>
                  {detail.error.resolved_at && (
                    <div className="col-sm-4">
                      <label className="form-label fw-medium text-muted">Resolved</label>
                      <div>{new Date(detail.error.resolved_at).toLocaleString()} by {detail.error.resolved_by}</div>
                    </div>
                  )}
                  {detail.error.last_retry_at && (
                    <div className="col-sm-4">
                      <label className="form-label fw-medium text-muted">Last Retry</label>
                      <div>{timeAgo(detail.error.last_retry_at)}</div>
                    </div>
                  )}
                </div>

                {/* Stack Trace */}
                {detail.error.stack_trace && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Stack Trace</label>
                    <pre className="small bg-dark text-light p-3 rounded mb-0" style={{ maxHeight: 300, overflow: 'auto' }}>
                      {detail.error.stack_trace}
                    </pre>
                  </div>
                )}

                {/* AI Reasoning */}
                {detail.error.ai_reasoning && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">AI Analysis</label>
                    <div className="bg-light p-3 rounded">{detail.error.ai_reasoning}</div>
                  </div>
                )}

                {/* Context */}
                {detail.error.context && Object.keys(detail.error.context).length > 0 && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Error Context</label>
                    <pre className="small bg-light p-3 rounded mb-0" style={{ maxHeight: 200, overflow: 'auto' }}>
                      {JSON.stringify(detail.error.context, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Repair Attempt */}
                {detail.error.repairAttempt && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Repair Attempt</label>
                    <div className="card border-0 bg-light">
                      <div className="card-body py-2">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong className="small">{detail.error.repairAttempt.agent?.agent_name || 'Unknown Agent'}</strong>
                            <span className="mx-2 text-muted">|</span>
                            <span className="small">{detail.error.repairAttempt.action}</span>
                          </div>
                          <div className="d-flex gap-2 align-items-center">
                            <span className={`badge bg-${RESULT_COLORS[detail.error.repairAttempt.result] || 'secondary'}`}>
                              {detail.error.repairAttempt.result}
                            </span>
                            <span className="small text-muted">{timeAgo(detail.error.repairAttempt.created_at)}</span>
                          </div>
                        </div>
                        {detail.error.repairAttempt.reason && (
                          <div className="small text-muted mt-1">{detail.error.repairAttempt.reason}</div>
                        )}
                        {detail.error.repairAttempt.trace_id && onViewTrace && (
                          <button
                            className="btn btn-sm btn-outline-primary mt-2 py-0 px-2"
                            onClick={() => onViewTrace(detail.error.repairAttempt!.trace_id!)}
                          >
                            View Repair Trace
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Retry History */}
                {detail.retry_history.length > 0 && (
                  <div>
                    <label className="form-label small fw-medium text-muted">
                      Related Errors ({detail.retry_history.length})
                    </label>
                    <div className="table-responsive">
                      <table className="table table-hover mb-0 small">
                        <thead className="table-light">
                          <tr>
                            <th>Severity</th>
                            <th>Message</th>
                            <th>Resolved</th>
                            <th>Retries</th>
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.retry_history.map((h) => (
                            <tr key={h.id}>
                              <td>
                                <span className={`badge bg-${SEVERITY_COLORS[h.severity] || 'secondary'}`}>
                                  {h.severity}
                                </span>
                              </td>
                              <td className="text-truncate" style={{ maxWidth: 300 }} title={h.error_message}>
                                {h.error_message}
                              </td>
                              <td>
                                <span className={`badge bg-${h.resolved ? 'success' : 'danger'}`}>
                                  {h.resolved ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td>{h.retry_count}</td>
                              <td className="text-muted">{timeAgo(h.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            {detail && !detail.error.resolved && onResolve && (
              <button
                className="btn btn-sm btn-success"
                onClick={() => { onResolve(detail.error.id); onClose(); }}
              >
                Mark Resolved
              </button>
            )}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
