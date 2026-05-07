/**
 * TelemetryHealthBadge — compact pill summarizing telemetry + UX health.
 *
 * Reads from useTelemetryHealth + useUXDebt and renders a single small badge
 * with a tooltip-style breakdown on hover/click. Designed to slot next to
 * existing dashboard headers without taking real estate.
 *
 * Phase 5 §15.
 */
import React, { useState } from 'react';
import { useTelemetryHealth } from '../../hooks/useTelemetryHealth';
import { useUXDebt } from '../../hooks/useUXDebt';

export const TelemetryHealthBadge: React.FC<{ className?: string }> = ({ className }) => {
  const telemetry = useTelemetryHealth();
  const ux = useUXDebt();
  const [open, setOpen] = useState(false);

  const score = telemetry.data?.sync_health_score ?? null;
  const uxScore = ux.data?.ux_debt.ux_health ?? null;

  const label =
    telemetry.loading || ux.loading
      ? 'Loading…'
      : score === null
        ? 'No telemetry data'
        : `Sync ${score} · UX ${uxScore ?? '—'}`;

  const tone = scoreTone(Math.min(score ?? 100, uxScore ?? 100));

  return (
    <div className={`position-relative d-inline-block ${className ?? ''}`}>
      <button
        type="button"
        className={`btn btn-sm ${tone.btnClass}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Telemetry and UX health"
        style={{ fontSize: 12 }}
      >
        <i className={`bi ${tone.icon} me-1`}></i>
        {label}
      </button>

      {open && (
        <div
          className="card border-0 shadow position-absolute end-0 mt-2"
          style={{ minWidth: 320, zIndex: 1050 }}
          role="dialog"
          aria-label="Telemetry health detail"
        >
          <div className="card-body small">
            <div className="fw-semibold mb-2">Sync health</div>
            {telemetry.data ? (
              <DimensionGrid dimensions={telemetry.data.telemetry_dimensions as unknown as Record<string, number>} />
            ) : (
              <div className="text-muted">No telemetry data yet.</div>
            )}

            <div className="fw-semibold mt-3 mb-2">UX debt</div>
            {ux.data ? (
              <UXDebtGrid debt={ux.data.ux_debt as unknown as Record<string, number>} openCount={ux.data.open_critique_count} resolvedCount={ux.data.resolved_critique_count} />
            ) : (
              <div className="text-muted">No critiques yet.</div>
            )}

            {telemetry.data && telemetry.data.contradiction_count > 0 && (
              <div className="alert alert-warning small mt-3 mb-0">
                <i className="bi bi-exclamation-triangle me-1"></i>
                {telemetry.data.contradiction_count} contradiction{telemetry.data.contradiction_count === 1 ? '' : 's'} detected.
              </div>
            )}

            <div className="text-muted small mt-2">
              Generated {telemetry.data ? new Date(telemetry.data.generated_at).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DimensionGrid: React.FC<{ dimensions: Record<string, number> }> = ({ dimensions }) => (
  <div className="d-flex flex-wrap gap-1">
    {Object.entries(dimensions).map(([key, v]) => (
      <DimensionPill key={key} label={key.replace(/_/g, ' ')} value={v} />
    ))}
  </div>
);

const UXDebtGrid: React.FC<{ debt: Record<string, number>; openCount: number; resolvedCount: number }> = ({ debt, openCount, resolvedCount }) => {
  const dims = (Object.keys(debt) as Array<keyof typeof debt>).filter(k => k !== 'total_debt' && k !== 'ux_health');
  return (
    <>
      <div className="text-muted mb-1">{openCount} open · {resolvedCount} resolved · total debt {debt.total_debt}/100</div>
      <div className="d-flex flex-wrap gap-1">
        {dims.map(k => <DimensionPill key={k} label={String(k).replace(/_/g, ' ').replace(/ debt$/, '')} value={100 - (debt[k] as number)} />)}
      </div>
    </>
  );
};

const DimensionPill: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const tone = scoreTone(value);
  return (
    <span
      className={`badge ${tone.bgClass} ${tone.textClass} border`}
      style={{ fontWeight: 400, fontSize: 11 }}
      title={`${label}: ${value}/100`}
    >
      {label} <span className="fw-semibold ms-1">{value}</span>
    </span>
  );
};

function scoreTone(value: number) {
  if (value >= 85) return { btnClass: 'btn-outline-success', bgClass: 'bg-success-subtle', textClass: 'text-success', icon: 'bi-check-circle' };
  if (value >= 60) return { btnClass: 'btn-outline-warning', bgClass: 'bg-warning-subtle', textClass: 'text-warning-emphasis', icon: 'bi-exclamation-circle' };
  return { btnClass: 'btn-outline-danger', bgClass: 'bg-danger-subtle', textClass: 'text-danger', icon: 'bi-x-octagon' };
}

export default TelemetryHealthBadge;
