import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props {
  processId: string;
  actionType: string;
  actionLabel: string;
  onClose: () => void;
}

function MetricDelta({ label, before, after, unit }: { label: string; before: number; after: number; unit?: string }) {
  const delta = after - before;
  const color = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : '#9ca3af';
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

export default function PredictionModal({ processId, actionType, actionLabel, onClose }: Props) {
  const [prediction, setPrediction] = useState<any>(null);
  const [prompt, setPrompt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      bpApi.predictImpact(processId, actionType),
      bpApi.generatePrompt(processId, actionType),
    ]).then(async ([predRes, promptRes]) => {
      setPrediction(predRes.data);
      setPrompt(promptRes.data);
      // Auto-copy prompt to clipboard on load
      if (promptRes.data?.prompt_text) {
        try { await navigator.clipboard.writeText(promptRes.data.prompt_text); setCopying(true); setTimeout(() => setCopying(false), 3000); } catch {}
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [processId, actionType]);

  const handleCopy = async () => {
    if (!prompt?.prompt_text) return;
    setCopying(true);
    await navigator.clipboard.writeText(prompt.prompt_text);
    setTimeout(() => setCopying(false), 2000);
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
  const riskColors: Record<string, string> = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content border-0 shadow-lg">
          {/* Header */}
          {/* Auto-copy toast */}
          {copying && (
            <div className="alert alert-success py-2 px-3 mb-0 text-center" style={{ borderRadius: 0, fontSize: 12 }}>
              <i className="bi bi-clipboard-check me-1"></i>Prompt auto-copied to clipboard — paste into Claude Code Plan Mode
            </div>
          )}
          <div className="modal-header py-3" style={{ borderBottom: '3px solid var(--color-primary)' }}>
            <div>
              <h5 className="modal-title fw-bold" style={{ color: 'var(--color-primary)' }}><i className="bi bi-lightning me-2"></i>{actionLabel}</h5>
              <span className="text-muted" style={{ fontSize: 12 }}>{p.description}</span>
            </div>
            <button className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body p-4">
            {/* Impact Dashboard */}
            {/* Why This Matters */}
            <div className="mb-4 p-3" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <h6 className="fw-semibold small mb-1" style={{ color: '#1e40af' }}><i className="bi bi-lightbulb me-1"></i>Why This Matters</h6>
              <p className="text-muted small mb-0">
                {p.dependencies_met === false
                  ? `This action has unmet prerequisites. Complete the required steps first to avoid build failures.`
                  : `Without this, the process cannot ${actionType === 'backend_improvement' ? 'function — backend is the foundation for all other layers' : actionType === 'frontend_exposure' ? 'be used by end users — there is no UI to interact with' : 'automate — manual intervention is required for every operation'}.`
                }
              </p>
            </div>

            <h6 className="fw-semibold small mb-2"><i className="bi bi-graph-up-arrow me-1"></i>Predicted Impact</h6>
            <div className="mb-4">
              <MetricDelta label="System Readiness" before={p.projected_readiness - p.readiness_delta} after={p.projected_readiness} />
              <MetricDelta label="Quality Score" before={p.projected_quality - p.quality_delta} after={p.projected_quality} />
            </div>

            {/* Level Progression */}
            <div className="d-flex align-items-center gap-3 mb-4 p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
              <div className="text-center">
                <div className="text-muted" style={{ fontSize: 9 }}>Current</div>
                <div className="fw-bold" style={{ fontSize: 14, color: 'var(--color-primary)' }}>L{p.level_before?.level} {p.level_before?.label}</div>
              </div>
              <i className="bi bi-arrow-right" style={{ fontSize: 18, color: '#10b981' }}></i>
              <div className="text-center">
                <div className="text-muted" style={{ fontSize: 9 }}>After</div>
                <div className="fw-bold" style={{ fontSize: 14, color: '#10b981' }}>L{p.level_after?.level} {p.level_after?.label}</div>
              </div>
            </div>

            {/* New Components */}
            <h6 className="fw-semibold small mb-2"><i className="bi bi-plus-circle me-1"></i>What Will Be Built</h6>
            <div className="d-flex flex-wrap gap-1 mb-4">
              {(p.new_components || []).map((c: string, i: number) => (
                <span key={i} className="badge" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 10 }}>{c}</span>
              ))}
            </div>

            {/* Gaps Resolved */}
            <h6 className="fw-semibold small mb-2"><i className="bi bi-check-circle me-1" style={{ color: '#10b981' }}></i>Gaps This Resolves</h6>
            <div className="mb-4">
              {actionType === 'backend_improvement' && <div className="small text-muted mb-1"><i className="bi bi-arrow-right me-1" style={{ color: '#10b981' }}></i>Backend implementation gap — services and API routes</div>}
              {actionType === 'frontend_exposure' && <div className="small text-muted mb-1"><i className="bi bi-arrow-right me-1" style={{ color: '#10b981' }}></i>Frontend UI gap — user-facing components</div>}
              {actionType === 'agent_enhancement' && <div className="small text-muted mb-1"><i className="bi bi-arrow-right me-1" style={{ color: '#10b981' }}></i>Automation gap — AI agent orchestration</div>}
              <div className="small text-muted"><i className="bi bi-arrow-right me-1" style={{ color: '#10b981' }}></i>Quality score improvement across affected dimensions</div>
            </div>

            {/* Risk & Dependencies */}
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
                  <div className="text-muted small"><i className="bi bi-check-circle me-1" style={{ color: '#10b981' }}></i>All prerequisites met</div>
                ) : (
                  (p.missing_prerequisites || []).map((d: string, i: number) => (
                    <div key={i} className="small" style={{ color: '#ef4444' }}><i className="bi bi-x-circle me-1"></i>{d}</div>
                  ))
                )}
              </div>
            </div>

            {/* Prompt */}
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
                  <li>Paste the prompt</li>
                  <li>Review the generated plan</li>
                  <li>Execute when satisfied</li>
                </ol>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleCopy} disabled={!prompt}>
              {copying ? <><i className="bi bi-check-lg me-1"></i>Copied!</> : <><i className="bi bi-clipboard me-1"></i>Copy Prompt</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
