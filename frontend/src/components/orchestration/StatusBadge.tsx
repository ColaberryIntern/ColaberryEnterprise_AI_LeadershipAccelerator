import React from 'react';

type StatusType = 'healthy' | 'degraded' | 'critical' | 'active' | 'inactive' | 'pending' | 'running' | 'idle' | 'error';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md';
  glow?: boolean;
  pulse?: boolean;
}

const statusConfig: Record<StatusType, { color: string; defaultLabel: string; glowVar?: string }> = {
  healthy:  { color: 'var(--orch-accent-green)',  defaultLabel: 'Healthy',  glowVar: 'var(--orch-glow-green)' },
  degraded: { color: 'var(--orch-accent-yellow)', defaultLabel: 'Degraded' },
  critical: { color: 'var(--orch-accent-red)',    defaultLabel: 'Critical', glowVar: 'var(--orch-glow-red)' },
  active:   { color: 'var(--orch-accent-blue)',   defaultLabel: 'Active',   glowVar: 'var(--orch-glow-blue)' },
  inactive: { color: 'var(--orch-text-dim)',      defaultLabel: 'Inactive' },
  pending:  { color: 'var(--orch-accent-yellow)', defaultLabel: 'Pending' },
  running:  { color: 'var(--orch-accent-blue)',   defaultLabel: 'Running',  glowVar: 'var(--orch-glow-blue)' },
  idle:     { color: 'var(--orch-text-dim)',      defaultLabel: 'Idle' },
  error:    { color: 'var(--orch-accent-red)',    defaultLabel: 'Error',    glowVar: 'var(--orch-glow-red)' },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'sm',
  glow = false,
  pulse = false,
}) => {
  const config = statusConfig[status];
  const dotSize = size === 'sm' ? 6 : 8;
  const fontSize = size === 'sm' ? 11 : 12;
  const shouldPulse = pulse || status === 'running';
  const shouldGlow = glow || status === 'critical' || status === 'error';

  return (
    <span
      className="orch-badge"
      style={{
        fontSize,
        boxShadow: shouldGlow && config.glowVar ? config.glowVar : undefined,
      }}
    >
      <span
        className={shouldPulse ? 'orch-dot-pulse' : ''}
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: config.color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {label || config.defaultLabel}
    </span>
  );
};

export default StatusBadge;
