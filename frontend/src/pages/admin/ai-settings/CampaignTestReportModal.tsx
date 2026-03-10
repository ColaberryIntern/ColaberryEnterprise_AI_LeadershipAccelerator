import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface TestStep {
  id: string;
  step_name: string;
  channel: string | null;
  status: 'passed' | 'failed' | 'skipped';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  details: Record<string, any> | null;
  error_message: string | null;
}

interface TestRun {
  id: string;
  campaign_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  score: number | null;
  initiated_by: string;
  summary: Record<string, any> | null;
  campaign?: { name: string; status: string; type: string };
  steps?: TestStep[];
}

const STEP_ICONS: Record<string, string> = {
  create_lead: 'bi-person-plus',
  enroll_lead: 'bi-person-check',
  send_email: 'bi-envelope',
  send_sms: 'bi-chat-dots',
  initiate_voice: 'bi-telephone',
  ai_conversation: 'bi-robot',
  pipeline_update: 'bi-kanban',
};

const STATUS_COLORS: Record<string, string> = {
  passed: 'success',
  failed: 'danger',
  skipped: 'secondary',
};

function CampaignTestReportModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<TestRun | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/admin/testing/runs/${runId}`)
      .then(({ data }) => setRun(data))
      .catch((err) => console.error('Failed to load test run:', err))
      .finally(() => setLoading(false));
  }, [runId]);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              Campaign Test Report
              {run?.campaign?.name && (
                <span className="text-muted fw-normal ms-2">— {run.campaign.name}</span>
              )}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : !run ? (
              <p className="text-muted">Test run not found.</p>
            ) : (
              <>
                {/* Header KPIs */}
                <div className="row g-3 mb-4">
                  <div className="col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body text-center py-2">
                        <div className="small text-muted">Score</div>
                        <div className={`h3 fw-bold mb-0 text-${run.score != null && run.score >= 80 ? 'success' : run.score != null && run.score >= 50 ? 'warning' : 'danger'}`}>
                          {run.score ?? '—'}<span className="small text-muted">/100</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body text-center py-2">
                        <div className="small text-muted">Status</div>
                        <span className={`badge bg-${STATUS_COLORS[run.status] || 'secondary'} fs-6`}>
                          {run.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body text-center py-2">
                        <div className="small text-muted">Duration</div>
                        <div className="fw-bold">
                          {run.summary?.duration_ms != null
                            ? run.summary.duration_ms < 1000
                              ? `${run.summary.duration_ms}ms`
                              : `${(run.summary.duration_ms / 1000).toFixed(1)}s`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body text-center py-2">
                        <div className="small text-muted">Initiated By</div>
                        <span className={`badge bg-${run.initiated_by === 'qa_agent' ? 'warning' : 'primary'}`}>
                          {run.initiated_by === 'qa_agent' ? 'QA Agent' : 'Manual'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Channel Verification Summary */}
                {run.summary?.channels_tested && run.summary.channels_tested.length > 0 && (
                  <div className="mb-4">
                    <h6 className="fw-semibold mb-2">Channels Tested</h6>
                    <div className="d-flex gap-2">
                      {run.summary.channels_tested.map((ch: string) => (
                        <span key={ch} className="badge bg-info fs-6">{ch}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step Results Timeline */}
                <h6 className="fw-semibold mb-3">Test Steps</h6>
                <div className="position-relative">
                  {/* Vertical line */}
                  <div
                    className="position-absolute"
                    style={{
                      left: 16,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: 'var(--color-border)',
                    }}
                  />

                  {(run.steps || []).map((step) => (
                    <div key={step.id} className="d-flex align-items-start mb-3 position-relative">
                      {/* Timeline dot */}
                      <div
                        className={`rounded-circle bg-${STATUS_COLORS[step.status] || 'secondary'} flex-shrink-0`}
                        style={{
                          width: 12,
                          height: 12,
                          marginTop: 6,
                          marginLeft: 11,
                          zIndex: 1,
                        }}
                      />

                      {/* Step card */}
                      <div
                        className="card border-0 shadow-sm ms-3 flex-grow-1"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                      >
                        <div className="card-body py-2 px-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center gap-2">
                              <span className={`badge bg-${STATUS_COLORS[step.status]}`}>
                                {step.status}
                              </span>
                              <span className="fw-medium">
                                {step.step_name.replace(/_/g, ' ')}
                              </span>
                              {step.channel && (
                                <span className="badge bg-light text-dark border">
                                  {step.channel}
                                </span>
                              )}
                            </div>
                            <div className="text-muted small">
                              {step.duration_ms != null
                                ? step.duration_ms < 1000
                                  ? `${step.duration_ms}ms`
                                  : `${(step.duration_ms / 1000).toFixed(1)}s`
                                : ''}
                            </div>
                          </div>

                          {step.error_message && (
                            <div className="text-danger small mt-1">{step.error_message}</div>
                          )}

                          {/* Expanded details */}
                          {expandedStep === step.id && step.details && (
                            <div className="mt-2 pt-2 border-top">
                              <pre className="small mb-0" style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(step.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!run.steps || run.steps.length === 0) && (
                    <p className="text-muted ms-5">No step data available.</p>
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

export default CampaignTestReportModal;
