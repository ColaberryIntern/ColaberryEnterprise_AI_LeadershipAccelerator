/**
 * LiveOrchestrationPressureBadges — surfaces UX pressure escalation as a
 * compact bar of live-polled badges:
 *
 *   - Pressure tier (calm / elevated / urgent / critical)
 *   - Pressure score 0-100
 *   - Recommended action
 *   - Triggering reasons (top 3)
 *
 * Phase 7 §18.
 */
import React, { useState } from 'react';
import { useAdaptiveUXPressure } from '../../hooks/useAdaptiveUXPressure';

interface Props {
  className?: string;
  pollIntervalMs?: number;
}

const TIER_TONE: Record<string, { btn: string; bg: string; text: string; icon: string }> = {
  calm: { btn: 'btn-outline-success', bg: 'bg-success-subtle', text: 'text-success', icon: 'bi-check-circle' },
  elevated: { btn: 'btn-outline-warning', bg: 'bg-warning-subtle', text: 'text-warning-emphasis', icon: 'bi-exclamation-circle' },
  urgent: { btn: 'btn-outline-danger', bg: 'bg-warning-subtle', text: 'text-warning-emphasis', icon: 'bi-exclamation-octagon' },
  critical: { btn: 'btn-danger', bg: 'bg-danger-subtle', text: 'text-danger', icon: 'bi-shield-exclamation' },
};

export const LiveOrchestrationPressureBadges: React.FC<Props> = ({ className, pollIntervalMs = 30000 }) => {
  const { data, loading, error } = useAdaptiveUXPressure({ pollIntervalMs });
  const [open, setOpen] = useState(false);

  if (error) {
    return <div className={`small text-muted ${className ?? ''}`}>—</div>;
  }
  if (!data) {
    return <div className={`small text-muted ${className ?? ''}`}>{loading ? 'Loading pressure…' : '—'}</div>;
  }
  const tone = TIER_TONE[data.pressure.tier] || TIER_TONE.calm;

  return (
    <div className={`position-relative d-inline-block ${className ?? ''}`}>
      <button
        type="button"
        className={`btn btn-sm ${tone.btn} d-inline-flex align-items-center`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Orchestration pressure detail"
        style={{ fontSize: 12 }}
      >
        <i className={`bi ${tone.icon} me-1`}></i>
        <span className="text-uppercase" style={{ letterSpacing: 0.4, fontWeight: 600 }}>{data.pressure.tier}</span>
        <strong className="ms-2">{data.pressure.pressure_level}</strong>
        {data.affected_task_count > 0 && (
          <span className="badge bg-light text-dark border ms-2" style={{ fontWeight: 400 }}>
            {data.affected_task_count} reranked
          </span>
        )}
      </button>

      {open && (
        <div
          className="card border-0 shadow position-absolute end-0 mt-2"
          style={{ minWidth: 360, zIndex: 1050 }}
          role="dialog"
          aria-label="Pressure escalation detail"
        >
          <div className="card-body small">
            <div className="fw-semibold mb-1">Pressure: {data.pressure.pressure_level}/100 — {data.pressure.tier}</div>
            <div className="text-muted mb-2">Weight factor: <code>{data.pressure.applied_weight_factor.toFixed(2)}</code></div>

            <div className="alert alert-info py-2 small mb-2">
              <i className="bi bi-lightbulb me-1"></i>
              {data.pressure.recommended_action}
            </div>

            {data.pressure.reasons.length > 0 && (
              <>
                <div className="text-uppercase text-muted small mb-1" style={{ fontSize: 10, letterSpacing: 0.5 }}>Triggers</div>
                <ul className="small mb-2 ps-3">
                  {data.pressure.reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </>
            )}

            {data.adjustments.length > 0 && (
              <>
                <div className="text-uppercase text-muted small mb-1" style={{ fontSize: 10, letterSpacing: 0.5 }}>Top reranks</div>
                <ul className="small mb-0 ps-3">
                  {data.adjustments.slice(0, 5).map(a => (
                    <li key={a.task_id}>
                      <code className="me-2">{a.task_id.slice(0, 30)}{a.task_id.length > 30 ? '…' : ''}</code>
                      <span className="badge bg-light text-dark border me-1">
                        {a.previous_rank.toFixed(1)} → {a.adjusted_rank.toFixed(1)}
                      </span>
                      <span className="text-muted">{a.reasons[0]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="d-flex gap-2 mt-3 small text-muted">
              <span>friction <strong>{data.inputs.friction_pressure}</strong></span>
              <span>worst cog <strong>{data.inputs.worst_cognition_score}</strong></span>
              {data.inputs.has_recent_regression && <span className="text-danger"><i className="bi bi-graph-down-arrow"></i> regression</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveOrchestrationPressureBadges;
