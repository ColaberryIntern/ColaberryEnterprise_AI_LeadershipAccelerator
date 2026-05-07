/**
 * LiveTelemetryBadgeBar — multi-badge live indicator showing UX, telemetry,
 * behavioral, and accessibility health at a glance.
 *
 * Polls every 30s. Designed for SystemBlueprint / SystemViewV2 / Dashboard
 * headers.
 *
 * Phase 6 §13.
 */
import React from 'react';
import { useTelemetryHealth } from '../../hooks/useTelemetryHealth';
import { useUXDebt } from '../../hooks/useUXDebt';
import { useBehavioralTelemetry } from '../../hooks/useBehavioralTelemetry';
import { useVisualCognition } from '../../hooks/useVisualCognition';

export interface LiveTelemetryBadgeBarProps {
  className?: string;
  pollIntervalMs?: number;
  layout?: 'horizontal' | 'vertical';
}

export const LiveTelemetryBadgeBar: React.FC<LiveTelemetryBadgeBarProps> = ({ className, pollIntervalMs = 30000, layout = 'horizontal' }) => {
  const telemetry = useTelemetryHealth({ pollIntervalMs });
  const ux = useUXDebt();
  const behavioral = useBehavioralTelemetry({ pollIntervalMs });
  const cognition = useVisualCognition();

  const badges: Array<{ label: string; value: number | null; tone: ReturnType<typeof scoreTone>; tooltip: string }> = [
    {
      label: 'Sync',
      value: telemetry.data?.sync_health_score ?? null,
      tone: scoreTone(telemetry.data?.sync_health_score ?? 100),
      tooltip: telemetry.data ? `${telemetry.data.contradiction_count} contradictions` : 'Sync health',
    },
    {
      label: 'UX',
      value: ux.data?.ux_debt.ux_health ?? null,
      tone: scoreTone(ux.data?.ux_debt.ux_health ?? 100),
      tooltip: ux.data ? `${ux.data.open_critique_count} open critiques · ${ux.data.visual_tasks_count} ui_review tasks` : 'UX health',
    },
    {
      label: 'Vision',
      value: cognition.data?.worst_cognition_score ?? null,
      tone: scoreTone(cognition.data?.worst_cognition_score ?? 100),
      tooltip: cognition.data
        ? `worst route: ${cognition.data.worst_route ?? '—'} · ${cognition.data.contradiction_count} visual contradictions`
        : 'Visual cognition (worst route)',
    },
    {
      label: 'Friction',
      value: behavioral.data ? Math.max(0, 100 - behavioral.data.behavioral.project_friction_pressure) : null,
      tone: scoreTone(behavioral.data ? 100 - behavioral.data.behavioral.project_friction_pressure : 100),
      tooltip: behavioral.data
        ? `friction pressure ${behavioral.data.behavioral.project_friction_pressure} · completion ${Math.round(behavioral.data.user_flow.completion_rate * 100)}%`
        : 'Behavioral friction',
    },
  ];

  const wrapperClass = layout === 'vertical' ? 'd-flex flex-column gap-1' : 'd-flex flex-row flex-wrap gap-2';

  return (
    <div className={`${wrapperClass} ${className ?? ''}`} role="group" aria-label="Live telemetry badges">
      {badges.map(b => (
        <span
          key={b.label}
          className={`badge ${b.tone.bgClass} ${b.tone.textClass} border d-inline-flex align-items-center`}
          style={{ fontSize: 11, fontWeight: 500, padding: '4px 8px' }}
          title={b.tooltip}
        >
          <i className={`bi ${b.tone.icon} me-1`} style={{ fontSize: 10 }}></i>
          <span className="me-1">{b.label}</span>
          <strong>{b.value ?? '—'}</strong>
        </span>
      ))}
    </div>
  );
};

function scoreTone(value: number) {
  if (value >= 85) return { bgClass: 'bg-success-subtle', textClass: 'text-success', icon: 'bi-check-circle' };
  if (value >= 60) return { bgClass: 'bg-warning-subtle', textClass: 'text-warning-emphasis', icon: 'bi-exclamation-circle' };
  return { bgClass: 'bg-danger-subtle', textClass: 'text-danger', icon: 'bi-x-octagon' };
}

export default LiveTelemetryBadgeBar;
