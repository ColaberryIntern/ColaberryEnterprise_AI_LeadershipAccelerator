import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface TraceStep {
  id: string;
  action: string;
  result: string;
  confidence: number | null;
  duration_ms: number | null;
  reason: string | null;
  details: Record<string, any> | null;
  created_at: string;
  agent?: { agent_name: string; agent_type: string; category: string };
  campaign?: { name: string; status: string };
}

interface TraceData {
  trace_id: string;
  steps: TraceStep[];
  total: number;
}

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

const DOT_COLORS: Record<string, string> = {
  success: '#38a169',
  failed: '#e53e3e',
  skipped: '#718096',
  pending: '#e0a800',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ExecutionTraceModal({
  traceId,
  onClose,
}: {
  traceId: string;
  onClose: () => void;
}) {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/ai-ops/trace/${traceId}`);
        setTrace(data);
      } catch (err) {
        console.error('Failed to fetch trace:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [traceId]);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">Execution Trace</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : !trace || trace.steps.length === 0 ? (
              <p className="text-muted">No trace data found for this execution.</p>
            ) : (
              <>
                <div className="mb-3 d-flex justify-content-between align-items-center">
                  <div>
                    <code className="small">{trace.trace_id}</code>
                  </div>
                  <span className="badge bg-secondary">{trace.total} steps</span>
                </div>

                {/* Vertical Timeline */}
                <div className="position-relative" style={{ paddingLeft: 30 }}>
                  {/* Vertical line */}
                  <div
                    className="position-absolute"
                    style={{
                      left: 11,
                      top: 8,
                      bottom: 8,
                      width: 2,
                      backgroundColor: 'var(--color-border, #e2e8f0)',
                    }}
                  />

                  {trace.steps.map((step, i) => (
                    <div key={step.id} className="position-relative mb-3">
                      {/* Dot */}
                      <div
                        className="position-absolute rounded-circle"
                        style={{
                          left: -24,
                          top: 6,
                          width: 12,
                          height: 12,
                          backgroundColor: DOT_COLORS[step.result] || '#718096',
                          border: '2px solid white',
                          boxShadow: '0 0 0 1px ' + (DOT_COLORS[step.result] || '#718096'),
                        }}
                      />

                      {/* Step Card */}
                      <div
                        className="card border-0 shadow-sm"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                      >
                        <div className="card-body py-2 px-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex gap-2 align-items-center">
                              <span className="fw-medium small">{step.action}</span>
                              <span className={`badge bg-${RESULT_COLORS[step.result] || 'secondary'}`} style={{ fontSize: '0.7rem' }}>
                                {step.result}
                              </span>
                              {step.confidence != null && (
                                <span className="text-muted small">
                                  {(Number(step.confidence) * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="d-flex gap-2 align-items-center small text-muted">
                              {step.duration_ms != null && (
                                <span>{formatDuration(step.duration_ms)}</span>
                              )}
                              <span>{new Date(step.created_at).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          {step.agent && (
                            <div className="small text-muted mt-1">
                              Agent: {step.agent.agent_name}
                              {step.campaign && <> | Campaign: {step.campaign.name}</>}
                            </div>
                          )}

                          {/* Expanded Details */}
                          {expandedStep === step.id && (
                            <div className="mt-2 pt-2 border-top">
                              {step.reason && (
                                <div className="mb-2">
                                  <strong className="small">Reason:</strong>
                                  <div className="small">{step.reason}</div>
                                </div>
                              )}
                              {step.details && Object.keys(step.details).length > 0 && (
                                <div>
                                  <strong className="small">Details:</strong>
                                  <pre className="small bg-light p-2 rounded mb-0 mt-1" style={{ maxHeight: 150, overflow: 'auto' }}>
                                    {JSON.stringify(step.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
