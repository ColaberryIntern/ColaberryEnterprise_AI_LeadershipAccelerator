import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props {
  processId: string;
  actionType: string;
  actionLabel: string;
  onClose: () => void;
  onResync?: () => void;
}

function MetricDelta({ label, before, after, unit }: { label: string; before: number; after: number; unit?: string }) {
  const delta = after - before;
  const color = delta > 0 ? 'var(--color-success)' : delta < 0 ? 'var(--color-danger)' : '#9ca3af';
  return (
    <div className="d-flex justify-content-between align-items-center mb-2 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className="text-muted" style={{ fontSize: 11 }}>{label}</span>
      <div className="d-flex align-items-center gap-2">
        <span style={{ fontSize: 11 }}>{before}{unit || '%'}</span>
        <i className="bi bi-arrow-right" style={{ fontSize: 10, color: '#9ca3af' }}></i>
        <strong style={{ fontSize: 11, color }}>{after}{unit || '%'}</strong>
        <span className="badge" style={{ background: `${color}20`, color, fontSize: 9 }}>{delta > 0 ? '+' : ''}{delta}{unit || '%'}</span>
      </div>
    </div>
  );
}

export default function PredictionModal({ processId, actionType, actionLabel, onClose, onResync }: Props) {
  const [prediction, setPrediction] = useState<any>(null);
  const [prompt, setPrompt] = useState<any>(null);
  const [processData, setProcessData] = useState<any>(null);
  const [projectContext, setProjectContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  // Submit Report state
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      bpApi.predictImpact(processId, actionType),
      bpApi.generatePrompt(processId, actionType),
      bpApi.getProcess(processId),
      import('../../utils/portalApi').then(({ default: api }) => api.get('/api/portal/project/system-prompt')),
    ]).then(async ([predRes, promptRes, procRes, projRes]) => {
      setPrediction(predRes.data);
      setPrompt(promptRes.data);
      setProcessData(procRes.data);
      setProjectContext(projRes.data?.system_prompt || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, [processId, actionType]);

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  };

  const handleCopy = async () => {
    if (!prompt?.prompt_text) return;
    setCopying(true);
    await copyToClipboard(prompt.prompt_text);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleSubmitReport = async () => {
    if (!reportText.trim()) return;
    setSubmitting(true);
    try {
      // Capture BEFORE metrics so we can show the delta
      const beforeProc = await bpApi.getProcess(processId);
      const beforeMetrics = beforeProc.data?.metrics || {};
      const beforeMaturity = beforeProc.data?.maturity || {};

      const portalApi = (await import('../../utils/portalApi')).default;
      // 1. Submit the validation report (marks requirements as verified)
      const reportRes = await portalApi.post(`/api/portal/project/business-processes/${processId}/validation-report`, {
        reportText: reportText.trim(),
      });
      // 2. Get updated process data (metrics reflect the verified requirements)
      const updatedProc = await bpApi.getProcess(processId);
      setSubmitResult({
        report: reportRes.data,
        beforeMetrics,
        beforeMaturity,
        updatedMetrics: updatedProc.data?.metrics,
        updatedMaturity: updatedProc.data?.maturity,
        processName: updatedProc.data?.name,
      });
    } catch (err: any) {
      setSubmitResult({ error: err.response?.data?.error || 'Submission failed' });
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-body text-center py-5"><div className="spinner-border text-primary"></div><p className="text-muted mt-2">Predicting impact...</p></div>
        </div>
      </div>
    </div>
  );

  const p = prediction || {};
  const riskColors: Record<string, string> = { low: 'var(--color-success)', medium: 'var(--color-warning)', high: 'var(--color-danger)' };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content border-0 shadow-lg">
          {copying && (
            <div className="alert alert-success py-2 px-3 mb-0 text-center" style={{ borderRadius: 0, fontSize: 12 }}>
              <i className="bi bi-clipboard-check me-1"></i>Prompt copied to clipboard — paste into Claude Code
            </div>
          )}
          <div className="modal-header py-3" style={{ borderBottom: `3px solid ${showReport ? 'var(--color-accent)' : 'var(--color-primary)'}` }}>
            <div>
              <h5 className="modal-title fw-bold" style={{ color: 'var(--color-primary)' }}>
                <i className={`bi ${showReport ? 'bi-clipboard-check' : 'bi-lightning'} me-2`}></i>
                {showReport ? 'Submit Validation Report' : actionLabel}
              </h5>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {showReport ? 'Paste Claude Code\'s output to verify what was built' : p.description}
              </span>
            </div>
            <button className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body p-4">
            {/* ── Submit Report View ── */}
            {showReport ? (
              submitResult ? (
                submitResult.error ? (
                  <div className="alert alert-danger">{submitResult.error}</div>
                ) : (
                  <div>
                    {/* Unified summary: what was done + how it changed */}
                    <div className="alert py-3 mb-3" style={{ background: '#10b98115', borderColor: '#10b98140', color: 'var(--color-text)' }}>
                      <h6 className="fw-bold mb-2" style={{ color: 'var(--color-accent)' }}>
                        <i className="bi bi-check-circle-fill me-2"></i>
                        {submitResult.processName || actionLabel} — Verified
                      </h6>
                      <div className="small">
                        <strong>{submitResult.report?.requirementsVerified || 0}</strong> of {submitResult.report?.requirementsTotal || 0} requirements matched to your implementation.
                      </div>
                    </div>

                    {/* What was built */}
                    {submitResult.report?.parsed && (
                      <div className="mb-3 p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
                        <h6 className="fw-semibold small mb-2"><i className="bi bi-file-earmark-code me-1"></i>What Was Built</h6>
                        {[
                          { label: 'Files Created', items: submitResult.report.parsed.filesCreated },
                          { label: 'Files Modified', items: submitResult.report.parsed.filesModified },
                          { label: 'Routes', items: submitResult.report.parsed.routes },
                          { label: 'Database', items: submitResult.report.parsed.database },
                        ].filter((s: any) => s.items?.length > 0).map((section: any) => (
                          <div key={section.label} className="mb-2">
                            <span className="fw-medium" style={{ fontSize: 11 }}>{section.label}:</span>
                            {section.items.map((f: string, i: number) => (
                              <div key={i} className="text-muted ms-2" style={{ fontSize: 10, fontFamily: 'monospace' }}>- {f}</div>
                            ))}
                          </div>
                        ))}
                        {submitResult.report.parsed.duplicatesNoted?.length > 0 && (
                          <div className="mt-2 p-2" style={{ background: '#f59e0b10', borderRadius: 6 }}>
                            <span className="fw-medium text-warning" style={{ fontSize: 11 }}><i className="bi bi-exclamation-triangle me-1"></i>Duplicates Noted:</span>
                            {submitResult.report.parsed.duplicatesNoted.map((d: string, i: number) => (
                              <div key={i} className="text-warning ms-2" style={{ fontSize: 10 }}>- {d}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Before → After impact */}
                    {submitResult.updatedMetrics && (
                      <div className="mb-3">
                        <h6 className="fw-semibold small mb-2"><i className="bi bi-graph-up-arrow me-1"></i>Impact</h6>
                        <MetricDelta label="Coverage" before={submitResult.beforeMetrics?.requirements_coverage || 0} after={submitResult.updatedMetrics.requirements_coverage || 0} />
                        <MetricDelta label="Readiness" before={submitResult.beforeMetrics?.system_readiness || 0} after={submitResult.updatedMetrics.system_readiness || 0} />
                        <MetricDelta label="Quality" before={submitResult.beforeMetrics?.quality_score || 0} after={submitResult.updatedMetrics.quality_score || 0} />
                        {submitResult.updatedMaturity && submitResult.beforeMaturity && (
                          <div className="d-flex align-items-center gap-2 mt-2 p-2" style={{ background: submitResult.updatedMaturity.level > submitResult.beforeMaturity.level ? '#10b98110' : 'transparent', borderRadius: 6 }}>
                            <span className="text-muted" style={{ fontSize: 11 }}>Maturity</span>
                            <span style={{ fontSize: 11 }}>L{submitResult.beforeMaturity.level} {submitResult.beforeMaturity.label}</span>
                            <i className="bi bi-arrow-right" style={{ fontSize: 10, color: '#9ca3af' }}></i>
                            <strong style={{ fontSize: 11, color: submitResult.updatedMaturity.level > submitResult.beforeMaturity.level ? 'var(--color-success)' : 'var(--color-primary)' }}>
                              L{submitResult.updatedMaturity.level} {submitResult.updatedMaturity.label}
                            </strong>
                            {submitResult.updatedMaturity.level > submitResult.beforeMaturity.level && (
                              <span className="badge bg-success" style={{ fontSize: 9 }}>LEVEL UP</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button className="btn btn-primary btn-sm" onClick={() => { onClose(); if (onResync) onResync(); }}>
                      <i className="bi bi-check me-1"></i>Continue
                    </button>
                  </div>
                )
              ) : (
                /* Paste textarea */
                <>
                  <div className="mb-3 p-3" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                    <h6 className="fw-semibold small mb-1" style={{ color: '#1e40af' }}><i className="bi bi-info-circle me-1"></i>How This Works</h6>
                    <ol className="small text-muted mb-0 ps-3">
                      <li>Copy the prompt above and run it in Claude Code</li>
                      <li>When done, Claude Code outputs a <strong>VALIDATION REPORT</strong></li>
                      <li>Paste the entire output below (report + any summary)</li>
                      <li>Click <strong>Sync & Verify</strong> — we'll match what was built to requirements</li>
                    </ol>
                  </div>
                  <textarea
                    className="form-control mb-3"
                    rows={14}
                    placeholder={`Paste Claude Code's full output here. We'll parse the VALIDATION REPORT section automatically.\n\nExpected format:\n\nVALIDATION REPORT\n\nFiles Created:\n- path/to/file1.ts\n- path/to/file2.ts\n\nRoutes:\n- GET /api/...\n\nStatus: COMPLETE`}
                    value={reportText}
                    onChange={e => setReportText(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: 11 }}
                    autoFocus
                  />
                </>
              )
            ) : (
              /* ── Normal prediction view ── */
              <>
                <div className="mb-4 p-3" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                  <h6 className="fw-semibold small mb-1" style={{ color: '#1e40af' }}><i className="bi bi-lightbulb me-1"></i>Why This Matters</h6>
                  <p className="text-muted small mb-0">
                    {p.dependencies_met === false
                      ? `This action has unmet prerequisites. Complete the required steps first to avoid build failures.`
                      : `Without this, the process cannot ${
                        actionType === 'backend_improvement' ? 'function — backend is the foundation for all other layers'
                        : actionType === 'frontend_exposure' ? 'be used by end users — there is no UI to interact with'
                        : actionType === 'requirement_implementation' ? 'reach full coverage — unmapped requirements represent missing functionality'
                        : actionType === 'add_database' ? 'persist data — models are needed for reliable storage'
                        : actionType === 'improve_reliability' ? 'handle failures gracefully — error handling prevents data loss'
                        : actionType === 'verify_requirements' ? 'be trusted — unverified matches may be false positives'
                        : actionType === 'optimize_performance' ? 'scale — performance bottlenecks will block production deployment'
                        : 'automate — manual intervention is required for every operation'
                      }.`
                    }
                  </p>
                </div>

                <h6 className="fw-semibold small mb-2"><i className="bi bi-graph-up-arrow me-1"></i>Predicted Impact</h6>
                <div className="mb-4">
                  <MetricDelta label="System Readiness" before={p.readiness_before || 0} after={p.projected_readiness || p.readiness_before || 0} />
                  <MetricDelta label="Quality Score" before={p.quality_before || 0} after={p.projected_quality || p.quality_before || 0} />
                </div>

                <div className="d-flex align-items-center gap-3 mb-2 p-3" style={{ background: p.maturity_advances ? '#10b98110' : 'var(--color-bg-alt)', borderRadius: 8, border: p.maturity_advances ? '1px solid #10b98130' : 'none' }}>
                  <div className="text-center">
                    <div className="text-muted" style={{ fontSize: 9 }}>Current</div>
                    <div className="fw-bold" style={{ fontSize: 14, color: 'var(--color-primary)' }}>L{p.level_before?.level || 1} {p.level_before?.label || 'Prototype'}</div>
                  </div>
                  <i className="bi bi-arrow-right" style={{ fontSize: 18, color: p.maturity_advances ? 'var(--color-success)' : '#9ca3af' }}></i>
                  <div className="text-center">
                    <div className="text-muted" style={{ fontSize: 9 }}>After</div>
                    <div className="fw-bold" style={{ fontSize: 14, color: p.maturity_advances ? 'var(--color-success)' : 'var(--color-primary)' }}>L{p.level_after?.level || 1} {p.level_after?.label || 'Prototype'}</div>
                  </div>
                  {p.maturity_advances && <span className="badge bg-success ms-auto" style={{ fontSize: 10 }}>LEVEL UP</span>}
                </div>

                {(p.quality_dimensions || []).length > 0 && (
                  <div className="mb-4">
                    <h6 className="fw-semibold small mb-2"><i className="bi bi-bar-chart me-1"></i>Quality Dimension Changes</h6>
                    {p.quality_dimensions.map((d: any) => {
                      const improved = d.after > d.before;
                      return (
                        <div key={d.dimension} className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: 11 }}>
                          <span className="text-muted text-capitalize" style={{ width: 130 }}>{d.dimension.replace(/_/g, ' ')}</span>
                          <div className="d-flex align-items-center gap-1">
                            <span>{d.before}/10</span>
                            <i className="bi bi-arrow-right" style={{ fontSize: 9, color: '#9ca3af' }}></i>
                            <strong style={{ color: improved ? 'var(--color-success)' : '#9ca3af' }}>{d.after}/10</strong>
                            {improved && <span style={{ fontSize: 9, color: 'var(--color-success)' }}>+{d.after - d.before}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <h6 className="fw-semibold small mb-2"><i className="bi bi-plus-circle me-1"></i>What Will Be Built</h6>
                <div className="d-flex flex-wrap gap-1 mb-4">
                  {(p.new_components || []).map((c: string, i: number) => (
                    <span key={i} className="badge" style={{ background: '#3b82f620', color: 'var(--color-info)', fontSize: 10 }}>{c}</span>
                  ))}
                </div>

                <h6 className="fw-semibold small mb-2"><i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>Gaps This Resolves</h6>
                <div className="mb-4">
                  {actionType === 'backend_improvement' && <div className="small text-muted mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-success)' }}></i>Backend implementation gap — services and API routes</div>}
                  {actionType === 'frontend_exposure' && <div className="small text-muted mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-success)' }}></i>Frontend UI gap — user-facing components</div>}
                  {actionType === 'agent_enhancement' && <div className="small text-muted mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-success)' }}></i>Automation gap — AI agent orchestration</div>}
                  <div className="small text-muted"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-success)' }}></i>Quality score improvement across affected dimensions</div>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <h6 className="fw-semibold small mb-2"><i className="bi bi-shield-exclamation me-1"></i>Risk Level</h6>
                    <span className="badge px-3 py-1" style={{ background: `${riskColors[p.risk_level] || '#9ca3af'}20`, color: riskColors[p.risk_level] || '#9ca3af', fontSize: 11 }}>
                      {(p.risk_level || 'unknown').toUpperCase()}
                    </span>
                    {(p.risk_factors || []).map((r: string, i: number) => (
                      <div key={i} className="text-muted small mt-1"><i className="bi bi-arrow-right me-1"></i>{r}</div>
                    ))}
                  </div>
                  <div className="col-md-6">
                    <h6 className="fw-semibold small mb-2"><i className="bi bi-diagram-2 me-1"></i>Dependencies</h6>
                    {p.dependencies_met ? (
                      <div className="text-muted small"><i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>All prerequisites met</div>
                    ) : (
                      (p.missing_prerequisites || []).map((d: string, i: number) => (
                        <div key={i} className="small" style={{ color: 'var(--color-danger)' }}><i className="bi bi-x-circle me-1"></i>{d}</div>
                      ))
                    )}
                  </div>
                </div>

                {prompt && (
                  <>
                    <h6 className="fw-semibold small mb-2"><i className="bi bi-code-square me-1"></i>Claude Code Prompt</h6>
                    <div className="p-3 mb-3" style={{ background: '#1a1a2e', color: '#e2e8f0', borderRadius: 8, fontSize: 11, maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {prompt.prompt_text}
                    </div>
                    <h6 className="fw-semibold small mb-2"><i className="bi bi-list-check me-1"></i>Execution Instructions</h6>
                    <ol className="small text-muted ps-3 mb-0">
                      <li>Click "Copy Prompt" below</li>
                      <li>Open Claude Code in Plan Mode</li>
                      <li>Paste the prompt and execute</li>
                      <li>When done, click <strong>"Submit Report"</strong> to paste the results</li>
                    </ol>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer d-flex justify-content-between">
            {showReport ? (
              submitResult ? (
                <div></div>
              ) : (
                <>
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowReport(false); setReportText(''); }}>
                    <i className="bi bi-arrow-left me-1"></i>Back
                  </button>
                  <button className="btn btn-sm btn-primary" disabled={!reportText.trim() || submitting} onClick={handleSubmitReport}>
                    {submitting ? <><span className="spinner-border spinner-border-sm me-1"></span>Syncing & Verifying...</> : <><i className="bi bi-arrow-repeat me-1"></i>Sync & Verify</>}
                  </button>
                </>
              )
            ) : (
              <>
                <button className="btn btn-sm" style={{ background: '#10b98120', color: '#059669', border: '1px solid #10b98140', fontWeight: 600 }}
                  onClick={() => setShowReport(true)}>
                  <i className="bi bi-clipboard-check me-1"></i>Submit Report
                </button>
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
                  <button className="btn btn-sm" style={{ background: '#6366f120', color: '#6366f1', border: '1px solid #6366f140', fontWeight: 600 }} onClick={async () => {
                    const proc = processData || {};
                    const featSummary = (proc.features || []).slice(0, 5).map((f: any) => `- ${f.name}: ${f.description || ''}`).join('\n');
                    const learnPrompt = `You are operating in LEARN MODE.\n\nDO NOT write code. Your ONLY job is to help the learner UNDERSTAND what this step is, why it matters, and how it connects to the overall system.\n\n# PROJECT CONTEXT\n\n${projectContext || 'No project system prompt set yet.'}\n\n# BUSINESS PROCESS: "${proc.name || 'Unknown'}"\n\n${proc.description || ''}\n\nFeatures:\n${featSummary || '- No features listed'}\n\nCurrent State: Readiness ${proc.metrics?.system_readiness || 0}%, Quality ${proc.metrics?.quality_score || 0}%, L${proc.maturity?.level || 1} ${proc.maturity?.label || 'Prototype'}\n\n# STEP: ${actionLabel}\n\n${prompt?.prompt_text ? prompt.prompt_text.split('\n').filter((l: string) => /^\d\./.test(l)).join('\n') : ''}\n\n# TEACH: Start with the big picture, then this process, then this step. One concept at a time. Ask questions to check understanding.`;
                    await copyToClipboard(learnPrompt);
                    window.open('https://chatgpt.com', '_blank');
                    const el = document.createElement('div');
                    el.innerHTML = '<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#6366f1;color:#fff;padding:10px 16px;border-radius:8px;font-size:12px"><i class="bi bi-mortarboard me-2"></i>Learn prompt copied — paste in ChatGPT</div>';
                    document.body.appendChild(el); setTimeout(() => el.remove(), 4000);
                  }}>
                    <i className="bi bi-mortarboard me-1"></i>Learn This Step
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleCopy} disabled={!prompt}>
                    {copying ? <><i className="bi bi-check-lg me-1"></i>Copied!</> : <><i className="bi bi-clipboard me-1"></i>Copy Prompt</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
