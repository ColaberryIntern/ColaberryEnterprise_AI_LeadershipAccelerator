import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../../utils/api';
import SimulationTimeline from './SimulationTimeline';
import type { SimStep } from './SimulationTimeline';
import CommunicationLogPanel from '../../../components/CommunicationLogPanel';
import EmailPreview from '../../../components/EmailPreview';

type SpeedMode = 'normal' | 'fast' | 'ultra' | 'instant';

interface SimulationState {
  id: string;
  campaign_id: string;
  speed_mode: SpeedMode;
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  current_step_index: number;
  total_steps: number;
  started_at: string;
  paused_at: string | null;
  completed_at: string | null;
  summary: {
    channels_used?: string[];
    steps_passed?: number;
    steps_failed?: number;
    steps_skipped?: number;
    total_duration_ms?: number;
    ai_tokens_used?: number;
  } | null;
  steps: SimStep[];
}

const SPEED_OPTIONS: { value: SpeedMode; label: string; desc: string }[] = [
  { value: 'normal', label: 'Normal', desc: '5 min/day' },
  { value: 'fast', label: 'Fast', desc: '90s/day' },
  { value: 'ultra', label: 'Ultra', desc: '30s/day' },
  { value: 'instant', label: 'Instant', desc: 'Manual' },
];

const OUTCOME_OPTIONS = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'meeting_booked', label: 'Meeting Booked' },
  { value: 'no_response', label: 'No Response' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
];

