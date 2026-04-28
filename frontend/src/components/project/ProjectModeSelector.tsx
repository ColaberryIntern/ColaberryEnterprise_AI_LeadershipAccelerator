import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

/**
 * Project Target Mode selector. Sets the bar for what "100% complete" means
 * across the BP grid and the recommendation engine. Surfaced on Blueprint,
 * System View, and the Dashboard so the user always has the dial within reach.
 *
 * Two visual variants:
 *   - card    (default): the full-width card used on the Dashboard
 *   - compact:           small inline pill + dropdown for page headers
 */

export type ProjectMode = 'mvp' | 'production' | 'enterprise' | 'autonomous';

interface ModeInfo {
  value: ProjectMode;
  label: string;
  desc: string;
  icon: string;
}

export const PROJECT_MODES: ModeInfo[] = [
  { value: 'mvp', label: 'MVP', desc: 'Backend works · 60% coverage · Fast iteration', icon: 'bi-lightning' },
  { value: 'production', label: 'Production', desc: 'Backend + frontend + models · 90% coverage', icon: 'bi-server' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Adds agents · 95% coverage · Strict validation', icon: 'bi-building' },
  { value: 'autonomous', label: 'Autonomous', desc: 'Self-managing · 98% coverage · Full quality', icon: 'bi-robot' },
];

const TOOLTIP = `What "100%" means in this mode:

• Production-tier complete = backend + frontend + models built, ${'>'}=90% of requirements verified.
• Autonomous improvements (agents, intelligence, observability) are suggested as enhancements after you reach 100% — they don't gate completion.
• Mark Verified when Claude Code reports COMPLETE and tests pass.`;

interface Props {
  variant?: 'card' | 'compact';
  /** Optional: force a specific current mode (e.g. when caller already loaded it). */
  currentMode?: ProjectMode | null;
  /** Called after a successful mode switch with the API result. Defaults to a page reload. */
  onModeChange?: (result: any) => void;
}

export default function ProjectModeSelector({ variant = 'card', currentMode, onModeChange }: Props) {
  const [mode, setMode] = useState<ProjectMode>(currentMode || 'production');
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (currentMode) { setMode(currentMode); return; }
    portalApi.get('/api/portal/project/business-processes')
      .then(res => {
        const procs = res.data || [];
        if (procs.length > 0 && procs[0].effective_mode) setMode(procs[0].effective_mode);
      })
      .catch(() => { /* defaults to 'production' */ });
  }, [currentMode]);

  const handleChange = async (newMode: ProjectMode) => {
    if (newMode === mode || saving) return;
    setSaving(true);
    setLastResult(null);
    try {
      const r = await portalApi.put('/api/portal/project/target-mode', { mode: newMode, cascade: true });
      setMode(newMode);
      setLastResult(r.data);
      setOpen(false);
      setTimeout(() => setLastResult(null), 6000);
      if (onModeChange) onModeChange(r.data);
      else window.location.reload();
    } catch { /* surface failure quietly — UI keeps the old mode */ }
    finally { setSaving(false); }
  };

  const current = PROJECT_MODES.find(m => m.value === mode) || PROJECT_MODES[1];

  // ── Compact variant: small inline pill with click-to-expand dropdown ──
  if (variant === 'compact') {
    return (
      <div className="position-relative d-inline-block" style={{ minWidth: 0 }}>
        <button
          className="btn btn-sm d-flex align-items-center gap-2"
          style={{
            background: 'var(--color-bg-alt)',
            border: '1px solid var(--color-border)',
            fontSize: 11,
            padding: '4px 10px',
            color: 'var(--color-primary)',
            fontWeight: 500,
          }}
          onClick={() => setOpen(o => !o)}
          disabled={saving}
        >
          <i className={`bi ${current.icon}`} style={{ fontSize: 12 }}></i>
          <span>Mode: <strong>{current.label}</strong></span>
          <i
            className="bi bi-question-circle text-muted"
            style={{ fontSize: 11 }}
            title={TOOLTIP}
          ></i>
          <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10 }}></i>
        </button>
        {open && (
          <>
            {/* click-away */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
              onClick={() => setOpen(false)}
            />
            <div
              className="card border-0 shadow"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                zIndex: 1050,
                minWidth: 320,
                background: '#fff',
              }}
            >
              <div className="card-body p-2">
                <div className="text-muted px-2 py-1" style={{ fontSize: 10 }}>
                  Sets the bar for what 100% means.
                </div>
                {PROJECT_MODES.map(m => {
                  const active = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      className="btn btn-sm w-100 d-flex align-items-start gap-2 mb-1 text-start"
                      style={{
                        background: active ? 'var(--color-bg-alt)' : 'transparent',
                        border: active ? '1px solid var(--color-primary)' : '1px solid transparent',
                        fontSize: 11,
                        padding: '6px 8px',
                        lineHeight: 1.3,
                      }}
                      onClick={() => handleChange(m.value)}
                      disabled={saving}
                    >
                      <i className={`bi ${m.icon}`} style={{ color: active ? 'var(--color-primary)' : '#94a3b8', fontSize: 14, marginTop: 1 }}></i>
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-1">
                          <span className="fw-semibold" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>{m.label}</span>
                          {active && <i className="bi bi-check-lg" style={{ color: 'var(--color-primary)', fontSize: 12 }}></i>}
                        </div>
                        <div className="text-muted" style={{ fontSize: 10 }}>{m.desc}</div>
                      </div>
                    </button>
                  );
                })}
                <div className="text-muted px-2 py-1 mt-1" style={{ fontSize: 9, borderTop: '1px solid var(--color-border)' }}>
                  Higher tiers add layers — they don't gate the lower tiers.
                  Mark a BP <strong>Verified</strong> when it's truly done at any level.
                </div>
              </div>
            </div>
          </>
        )}
        {lastResult && (
          <div
            className="position-absolute"
            style={{
              top: 'calc(100% + 4px)',
              right: 0,
              background: 'var(--color-accent)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 10,
              whiteSpace: 'nowrap',
              zIndex: 1060,
            }}
          >
            <i className="bi bi-check-circle me-1"></i>
            Switched to {lastResult.profile}
          </div>
        )}
      </div>
    );
  }

  // ── Card variant: original full-width card used on the Dashboard ──
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div>
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
              <i className="bi bi-sliders me-2"></i>Project Target Mode
            </span>
            <span className="text-muted ms-2" style={{ fontSize: 10 }}>
              Sets what 100% means · changes completion criteria, gates, and priorities for all processes
            </span>
            <i
              className="bi bi-question-circle text-muted ms-2"
              style={{ fontSize: 11, cursor: 'help' }}
              title={TOOLTIP}
            ></i>
          </div>
        </div>
        <div className="d-flex gap-2">
          {PROJECT_MODES.map(m => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                className={`btn btn-sm flex-fill ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: 10, padding: '6px 8px', lineHeight: 1.3 }}
                onClick={() => handleChange(m.value)}
                disabled={saving}
                title={m.desc}
              >
                <i className={`bi ${m.icon} me-1`}></i>{m.label}
                {active && <i className="bi bi-check-lg ms-1"></i>}
              </button>
            );
          })}
        </div>
        {lastResult && (
          <div className="mt-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 10 }}>
            <i className="bi bi-check-circle me-1" style={{ color: 'var(--color-accent)' }}></i>
            Switched to <strong>{lastResult.profile}</strong>
            {lastResult.overrides_cleared > 0 && <> · {lastResult.overrides_cleared} process overrides cleared</>}
            {' '}· Requires {lastResult.completion_thresholds?.reqCoverage}% coverage, L{lastResult.maturity_required} maturity
            {' '}· All processes re-prioritized by gap to completion
          </div>
        )}
      </div>
    </div>
  );
}
