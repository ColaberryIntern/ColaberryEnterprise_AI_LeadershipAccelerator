import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

type DetailTab = 'overview' | 'traceability' | 'gaps' | 'controls' | 'health';

const STATUS_BADGES: Record<string, { bg: string; color: string; label: string }> = {
  matched: { bg: '#10b98120', color: '#10b981', label: 'Implemented' },
  verified: { bg: '#10b98120', color: '#10b981', label: 'Verified' },
  partial: { bg: '#f59e0b20', color: '#f59e0b', label: 'Partial' },
  unmatched: { bg: '#ef444420', color: '#ef4444', label: 'Not Built' },
  not_started: { bg: '#9ca3af20', color: '#9ca3af', label: 'Not Started' },
};

const AUTONOMY_LEVELS = ['manual', 'assisted', 'supervised', 'autonomous'];
const AUTONOMY_COLORS: Record<string, string> = { manual: '#9ca3af', assisted: '#3b82f6', supervised: '#f59e0b', autonomous: '#10b981' };

const PROMPT_TARGETS = [
  { key: 'backend_improvement', label: 'Fix Backend', icon: 'bi-gear' },
  { key: 'frontend_exposure', label: 'Add Frontend', icon: 'bi-layout-wtf' },
  { key: 'agent_enhancement', label: 'Enhance Agent', icon: 'bi-cpu' },
  { key: 'hitl_adjustment', label: 'Improve Controls', icon: 'bi-shield-check' },
  { key: 'autonomy_upgrade', label: 'Increase Autonomy', icon: 'bi-lightning' },
  { key: 'monitoring_gap', label: 'Add Monitoring', icon: 'bi-graph-up' },
];

