import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface ActivityDetail {
  id: string;
  agent_id: string;
  campaign_id: string | null;
  action: string;
  reason: string | null;
  confidence: number | null;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  result: string;
  details: Record<string, any> | null;
  trace_id: string | null;
  duration_ms: number | null;
  execution_context: Record<string, any> | null;
  stack_trace: string | null;
  created_at: string;
  agent?: { agent_name: string; agent_type: string; category: string; description: string | null };
  campaign?: { name: string; status: string; type: string };
}

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ActivityDetailModal({
  activityId,
  onClose,
  onViewTrace,
}: {
  activityId: string;
  onClose: () => void;
  onViewTrace?: (traceId: string) => void;
}) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/ai-ops/activity/${activityId}`);
        setDetail(data);
      } catch (err) {
        console.error('Failed to fetch activity detail:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId]);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">AI Decision Detail</h5>
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
              <p className="text-muted">Activity not found</p>
            ) : (
              <>
                {/* Header badges */}
                <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
                  <span className={`badge bg-${RESULT_COLORS[detail.result] || 'secondary'}`}>
                    {detail.result}
                  </span>
                  {detail.agent && (
                    <span className="badge bg-primary">{detail.agent.agent_name}</span>
                  )}
                  {detail.campaign && (
                    <span className="badge bg-info">{detail.campaign.name}</span>
                  )}
                  {detail.confidence != null && (
                    <span className={`badge bg-${Number(detail.confidence) >= 0.8 ? 'success' : Number(detail.confidence) >= 0.6 ? 'warning' : 'danger'}`}>
                      Confidence: {(Number(detail.confidence) * 100).toFixed(0)}%
                    </span>
                  )}
                  {detail.duration_ms != null && (
                    <span className="badge bg-secondary">{formatDuration(detail.duration_ms)}</span>
                  )}
                </div>

                {/* Action + Time */}
                <div className="row g-3 mb-4">
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Action</label>
                    <div className="fw-semibold">{detail.action}</div>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Timestamp</label>
                    <div>{new Date(detail.created_at).toLocaleString()}</div>
                  </div>
                </div>

                {/* Reasoning */}
                {detail.reason && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">AI Reasoning</label>
                    <div className="bg-light p-3 rounded">{detail.reason}</div>
                  </div>
                )}

                {/* Input Signals */}
                {detail.execution_context && Object.keys(detail.execution_context).length > 0 && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Input Signals / Execution Context</label>
                    <pre className="small bg-light p-3 rounded mb-0" style={{ maxHeight: 200, overflow: 'auto' }}>
                      {JSON.stringify(detail.execution_context, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Before/After State */}
                {(detail.before_state || detail.after_state) && (
                  <div className="row g-3 mb-4">
                    {detail.before_state && (
                      <div className="col-md-6">
                        <label className="form-label small fw-medium text-muted">Before State</label>
                        <pre className="small bg-light p-3 rounded mb-0" style={{ maxHeight: 250, overflow: 'auto' }}>
                          {JSON.stringify(detail.before_state, null, 2)}
                        </pre>
                      </div>
                    )}
                    {detail.after_state && (
                      <div className="col-md-6">
                        <label className="form-label small fw-medium text-muted">After State</label>
                        <pre className="small bg-light p-3 rounded mb-0" style={{ maxHeight: 250, overflow: 'auto' }}>
                          {JSON.stringify(detail.after_state, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Details */}
                {detail.details && Object.keys(detail.details).length > 0 && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-muted">Execution Details</label>
                    <pre className="small bg-light p-3 rounded mb-0" style={{ maxHeight: 200, overflow: 'auto' }}>
                      {JSON.stringify(detail.details, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Stack Trace */}
                {detail.stack_trace && (
                  <div className="mb-4">
                    <label className="form-label small fw-medium text-danger">Stack Trace</label>
                    <pre className="small bg-dark text-light p-3 rounded mb-0" style={{ maxHeight: 300, overflow: 'auto' }}>
                      {detail.stack_trace}
                    </pre>
                  </div>
                )}

                {/* Trace Link */}
                {detail.trace_id && onViewTrace && (
                  <div className="mb-3">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => onViewTrace(detail.trace_id!)}
                    >
                      View Full Execution Trace
                    </button>
                    <code className="ms-2 small text-muted">{detail.trace_id}</code>
                  </div>
                )}
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