export default function CampaignSimulatorPanel({
  campaignId,
  campaignName,
  activeSimId,
  onClose,
}: {
  campaignId: string;
  campaignName: string;
  activeSimId?: string;
  onClose: () => void;
}) {
  const [speedMode, setSpeedMode] = useState<SpeedMode>('fast');
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseOutcome, setResponseOutcome] = useState('interested');
  const [responseText, setResponseText] = useState('');
  const [showCommLog, setShowCommLog] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Lead profile & template variable inputs
  const [leadName, setLeadName] = useState('Ali Merchant');
  const [leadCompany, setLeadCompany] = useState('Colaberry');
  const [leadTitle, setLeadTitle] = useState('CEO');
  const [leadIndustry, setLeadIndustry] = useState('Technology');
  const [customVars, setCustomVars] = useState<string[]>([]);
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  const isActive = simulation && (simulation.status === 'running' || simulation.status === 'paused');

  // Detect custom template variables from campaign sequence steps
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/campaigns/${campaignId}`);
        const steps = data.sequence?.steps || [];
        const standardVars = new Set(['name', 'company', 'title', 'email', 'phone', 'cohort_name', 'cohort_start', 'seats_remaining', 'conversation_history']);
        const varPattern = /\{\{(\w+)\}\}/g;
        const found = new Set<string>();
        for (const s of steps) {
          for (const text of [s.subject, s.body_template, s.sms_template]) {
            if (!text) continue;
            let m;
            while ((m = varPattern.exec(text)) !== null) {
              if (!standardVars.has(m[1])) found.add(m[1]);
            }
          }
        }
        setCustomVars(Array.from(found));
      } catch { /* ignore */ }
    })();
  }, [campaignId]);

  const fetchState = useCallback(async (simId: string) => {
    try {
      const { data } = await api.get(`/api/admin/simulations/${simId}`);
      setSimulation(data);
      // Stop polling if completed
      if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err: any) {
      console.error('Poll error:', err);
    }
  }, []);

  // Auto-load existing simulation if activeSimId is provided
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (activeSimId && !didLoadRef.current) {
      didLoadRef.current = true;
      fetchState(activeSimId);
    }
  }, [activeSimId, fetchState]);

  // Start polling when simulation is active
  useEffect(() => {
    if (simulation && isActive && !pollRef.current) {
      pollRef.current = window.setInterval(() => {
        fetchState(simulation.id);
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [simulation?.id, isActive, fetchState]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/admin/simulations/campaigns/${campaignId}/start`, {
        speed_mode: speedMode,
        lead_overrides: { name: leadName, company: leadCompany, title: leadTitle, industry: leadIndustry },
        template_vars: varValues,
      });
      setSimulation(data);
      // Immediately fetch full state with steps
      await fetchState(data.id);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleAction(action: string, body?: Record<string, any>) {
    if (!simulation) return;
    try {
      await api.post(`/api/admin/simulations/${simulation.id}/${action}`, body || {});
      await fetchState(simulation.id);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }

  async function handleRespond() {
    await handleAction('respond', { outcome: responseOutcome, response_text: responseText });
    setResponseText('');
  }

  const currentStep = simulation?.steps?.find((s) => s.step_index === simulation.current_step_index);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          {/* Header */}
          <div className="modal-header">
            <div>
              <h5 className="modal-title fw-bold mb-0">Campaign Time-Warp Simulator</h5>
              <small className="text-muted">{campaignName}</small>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body">
            {error && (
              <div className="alert alert-danger alert-dismissible fade show py-2 small" role="alert">
                {error}
                <button type="button" className="btn-close btn-close-sm" onClick={() => setError(null)} aria-label="Close" />
              </div>
            )}

            {/* Pre-start: Speed mode + lead profile + template vars */}
            {!simulation && (
              <div className="py-3">
                <p className="text-muted mb-3 text-center">
                  Run through your entire campaign as a lead would experience it — with compressed time delays.
                </p>

                {/* Speed mode */}
                <div className="d-flex justify-content-center gap-2 mb-4">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`btn btn-sm ${speedMode === opt.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSpeedMode(opt.value)}
                    >
                      <div className="fw-medium">{opt.label}</div>
                      <div style={{ fontSize: '0.65rem' }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Custom template variables (auto-detected from sequence) */}
                {customVars.length > 0 && (
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-header bg-white py-2">
                      <span className="small fw-semibold">Campaign Variables</span>
                      <span className="text-muted small ms-2">detected from sequence templates</span>
                    </div>
                    <div className="card-body py-2">
                      <div className="row g-2">
                        {customVars.map((v) => (
                          <div className="col-md-4" key={v}>
                            <label className="form-label small fw-medium mb-1">
                              {v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder={`{{${v}}}`}
                              value={varValues[v] || ''}
                              onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <button
                    className="btn btn-primary"
                    onClick={handleStart}
                    disabled={starting}
                  >
                    {starting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status">
                          <span className="visually-hidden">Starting...</span>
                        </span>
                        Starting Simulation...
                      </>
                    ) : (
                      'Start Simulation'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Active simulation */}
            {simulation && (
              <div className="row g-3">
                {/* Left: Timeline */}
                <div className="col-lg-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small fw-semibold">Steps</span>
                    <span className={`badge bg-${simulation.status === 'running' ? 'primary' : simulation.status === 'paused' ? 'warning' : simulation.status === 'completed' ? 'success' : 'secondary'}`}>
                      {simulation.status}
                    </span>
                  </div>
                  <SimulationTimeline
                    steps={simulation.steps || []}
                    currentStepIndex={simulation.current_step_index}
                    onJump={isActive ? (idx) => handleAction('jump', { step_index: idx }) : undefined}
                  />
                </div>

                {/* Right: Step Inspector */}
                <div className="col-lg-8">
                  {currentStep ? (
                    <div className="card border-0 shadow-sm">
                      <div className="card-header bg-white d-flex justify-content-between align-items-center">
                        <span className="fw-semibold small">
                          Step {currentStep.step_index + 1} of {simulation.total_steps}
                          <span className="badge bg-secondary ms-2" style={{ fontSize: '0.6rem' }}>
                            {currentStep.channel}
                          </span>
                        </span>
                        <span className="small text-muted">
                          {currentStep.duration_ms != null ? `${(currentStep.duration_ms / 1000).toFixed(1)}s` : ''}
                        </span>
                      </div>
                      <div className="card-body small">
                        {/* Step definition */}
                        {currentStep.definition && (
                          <div className="mb-3">
                            {currentStep.definition.step_goal && (
                              <div className="mb-1">
                                <strong>Goal:</strong> {currentStep.definition.step_goal}
                              </div>
                            )}
                            {currentStep.definition.ai_instructions && (
                              <div className="mb-1 text-muted">
                                <strong>AI Instructions:</strong>{' '}
                                <span className="text-truncate d-inline-block" style={{ maxWidth: 400 }}>
                                  {currentStep.definition.ai_instructions}
                                </span>
                              </div>
                            )}
                            <div className="text-muted">
                              <strong>Delay:</strong> {currentStep.original_delay_days} day(s)
                              {currentStep.compressed_delay_ms > 0 && (
                                <span className="ms-1">
                                  (compressed to {currentStep.compressed_delay_ms < 60000
                                    ? `${Math.round(currentStep.compressed_delay_ms / 1000)}s`
                                    : `${Math.round(currentStep.compressed_delay_ms / 60000)}m`})
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Waiting indicator */}
                        {currentStep.status === 'waiting' && (
                          <div className="alert alert-info py-2 d-flex align-items-center gap-2">
                            <span className="spinner-border spinner-border-sm" role="status">
                              <span className="visually-hidden">Waiting...</span>
                            </span>
                            Waiting for compressed delay...
                          </div>
                        )}

                        {/* Executing indicator */}
                        {currentStep.status === 'executing' && (
                          <div className="alert alert-primary py-2 d-flex align-items-center gap-2">
                            <span className="spinner-border spinner-border-sm" role="status">
                              <span className="visually-hidden">Executing...</span>
                            </span>
                            Generating AI content and sending...
                          </div>
                        )}

                        {/* AI Content (after execution) */}
                        {currentStep.ai_content && (
                          <div className="mb-3">
                            {currentStep.channel === 'email' ? (
                              <>
                                <EmailPreview
                                  from={`Colaberry Simulator <${currentStep.details?.from || 'info@colaberry.com'}>`}
                                  to={currentStep.details?.to}
                                  subject={currentStep.ai_content.subject}
                                  body={currentStep.ai_content.body}
                                  date={currentStep.executed_at || currentStep.wait_started_at || undefined}
                                  messageId={currentStep.details?.messageId}
                                />
                                <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                                  {currentStep.ai_content.tokens_used} tokens | {currentStep.ai_content.model}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="fw-semibold mb-1">AI-Generated Content</div>
                                {currentStep.ai_content.subject && (
                                  <div className="mb-1">
                                    <strong>Subject:</strong> {currentStep.ai_content.subject}
                                  </div>
                                )}
                                <div className="bg-light p-2 rounded" style={{ maxHeight: 200, overflow: 'auto' }}>
                                  <div dangerouslySetInnerHTML={{ __html: currentStep.ai_content.body || '' }} />
                                </div>
                                <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                                  {currentStep.ai_content.tokens_used} tokens | {currentStep.ai_content.model}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* Delivery details */}
                        {currentStep.details && (
                          <div className="mb-3">
                            <div className="fw-semibold mb-1 d-flex align-items-center gap-2">
                              Delivery
                              {/* Channel health dot */}
                              <span
                                className="rounded-circle d-inline-block"
                                style={{
                                  width: 8,
                                  height: 8,
                                  backgroundColor: currentStep.details.skipped || currentStep.details.simulated
                                    ? '#ffc107'
                                    : currentStep.status === 'failed'
                                    ? '#dc3545'
                                    : '#198754',
                                }}
                                title={currentStep.details.skipped ? 'Skipped' : currentStep.details.simulated ? 'Simulated' : currentStep.status === 'failed' ? 'Failed' : 'Delivered'}
                              />
                              {/* Delivery mode badge */}
                              {currentStep.details.delivery_mode && (
                                <span
                                  className={`badge bg-${
                                    currentStep.details.delivery_mode === 'live'
                                      ? 'success'
                                      : currentStep.details.delivery_mode === 'test_redirect'
                                      ? 'warning'
                                      : 'secondary'
                                  }`}
                                  style={{ fontSize: '0.55rem' }}
                                >
                                  {currentStep.details.delivery_mode === 'live'
                                    ? 'LIVE'
                                    : currentStep.details.delivery_mode === 'test_redirect'
                                    ? 'TEST'
                                    : 'SIMULATED'}
                                </span>
                              )}
                            </div>
                            {currentStep.details.skipped ? (
                              <div className="text-warning small">
                                Skipped: {currentStep.details.reason || 'Unknown reason'}
                              </div>
                            ) : currentStep.details.simulated ? (
                              <div className="text-muted small">
                                Simulated — {currentStep.details.reason || 'Provider not available'}
                                {currentStep.details.message_preview && (
                                  <div className="bg-light p-2 rounded mt-1" style={{ maxHeight: 100, overflow: 'auto' }}>
                                    {currentStep.details.message_preview}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-muted">
                                Sent to: {currentStep.details.to || '—'}
                                {currentStep.details.provider && (
                                  <span className="badge bg-light text-dark ms-2" style={{ fontSize: '0.55rem' }}>
                                    {currentStep.details.provider}
                                  </span>
                                )}
                                {currentStep.details.messageId && (
                                  <span className="ms-2 small">ID: {currentStep.details.messageId}</span>
                                )}
                                {currentStep.details.call_id && (
                                  <span className="ms-2 small">Call: {currentStep.details.call_id}</span>
                                )}
                                {currentStep.details.ghl_contact_id && (
                                  <div className="mt-1 small text-muted">
                                    GHL Contact: <code>{currentStep.details.ghl_contact_id}</code>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* cory_sms_composed field (SMS via GHL) */}
                            {currentStep.details?.cory_sms_composed && (
                              <div className="mt-2">
                                <div className="small fw-medium text-muted mb-1">
                                  cory_sms_composed <span className="text-muted" style={{ fontSize: '0.6rem' }}>(triggers GHL workflow)</span>
                                </div>
                                <div className="bg-light p-2 rounded small" style={{ maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                  {currentStep.details.cory_sms_composed}
                                </div>
                              </div>
                            )}

                            {/* Voice recording link */}
                            {currentStep.details.recording_url && (
                              <div className="mt-2">
                                <a
                                  href={currentStep.details.recording_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                                >
                                  <i className="bi bi-play-circle"></i>
                                  Listen to Call Recording
                                </a>
                              </div>
                            )}

                            {/* Voice transcript viewer */}
                            {currentStep.details.transcript && (
                              <div className="mt-2">
                                <div className="small fw-medium text-muted mb-1">Voice Transcript</div>
                                <div
                                  className="bg-light p-2 rounded small"
                                  style={{ maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
                                >
                                  {typeof currentStep.details.transcript === 'string'
                                    ? currentStep.details.transcript
                                    : JSON.stringify(currentStep.details.transcript, null, 2)}
                                </div>
                              </div>
                            )}

                            {/* Voice call status (fetch from Synthflow if no recording yet) */}
                            {currentStep.channel === 'voice' && currentStep.details.call_id && !currentStep.details.recording_url && !currentStep.details.transcript && (
                              <div className="mt-2 small text-muted">
                                Call placed (ID: {currentStep.details.call_id}). Recording and transcript will appear once the call completes.
                              </div>
                            )}

                            {/* Provider response (collapsible) */}
                            {currentStep.details.result && (
                              <details className="mt-1">
                                <summary className="small text-muted" style={{ cursor: 'pointer' }}>Raw Provider Response</summary>
                                <pre
                                  className="small bg-light p-2 rounded mt-1 mb-0"
                                  style={{ maxHeight: 150, overflowY: 'auto', fontSize: '0.65rem' }}
                                >
                                  {JSON.stringify(currentStep.details.result, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}

                        {/* Error */}
                        {currentStep.error_message && (
                          <div className="alert alert-danger py-2 small">
                            {currentStep.error_message}
                          </div>
                        )}

                        {/* Lead response (recorded) */}
                        {currentStep.lead_response && (
                          <div className="mb-3">
                            <div className="fw-semibold mb-1">Lead Response</div>
                            <span className="badge bg-info">{currentStep.lead_response.outcome}</span>
                            {currentStep.lead_response.response_text && (
                              <div className="text-muted mt-1">{currentStep.lead_response.response_text}</div>
                            )}
                          </div>
                        )}

                        {/* Response form (when step is sent and no response yet) */}
                        {currentStep.status === 'sent' && !currentStep.lead_response && (
                          <div className="border-top pt-3 mt-3">
                            <div className="fw-semibold mb-2">Respond as Lead</div>
                            <div className="d-flex gap-2 align-items-end">
                              <div>
                                <label className="form-label small fw-medium">Outcome</label>
                                <select
                                  className="form-select form-select-sm"
                                  value={responseOutcome}
                                  onChange={(e) => setResponseOutcome(e.target.value)}
                                >
                                  {OUTCOME_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-grow-1">
                                <label className="form-label small fw-medium">Response (optional)</label>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  placeholder="Lead's reply..."
                                  value={responseText}
                                  onChange={(e) => setResponseText(e.target.value)}
                                />
                              </div>
                              <button className="btn btn-sm btn-primary" onClick={handleRespond}>
                                Respond
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : simulation.status === 'completed' ? (
                    /* Completion summary */
                    <div className="card border-0 shadow-sm">
                      <div className="card-header bg-white fw-semibold">Simulation Complete</div>
                      <div className="card-body">
                        {simulation.summary && (
                          <>
                            <div className="row g-3 text-center">
                              <div className="col-4">
                                <div className="small text-muted">Passed</div>
                                <div className="h5 fw-bold text-success">{simulation.summary.steps_passed}</div>
                              </div>
                              <div className="col-4">
                                <div className="small text-muted">Failed</div>
                                <div className="h5 fw-bold text-danger">{simulation.summary.steps_failed}</div>
                              </div>
                              <div className="col-4">
                                <div className="small text-muted">Skipped</div>
                                <div className="h5 fw-bold text-warning">{simulation.summary.steps_skipped}</div>
                              </div>
                              <div className="col-4">
                                <div className="small text-muted">Channels</div>
                                <div className="d-flex gap-1 justify-content-center">
                                  {simulation.summary.channels_used?.map((ch) => (
                                    <span key={ch} className="badge bg-info">{ch}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="col-4">
                                <div className="small text-muted">Duration</div>
                                <div className="fw-bold">
                                  {simulation.summary.total_duration_ms != null
                                    ? `${(simulation.summary.total_duration_ms / 1000).toFixed(1)}s`
                                    : '\u2014'}
                                </div>
                              </div>
                              <div className="col-4">
                                <div className="small text-muted">AI Tokens</div>
                                <div className="fw-bold">{simulation.summary.ai_tokens_used || 0}</div>
                              </div>
                            </div>

                            {/* Channel health breakdown */}
                            {(() => {
                              const channelStats: Record<string, { sent: number; skipped: number; failed: number; simulated: number }> = {};
                              (simulation.steps || []).forEach((s) => {
                                if (!channelStats[s.channel]) channelStats[s.channel] = { sent: 0, skipped: 0, failed: 0, simulated: 0 };
                                if (s.status === 'sent' || s.status === 'responded') channelStats[s.channel].sent++;
                                else if (s.status === 'skipped') channelStats[s.channel].skipped++;
                                else if (s.status === 'failed') channelStats[s.channel].failed++;
                                if (s.details?.simulated) channelStats[s.channel].simulated++;
                              });
                              const entries = Object.entries(channelStats);
                              if (entries.length === 0) return null;
                              const anyFullSkip = entries.some(([_k, v]) => v.sent === 0 && (v.skipped > 0 || v.failed > 0));
                              return (
                                <div className="mt-3 pt-3 border-top">
                                  <div className="small fw-semibold mb-2">Channel Health</div>
                                  {anyFullSkip && (
                                    <div className="alert alert-warning py-1 small mb-2">
                                      One or more channels had 0% delivery success.
                                    </div>
                                  )}
                                  <div className="d-flex gap-3">
                                    {entries.map(([ch, v]) => (
                                      <div key={ch} className="text-center">
                                        <div className="small fw-medium text-uppercase">{ch}</div>
                                        <div className="small">
                                          <span className="text-success">{v.sent}</span>
                                          {' / '}
                                          <span className="text-warning">{v.skipped}</span>
                                          {' / '}
                                          <span className="text-danger">{v.failed}</span>
                                        </div>
                                        <div style={{ fontSize: '0.6rem' }} className="text-muted">sent/skip/fail</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted">
                      Select a step from the timeline to inspect it.
                    </div>
                  )}

                  {/* Communication Log */}
                  {simulation && (
                    <div className="mt-3">
                      <button
                        className={`btn btn-sm ${showCommLog ? 'btn-outline-primary' : 'btn-outline-secondary'} w-100 mb-2`}
                        onClick={() => setShowCommLog(!showCommLog)}
                      >
                        {showCommLog ? 'Hide' : 'Show'} Communication Log
                      </button>
                      {showCommLog && <CommunicationLogPanel simulationId={simulation.id} />}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer controls */}
          <div className="modal-footer d-flex justify-content-between">
            <div className="d-flex gap-2">
              {simulation && isActive && (
                <>
                  {simulation.status === 'running' ? (
                    <button className="btn btn-sm btn-outline-warning" onClick={() => handleAction('pause')}>
                      Pause
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-outline-primary" onClick={() => handleAction('resume')}>
                      Resume
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => handleAction('skip')}>
                    Skip Step
                  </button>
                  {simulation.speed_mode === 'instant' && (
                    <button className="btn btn-sm btn-primary" onClick={() => handleAction('advance')}>
                      Advance
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline-danger" onClick={() => handleAction('cancel')}>
                    Cancel
                  </button>
                </>
              )}
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
