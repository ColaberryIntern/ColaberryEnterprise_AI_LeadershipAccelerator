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
  const [processData, setProcessData] = useState<any>(null);
  const [projectContext, setProjectContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncDone, setResyncDone] = useState(false);

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
      // Auto-copy disabled on HTTP — user clicks Copy Prompt manually
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
              <MetricDelta label="System Readiness" before={p.readiness_before || 0} after={p.projected_readiness || p.readiness_before || 0} />
              <MetricDelta label="Quality Score" before={p.quality_before || 0} after={p.projected_quality || p.quality_before || 0} />
            </div>

            {/* Level Progression */}
            <div className="d-flex align-items-center gap-3 mb-2 p-3" style={{ background: p.maturity_advances ? '#10b98110' : 'var(--color-bg-alt)', borderRadius: 8, border: p.maturity_advances ? '1px solid #10b98130' : 'none' }}>
              <div className="text-center">
                <div className="text-muted" style={{ fontSize: 9 }}>Current</div>
                <div className="fw-bold" style={{ fontSize: 14, color: 'var(--color-primary)' }}>L{p.level_before?.level || 1} {p.level_before?.label || 'Prototype'}</div>
              </div>
              <i className="bi bi-arrow-right" style={{ fontSize: 18, color: p.maturity_advances ? '#10b981' : '#9ca3af' }}></i>
              <div className="text-center">
                <div className="text-muted" style={{ fontSize: 9 }}>After</div>
                <div className="fw-bold" style={{ fontSize: 14, color: p.maturity_advances ? '#10b981' : 'var(--color-primary)' }}>L{p.level_after?.level || 1} {p.level_after?.label || 'Prototype'}</div>
              </div>
              {p.maturity_advances && <span className="badge bg-success ms-auto" style={{ fontSize: 10 }}>LEVEL UP</span>}
            </div>

            {/* Quality Dimension Changes */}
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
                        <strong style={{ color: improved ? '#10b981' : '#9ca3af' }}>{d.after}/10</strong>
                        {improved && <span style={{ fontSize: 9, color: '#10b981' }}>+{d.after - d.before}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
          <div className="modal-footer d-flex justify-content-between">
            <button className="btn btn-sm" style={{ background: '#10b98120', color: '#059669', border: '1px solid #10b98140', fontWeight: 600 }}
              disabled={resyncing}
              onClick={async () => {
                setResyncing(true);
                try {
                  await bpApi.resyncProcess(processId);
                  setResyncDone(true);
                  setTimeout(() => setResyncDone(false), 3000);
                } catch {} finally { setResyncing(false); }
              }}>
              {resyncing ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Syncing...</>
                : resyncDone ? <><i className="bi bi-check-circle me-1"></i>Synced!</>
                : <><i className="bi bi-arrow-repeat me-1"></i>Resync</>}
            </button>
            <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm" style={{ background: '#6366f120', color: '#6366f1', border: '1px solid #6366f140', fontWeight: 600 }} onClick={async () => {
              const p = prediction || {};
              const proc = processData || {};
              const featSummary = (proc.features || []).slice(0, 5).map((f: any) => `- ${f.name}: ${f.description || ''}`).join('\n');
              const learnPrompt = `You are operating in LEARN MODE.

DO NOT write code. DO NOT give implementation instructions. DO NOT suggest building anything.
Your ONLY job is to help the learner UNDERSTAND what this step is, why it matters, and how it connects to the overall system.

---

You are a Technical Mentor helping someone understand a specific execution step before they build it.

ROLE: You are a patient, thorough instructor. You explain concepts before actions. You never skip steps.

---

# LEVEL 1: PROJECT CONTEXT (THE BIGGER PICTURE)

${projectContext || 'No project system prompt set yet — ask the learner about their project.'}

---

# LEVEL 2: BUSINESS PROCESS CONTEXT

This step belongs to the business process: "${proc.name || 'Unknown'}"

Process Description: ${proc.description || 'No description'}

Key Features in this process:
${featSummary || '- No features listed'}

Current State:
- System Readiness: ${proc.metrics?.system_readiness || 0}%
- Quality Score: ${proc.metrics?.quality_score || 0}%
- Maturity: L${proc.maturity?.level || 1} ${proc.maturity?.label || 'Prototype'}
- Status: ${proc.usability?.usable ? 'USABLE' : 'NOT READY'}

---

# LEVEL 3: STEP CONTEXT (WHAT WE'RE LEARNING ABOUT)

Step: ${actionLabel}
Impact: ${p.readiness_delta ? `+${p.readiness_delta}% system readiness` : 'Improves system capability'}

What this step does:
${prompt?.title || actionLabel}
${prompt?.prompt_text ? '\nImplementation involves:\n' + prompt.prompt_text.split('\n').filter((l: string) => l.startsWith('1.') || l.startsWith('2.') || l.startsWith('3.') || l.startsWith('4.') || l.startsWith('5.')).join('\n') : ''}

Predicted Impact:
- Readiness: ${p.before?.readiness || 0}% → ${p.after?.readiness || 0}%
- Quality: ${p.before?.quality || 0}% → ${p.after?.quality || 0}%
- Maturity: L${p.before?.maturity || 1} → L${p.after?.maturity || 1}

What it fixes: ${(p.gaps_resolved || []).join(', ') || 'System gaps'}
What it enables: ${(p.enables || []).join(', ') || 'Further capabilities'}

---

# HOW TO TEACH

1. Start by explaining the OVERALL PROJECT — what are we building and why (from Level 1)
2. Then explain this BUSINESS PROCESS — what role does it play in the project (from Level 2)
3. Then explain THIS SPECIFIC STEP — what are we about to build (from Level 3)
4. Explain WHY this step matters for the overall system
5. Explain HOW it connects to other parts of the system
6. Break down the technical concepts involved
7. Use analogies the learner can relate to
8. After each concept, ask a question to check understanding

RULES:
- ONE concept at a time
- Always connect back to the bigger picture (project → process → step)
- Explain WHY before HOW
- Use real-world analogies
- Ask for confirmation before moving on
- Never assume prior knowledge

START by greeting the learner, briefly summarizing the project, then explaining which business process and step they're about to learn.`;

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
          </div>
        </div>
      </div>
    </div>
  );
}
