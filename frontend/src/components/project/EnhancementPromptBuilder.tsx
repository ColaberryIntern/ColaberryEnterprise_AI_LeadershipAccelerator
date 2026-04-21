import React, { useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface ExecutionStep {
  key: string;
  step: number;
  label: string;
  impact: string;
  prompt_target: string;
  blocked: boolean;
  block_reason?: string;
  depends_on: string;
  fixes: string[];
  enables: string[];
}

interface AutonomyGap {
  gap_id: string;
  gap_type: 'behavior' | 'intelligence' | 'optimization' | 'reporting';
  title: string;
  description: string;
  severity: number;
  suggested_category: string;
  suggested_agent?: { name: string; description: string; type: string } | null;
}

interface Props {
  executionPlan: ExecutionStep[];
  autonomyGaps: AutonomyGap[];
  processId: string;
  processName: string;
  onPreview: (type: string, label: string) => void;
}

const GAP_TYPE_ICONS: Record<string, string> = {
  behavior: 'bi-person-lines-fill',
  intelligence: 'bi-lightbulb',
  optimization: 'bi-speedometer2',
  reporting: 'bi-bar-chart-line',
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  monitoring: 'Monitoring',
  alerting: 'Alerting',
  analytics: 'Analytics',
};

function showToast(msg: string, color: string = '#1a365d') {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:${color};color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-clipboard-check me-2"></i>${msg}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export default function EnhancementPromptBuilder({ executionPlan, autonomyGaps, processId, processName, onPreview }: Props) {
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set());
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const steps = executionPlan || [];
  const gaps = autonomyGaps || [];
  const totalSelected = selectedSteps.size + selectedGaps.size + selectedAgents.size;

  const toggleStep = (key: string) => {
    setSelectedSteps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleGap = (gapId: string) => {
    setSelectedGaps(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) next.delete(gapId); else next.add(gapId);
      return next;
    });
  };

  const toggleAgent = (agentName: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName); else next.add(agentName);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSteps(new Set(steps.filter(s => !s.blocked).map(s => s.prompt_target)));
    setSelectedGaps(new Set(gaps.map(g => g.gap_id)));
    setSelectedAgents(new Set(gaps.filter(g => g.suggested_agent).map(g => g.suggested_agent!.name)));
  };

  const clearAll = () => {
    setSelectedSteps(new Set());
    setSelectedGaps(new Set());
    setSelectedAgents(new Set());
  };

  const handleGenerate = async () => {
    if (totalSelected === 0) return;
    setGenerating(true);
    try {
      const gapPayload = gaps
        .filter(g => selectedGaps.has(g.gap_id))
        .map(g => ({ gap_id: g.gap_id, gap_type: g.gap_type, title: g.title, description: g.description, suggested_agent: g.suggested_agent || null }));

      const res = await bpApi.generateCombinedPrompt(processId, {
        execution_steps: Array.from(selectedSteps),
        autonomy_gaps: gapPayload,
        include_agents: Array.from(selectedAgents),
      });

      const text = res.data?.prompt_text || '';
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      showToast(`Prompt copied (${totalSelected} items) — paste into Claude Code`, '#8b5cf6');
    } catch {
      showToast('Failed to generate prompt', 'var(--color-danger)');
    } finally { setGenerating(false); }
  };

  const hasContent = steps.length > 0 || gaps.length > 0;
  if (!hasContent) {
    return (
      <div className="text-muted small">
        <i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>
        No enhancements needed — system is fully built.
      </div>
    );
  }

  return (
    <div>
      {/* ── Execution Steps ── */}
      {steps.length > 0 && (
        <div className="mb-3">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h6 className="fw-semibold mb-0" style={{ fontSize: 12, color: 'var(--color-primary)' }}>
              <i className="bi bi-list-check me-1"></i>Execution Steps
            </h6>
            <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 9 }}>{steps.length}</span>
          </div>
          <div className="p-2" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
            {steps.map((s, i) => {
              const isSelected = selectedSteps.has(s.prompt_target);
              return (
                <div key={s.key} className="d-flex align-items-start gap-2 mb-2 p-2" style={{ background: isSelected ? '#dbeafe' : '#fff', borderRadius: 6, border: '1px solid var(--color-border)', opacity: s.blocked ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    className="form-check-input mt-1"
                    checked={isSelected}
                    disabled={s.blocked}
                    onChange={() => toggleStep(s.prompt_target)}
                    style={{ flexShrink: 0 }}
                  />
                  <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 24, height: 24, background: s.blocked ? '#e2e8f0' : 'var(--color-primary)', color: s.blocked ? '#9ca3af' : '#fff', fontSize: 11, flexShrink: 0 }}>{s.step}</span>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <span className="fw-semibold" style={{ fontSize: 12, color: s.blocked ? '#9ca3af' : 'var(--color-primary)' }}>{s.label}</span>
                        <span className="badge ms-2" style={{ background: '#10b98120', color: 'var(--color-success)', fontSize: 9 }}>{s.impact}</span>
                      </div>
                      <button className="btn btn-sm btn-outline-primary" disabled={s.blocked} onClick={() => onPreview(s.prompt_target, s.label)} style={{ fontSize: 10, padding: '2px 8px' }}>
                        <i className="bi bi-eye me-1"></i>Preview
                      </button>
                    </div>
                    <div className="d-flex gap-3 mt-1" style={{ fontSize: 10 }}>
                      <span style={{ color: 'var(--color-success)' }}><i className="bi bi-check-circle me-1"></i>Fixes: {s.fixes.join(', ')}</span>
                      <span style={{ color: 'var(--color-info)' }}><i className="bi bi-unlock me-1"></i>Enables: {s.enables.join(', ')}</span>
                    </div>
                    {s.blocked && <div style={{ fontSize: 9, color: 'var(--color-danger)' }} className="mt-1"><i className="bi bi-lock me-1"></i>{s.block_reason || 'Blocked'}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Path to Autonomous ── */}
      {gaps.length > 0 && (
        <div className="mb-3">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h6 className="fw-semibold mb-0" style={{ fontSize: 12, color: '#8b5cf6' }}>
              <i className="bi bi-rocket-takeoff me-1"></i>Path to Autonomous
            </h6>
            <span className="badge" style={{ background: '#8b5cf6', color: '#fff', fontSize: 9 }}>{gaps.length}</span>
          </div>
          <p className="text-muted mb-2" style={{ fontSize: 10 }}>
            Gaps detected in this process. Select items to include in a combined prompt for Claude Code.
          </p>
          <div className="p-2" style={{ background: '#faf5ff', borderRadius: 8, border: '1px solid #8b5cf620' }}>
            {gaps.map(gap => {
              const isSelected = selectedGaps.has(gap.gap_id);
              const agentSelected = gap.suggested_agent ? selectedAgents.has(gap.suggested_agent.name) : false;
              return (
                <div key={gap.gap_id} className="mb-2">
                  <div className="d-flex align-items-start gap-2 p-2" style={{ background: isSelected ? '#ede9fe' : '#fff', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                    <input
                      type="checkbox"
                      className="form-check-input mt-1"
                      checked={isSelected}
                      onChange={() => toggleGap(gap.gap_id)}
                      style={{ flexShrink: 0 }}
                    />
                    <i className={`bi ${GAP_TYPE_ICONS[gap.gap_type] || 'bi-gear'}`} style={{ color: '#8b5cf6', marginTop: 2, flexShrink: 0 }}></i>
                    <div className="flex-grow-1">
                      <div className="fw-medium" style={{ fontSize: 11 }}>{gap.title}</div>
                      <div className="text-muted" style={{ fontSize: 10 }}>{gap.description}</div>
                      <div className="d-flex gap-1 mt-1">
                        <span className="badge" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 8 }}>{gap.gap_type}</span>
                        <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 8 }}>Severity: {gap.severity}/10</span>
                      </div>
                    </div>
                  </div>
                  {/* Suggested agent creation */}
                  {gap.suggested_agent && (
                    <div className="d-flex align-items-center gap-2 ms-4 mt-1 p-2" style={{ background: agentSelected ? '#dcfce7' : '#f0fdf4', borderRadius: 6, border: '1px dashed #86efac' }}>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={agentSelected}
                        onChange={() => toggleAgent(gap.suggested_agent!.name)}
                        style={{ flexShrink: 0 }}
                      />
                      <i className="bi bi-robot" style={{ color: 'var(--color-accent)', flexShrink: 0 }}></i>
                      <div className="flex-grow-1">
                        <div className="fw-medium" style={{ fontSize: 11 }}>{gap.suggested_agent.name}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>{gap.suggested_agent.description}</div>
                      </div>
                      <span className="badge" style={{ background: '#10b98120', color: 'var(--color-accent)', fontSize: 8 }}>
                        {AGENT_TYPE_LABELS[gap.suggested_agent.type] || gap.suggested_agent.type}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="d-flex align-items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        <span className="text-muted" style={{ fontSize: 11 }}>
          <strong>{totalSelected}</strong> item{totalSelected !== 1 ? 's' : ''} selected
        </span>
        <button className="btn btn-sm btn-link text-muted p-0" style={{ fontSize: 10 }} onClick={selectAll}>Select All</button>
        <span className="text-muted" style={{ fontSize: 10 }}>|</span>
        <button className="btn btn-sm btn-link text-muted p-0" style={{ fontSize: 10 }} onClick={clearAll}>Clear</button>
        <div className="flex-grow-1"></div>
        <button
          className="btn btn-sm"
          style={{ background: '#8b5cf6', color: '#fff', fontWeight: 700, fontSize: 11 }}
          disabled={totalSelected === 0 || generating}
          onClick={handleGenerate}
        >
          {generating ? (
            <><span className="spinner-border spinner-border-sm me-1"></span>Generating...</>
          ) : (
            <><i className="bi bi-terminal me-1"></i>Generate &amp; Copy Prompt ({totalSelected})</>
          )}
        </button>
      </div>
    </div>
  );
}
