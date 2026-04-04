import React, { useEffect, useState } from 'react';
import * as bpApi from '../../../services/businessProcessApi';

const AUTONOMY_LEVELS = ['manual', 'assisted', 'supervised', 'autonomous'];
const PROMPT_TARGETS = [
  { key: 'backend_improvement', label: 'Backend', icon: 'bi-gear' },
  { key: 'frontend_exposure', label: 'Frontend', icon: 'bi-layout-wtf' },
  { key: 'agent_enhancement', label: 'Agents', icon: 'bi-cpu' },
  { key: 'hitl_adjustment', label: 'HITL', icon: 'bi-shield-check' },
  { key: 'autonomy_upgrade', label: 'Autonomy', icon: 'bi-lightning' },
  { key: 'monitoring_gap', label: 'Monitoring', icon: 'bi-graph-up' },
];

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

export default function BusinessProcessDetailPanel({ processId, onClose, onUpdate }: Props) {
  const [process, setProcess] = useState<any>(null);
  const [evolution, setEvolution] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState<string | null>(null);

  useEffect(() => {
    bpApi.getBusinessProcess(processId).then(r => setProcess(r.data)).catch(() => {});
    bpApi.getEvolution(processId).then(r => setEvolution(r.data)).catch(() => {});
  }, [processId]);

  if (!process) return null;

  const scores = process.strength_scores || {};
  const hitl = process.hitl_config || {};
  const history = process.autonomy_history || [];

  const handleAutonomyChange = async (level: string) => {
    await bpApi.updateAutonomyLevel(processId, level, 'Admin adjustment');
    bpApi.getBusinessProcess(processId).then(r => setProcess(r.data));
    onUpdate();
  };

  const handleHITLToggle = async (key: string, value: boolean) => {
    await bpApi.updateHITLConfig(processId, { [key]: value });
    bpApi.getBusinessProcess(processId).then(r => setProcess(r.data));
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      await bpApi.evaluateProcess(processId);
      const r = await bpApi.getBusinessProcess(processId);
      setProcess(r.data);
      onUpdate();
    } catch {} finally { setEvaluating(false); }
  };

  const handleGeneratePrompt = async (target: string) => {
    setGeneratingPrompt(target);
    try {
      const r = await bpApi.generatePrompt(processId, target);
      await navigator.clipboard.writeText(r.data.prompt_text);
      const toast = document.createElement('div');
      toast.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a365d;color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px;animation:toastIn 0.3s ease"><i class="bi bi-clipboard-check me-2"></i>Prompt copied: ${r.data.title}</div><style>@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    } catch {} finally { setGeneratingPrompt(null); }
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}><i className="bi bi-diagram-3 me-2"></i>{process.name}</h6>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? <><span className="spinner-border spinner-border-sm me-1"></span>Evaluating...</> : <><i className="bi bi-bar-chart me-1"></i>Evaluate</>}
          </button>
          <button className="btn btn-link btn-sm text-muted p-0" onClick={onClose}><i className="bi bi-x-lg"></i></button>
        </div>
      </div>
      <div className="card-body p-3">
        <div className="row g-4">
          {/* Left: Scores + Autonomy */}
          <div className="col-md-6">
            {/* Autonomy Control */}
            <div className="mb-4">
              <label className="form-label small fw-medium">Autonomy Level</label>
              <select className="form-select form-select-sm" value={process.autonomy_level} onChange={e => handleAutonomyChange(e.target.value)}>
                {AUTONOMY_LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
              <div className="mt-1 text-muted" style={{ fontSize: 10 }}>
                Success: {((process.success_rate || 0) * 100).toFixed(0)}% · Failure: {((process.failure_rate || 0) * 100).toFixed(0)}% · Confidence: {((process.confidence_score || 0) * 100).toFixed(0)}%
              </div>
            </div>

            {/* Strength Scores */}
            <div className="mb-4">
              <h6 className="fw-semibold small mb-2">Strength Scores</h6>
              {Object.entries(scores).filter(([k]) => k !== 'overall').map(([dim, val]: [string, any]) => (
                <div key={dim} className="d-flex align-items-center gap-2 mb-1">
                  <span className="text-muted text-capitalize" style={{ fontSize: 11, width: 110 }}>{dim.replace(/_/g, ' ')}</span>
                  <div className="progress flex-grow-1" style={{ height: 6 }}>
                    <div className="progress-bar" style={{ width: `${val}%`, background: val >= 70 ? 'var(--color-accent)' : val >= 40 ? '#f59e0b' : 'var(--color-secondary)' }} />
                  </div>
                  <span className="fw-medium" style={{ fontSize: 11, width: 25, textAlign: 'right' }}>{val}</span>
                </div>
              ))}
            </div>

            {/* HITL Controls */}
            <div className="mb-4">
              <h6 className="fw-semibold small mb-2">Human-in-the-Loop Controls</h6>
              {[
                { key: 'approval_before_execution', label: 'Require approval before execution' },
                { key: 'approval_after_generation', label: 'Require approval after AI generation' },
                { key: 'approval_before_external_action', label: 'Require approval before external actions' },
              ].map(({ key, label }) => (
                <div key={key} className="form-check form-switch mb-1">
                  <input className="form-check-input" type="checkbox" checked={hitl[key] !== false} onChange={e => handleHITLToggle(key, e.target.checked)} style={{ cursor: 'pointer' }} />
                  <label className="form-check-label small">{label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Evolution + Prompts */}
          <div className="col-md-6">
            {/* Linked Agents */}
            <div className="mb-4">
              <h6 className="fw-semibold small mb-2">Linked Agents ({(process.linked_agents || []).length})</h6>
              <div className="d-flex flex-wrap gap-1">
                {(process.linked_agents || []).map((a: string) => (
                  <span key={a} className="badge bg-light text-dark" style={{ fontSize: 10 }}><i className="bi bi-cpu me-1"></i>{a}</span>
                ))}
              </div>
            </div>

            {/* Evolution Recommendations */}
            {evolution && (
              <div className="mb-4">
                <h6 className="fw-semibold small mb-2">Evolution Recommendations</h6>
                {(evolution.improvement_areas || []).map((area: string, i: number) => (
                  <div key={i} className="d-flex gap-2 mb-1 small">
                    <i className="bi bi-arrow-right-circle" style={{ color: 'var(--color-primary-light)' }}></i>
                    <span className="text-muted">{area}</span>
                  </div>
                ))}
                {(evolution.agent_recommendations || []).filter((r: any) => r.status !== 'active').map((r: any, i: number) => (
                  <div key={i} className="d-flex gap-2 mb-1 small">
                    <i className="bi bi-exclamation-triangle" style={{ color: '#f59e0b' }}></i>
                    <span className="text-muted">{r.agent_name}: {r.recommendations[0]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Prompt Generation */}
            <div className="mb-4">
              <h6 className="fw-semibold small mb-2">Generate Improvement Prompts</h6>
              <div className="d-flex flex-wrap gap-1">
                {PROMPT_TARGETS.map(t => (
                  <button key={t.key} className="btn btn-sm btn-outline-secondary" onClick={() => handleGeneratePrompt(t.key)}
                    disabled={generatingPrompt === t.key} style={{ fontSize: 10 }}>
                    {generatingPrompt === t.key ? <span className="spinner-border spinner-border-sm"></span> : <i className={`bi ${t.icon} me-1`}></i>}
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="text-muted mt-1" style={{ fontSize: 9 }}>Click to copy Claude Code-compatible prompt to clipboard</div>
            </div>

            {/* Autonomy History */}
            {history.length > 0 && (
              <div>
                <h6 className="fw-semibold small mb-2">Autonomy History</h6>
                {history.slice(-5).reverse().map((h: any, i: number) => (
                  <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: 10 }}>
                    <span className="text-muted">{new Date(h.timestamp).toLocaleDateString()}</span>
                    <span>{h.from} → <strong>{h.to}</strong></span>
                    <span className="text-muted">— {h.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