function toast(msg: string) {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--color-primary,#1a365d);color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-clipboard-check me-2"></i>${msg}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export default function PortalBusinessProcessDetail({ processId, onClose, onUpdate }: Props) {
  const [p, setP] = useState<any>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [evaluating, setEvaluating] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState<string | null>(null);

  const load = () => { bpApi.getProcess(processId).then(r => setP(r.data)).catch(() => {}); };
  useEffect(load, [processId]);

  if (!p) return null;

  const features = p.features || [];
  const totalR = p.total_requirements || 0;
  const matchedR = p.matched_requirements || 0;
  const partialR = p.partial_requirements || 0;
  const gaps = p.gaps || [];
  const pct = p.completion_pct || 0;
  const vision = p.vision || [];
  const hitl = p.hitl_config || {};
  const history = p.autonomy_history || [];
  const scores = p.strength_scores || {};
  const autoColor = AUTONOMY_COLORS[p.autonomy_level] || '#9ca3af';

  const handleAutonomy = async (level: string) => {
    await bpApi.updateAutonomy(processId, level, 'User adjustment');
    load(); onUpdate();
  };

  const handleHITL = async (key: string, value: boolean) => {
    await bpApi.updateHITL(processId, { [key]: value });
    load();
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try { await bpApi.evaluate(processId); load(); onUpdate(); } catch {} finally { setEvaluating(false); }
  };

  const handlePrompt = async (target: string) => {
    setGeneratingPrompt(target);
    try {
      const r = await bpApi.generatePrompt(processId, target);
      await navigator.clipboard.writeText(r.data.prompt_text);
      toast(`Prompt copied: ${r.data.title}`);
    } catch {} finally { setGeneratingPrompt(null); }
  };

  const TABS: Array<{ key: DetailTab; label: string; icon: string }> = [
    { key: 'overview', label: 'Overview', icon: 'bi-grid' },
    { key: 'traceability', label: 'Traceability', icon: 'bi-diagram-2' },
    { key: 'gaps', label: `Gaps (${gaps.length})`, icon: 'bi-exclamation-triangle' },
    { key: 'controls', label: 'AI Controls', icon: 'bi-shield-check' },
    { key: 'health', label: 'Health', icon: 'bi-heart-pulse' },
  ];

  return (
    <div className="card border-0 shadow">
      {/* Header */}
      <div className="card-header bg-white py-3" style={{ borderBottom: `3px solid ${autoColor}` }}>
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>{p.name}</h5>
            <div className="d-flex align-items-center gap-3">
              <span className="badge" style={{ background: `${autoColor}20`, color: autoColor, fontSize: 10 }}>
                {(p.autonomy_level || 'manual').toUpperCase()}
              </span>
              <span className="text-muted" style={{ fontSize: 12 }}>{matchedR}/{totalR} requirements · {Math.round(pct)}% complete</span>
            </div>
          </div>
          <button className="btn btn-link text-muted p-0" onClick={onClose}><i className="bi bi-x-lg" style={{ fontSize: 18 }}></i></button>
        </div>
        {/* Progress bar */}
        <div className="progress mt-2" style={{ height: 6 }}>
          <div className="progress-bar" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--color-accent)' : pct >= 40 ? '#f59e0b' : 'var(--color-secondary)' }} />
        </div>
      </div>

      {/* Tab nav */}
      <div className="card-body p-0">
        <nav className="nav nav-tabs px-3 pt-2" style={{ fontSize: 12 }}>
          {TABS.map(t => (
            <button key={t.key} className={`nav-link${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} style={{ fontSize: 12, padding: '6px 12px' }}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          ))}
        </nav>

        <div className="p-3">
          {/* ─── OVERVIEW TAB ─── */}
          {tab === 'overview' && (
            <div>
              {p.description && <p className="text-muted small mb-3">{p.description}</p>}

              {/* Stats */}
              <div className="d-flex gap-4 mb-4">
                <div className="text-center"><div className="fw-bold" style={{ fontSize: 24, color: 'var(--color-accent)' }}>{matchedR}</div><div className="text-muted" style={{ fontSize: 10 }}>Implemented</div></div>
                <div className="text-center"><div className="fw-bold" style={{ fontSize: 24, color: '#f59e0b' }}>{partialR}</div><div className="text-muted" style={{ fontSize: 10 }}>Partial</div></div>
                <div className="text-center"><div className="fw-bold" style={{ fontSize: 24, color: 'var(--color-secondary)' }}>{gaps.length}</div><div className="text-muted" style={{ fontSize: 10 }}>Gaps</div></div>
                <div className="text-center"><div className="fw-bold" style={{ fontSize: 24, color: 'var(--color-primary)' }}>{features.length}</div><div className="text-muted" style={{ fontSize: 10 }}>Features</div></div>
              </div>

              {/* Vision */}
              {vision.length > 0 && (
                <div className="mb-3">
                  <h6 className="fw-semibold small mb-2"><i className="bi bi-eye me-1"></i>Vision — What This Process Should Do</h6>
                  <ul className="list-unstyled ps-2">
                    {vision.map((v: string, i: number) => (
                      <li key={i} className="text-muted small mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>{v}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Feature summary */}
              <h6 className="fw-semibold small mb-2"><i className="bi bi-layers me-1"></i>Features</h6>
              {features.map((f: any) => (
                <div key={f.id} className="d-flex justify-content-between align-items-center mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 12 }}>{f.name}</span>
                  <div className="d-flex align-items-center gap-2">
                    <div className="progress" style={{ width: 60, height: 4 }}>
                      <div className="progress-bar bg-success" style={{ width: `${f.completion_pct || 0}%` }} />
                    </div>
                    <span className="text-muted" style={{ fontSize: 10, width: 30 }}>{Math.round(f.completion_pct || 0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── TRACEABILITY TAB ─── */}
          {tab === 'traceability' && (
            <div>
              <h6 className="fw-semibold small mb-2">Requirements → Code Mapping</h6>
              {features.map((feature: any) => {
                const reqs = feature.requirements || [];
                return (
                  <div key={feature.id} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-medium" style={{ fontSize: 12, color: 'var(--color-primary)' }}><i className="bi bi-layers me-1"></i>{feature.name}</span>
                      <span className="text-muted" style={{ fontSize: 10 }}>{Math.round(feature.completion_pct || 0)}% · {reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified').length}/{reqs.length}</span>
                    </div>
                    <div className="ps-3">
                      {reqs.map((req: any) => {
                        const badge = STATUS_BADGES[req.status] || STATUS_BADGES.not_started;
                        const files = req.github_file_paths || [];
                        return (
                          <div key={req.id} className="d-flex align-items-start gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: 8, flexShrink: 0, marginTop: 2 }}>{badge.label}</span>
                            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11 }}><strong className="me-1">{req.key}</strong><span className="text-muted">{req.text?.substring(0, 120)}{req.text?.length > 120 ? '...' : ''}</span></div>
                              {files.length > 0 && (
                                <div className="d-flex flex-wrap gap-1 mt-1">
                                  {files.slice(0, 4).map((f: string, i: number) => <span key={i} className="badge bg-light text-dark" style={{ fontSize: 8 }}><i className="bi bi-file-code me-1"></i>{f.split('/').pop()}</span>)}
                                  {files.length > 4 && <span className="text-muted" style={{ fontSize: 8 }}>+{files.length - 4} more</span>}
                                </div>
                              )}
                            </div>
                            {req.confidence_score != null && <span className="text-muted" style={{ fontSize: 9 }}>{Math.round(req.confidence_score * 100)}%</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── GAPS TAB ─── */}
          {tab === 'gaps' && (
            <div>
              {gaps.length === 0 ? (
                <div className="text-center py-4 text-muted"><i className="bi bi-check-circle me-1" style={{ color: 'var(--color-accent)' }}></i>All requirements are implemented. No gaps detected.</div>
              ) : (
                <>
                  <h6 className="fw-semibold small mb-2">{gaps.length} Missing Requirements</h6>
                  <div className="mb-3">
                    {gaps.map((g: any, i: number) => {
                      const badge = STATUS_BADGES[g.status] || STATUS_BADGES.not_started;
                      return (
                        <div key={i} className="d-flex align-items-start gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: 8, flexShrink: 0, marginTop: 2 }}>{badge.label}</span>
                          <div style={{ fontSize: 11 }}>
                            <strong className="me-1">{g.key}</strong>
                            <span className="text-muted">{g.text?.substring(0, 150)}</span>
                            <div className="text-muted" style={{ fontSize: 9 }}>Feature: {g.feature_name}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Prompt action buttons */}
              <h6 className="fw-semibold small mb-2 mt-4"><i className="bi bi-lightning me-1"></i>Generate Improvement Prompts</h6>
              <p className="text-muted" style={{ fontSize: 10 }}>Click to copy a Claude Code-compatible prompt to your clipboard</p>
              <div className="d-flex flex-wrap gap-2">
                {PROMPT_TARGETS.map(t => (
                  <button key={t.key} className="btn btn-sm btn-outline-primary" onClick={() => handlePrompt(t.key)} disabled={generatingPrompt === t.key} style={{ fontSize: 11 }}>
                    {generatingPrompt === t.key ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className={`bi ${t.icon} me-1`}></i>}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── AI CONTROLS TAB ─── */}
          {tab === 'controls' && (
            <div className="row g-4">
              <div className="col-md-6">
                <h6 className="fw-semibold small mb-2"><i className="bi bi-speedometer2 me-1"></i>Autonomy Level</h6>
                <select className="form-select form-select-sm mb-2" value={p.autonomy_level || 'manual'} onChange={e => handleAutonomy(e.target.value)}>
                  {AUTONOMY_LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
                <div className="text-muted mb-3" style={{ fontSize: 10 }}>
                  Success: {((p.success_rate || 0) * 100).toFixed(0)}% · Failure: {((p.failure_rate || 0) * 100).toFixed(0)}% · Confidence: {((p.confidence_score || 0) * 100).toFixed(0)}%
                </div>

                <h6 className="fw-semibold small mb-2"><i className="bi bi-shield-check me-1"></i>Human Approval Controls</h6>
                {[
                  { key: 'approval_before_execution', label: 'Approve before AI executes actions' },
                  { key: 'approval_after_generation', label: 'Approve after AI generates content' },
                  { key: 'approval_before_external_action', label: 'Approve before external integrations' },
                ].map(({ key, label }) => (
                  <div key={key} className="form-check form-switch mb-1">
                    <input className="form-check-input" type="checkbox" checked={hitl[key] !== false} onChange={e => handleHITL(key, e.target.checked)} style={{ cursor: 'pointer' }} />
                    <label className="form-check-label small">{label}</label>
                  </div>
                ))}
              </div>

              <div className="col-md-6">
                {history.length > 0 && (
                  <div>
                    <h6 className="fw-semibold small mb-2"><i className="bi bi-clock-history me-1"></i>Autonomy History</h6>
                    {history.slice(-5).reverse().map((h: any, i: number) => (
                      <div key={i} className="d-flex gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 10 }}>
                        <span className="text-muted">{new Date(h.timestamp).toLocaleDateString()}</span>
                        <span>{h.from} → <strong>{h.to}</strong></span>
                        <span className="text-muted">— {h.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                {history.length === 0 && <div className="text-muted small">No autonomy changes yet. Adjust the level above to start tracking.</div>}
              </div>
            </div>
          )}

          {/* ─── HEALTH TAB ─── */}
          {tab === 'health' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-semibold small mb-0"><i className="bi bi-heart-pulse me-1"></i>Process Health Scores</h6>
                <button className="btn btn-sm btn-outline-primary" onClick={handleEvaluate} disabled={evaluating}>
                  {evaluating ? <><span className="spinner-border spinner-border-sm me-1"></span>Scoring...</> : <><i className="bi bi-bar-chart me-1"></i>Score Process</>}
                </button>
              </div>

              {Object.keys(scores).length > 0 ? (
                <>
                  {Object.entries(scores).filter(([k]) => k !== 'overall').map(([dim, val]: [string, any]) => (
                    <div key={dim} className="d-flex align-items-center gap-2 mb-2">
                      <span className="text-muted text-capitalize" style={{ fontSize: 11, width: 120 }}>{dim.replace(/_/g, ' ')}</span>
                      <div className="progress flex-grow-1" style={{ height: 8 }}>
                        <div className="progress-bar" style={{ width: `${val}%`, background: val >= 70 ? 'var(--color-accent)' : val >= 40 ? '#f59e0b' : 'var(--color-secondary)' }} />
                      </div>
                      <span className="fw-medium" style={{ fontSize: 12, width: 30, textAlign: 'right' }}>{val}</span>
                    </div>
                  ))}
                  <div className="mt-3 text-muted" style={{ fontSize: 10 }}>
                    Overall: <strong>{scores.overall || 0}/100</strong>
                    {p.last_evaluated_at && <span> · Last scored: {new Date(p.last_evaluated_at).toLocaleDateString()}</span>}
                  </div>
                </>
              ) : (
                <div className="text-center text-muted py-4">
                  <i className="bi bi-bar-chart d-block mb-2" style={{ fontSize: 30 }}></i>
                  <div style={{ fontSize: 12 }}>No health scores yet. Click "Score Process" to evaluate this process across 7 dimensions.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
