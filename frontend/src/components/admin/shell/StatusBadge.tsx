import React from 'react';

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: 'var(--status-success-bg)', fg: 'var(--status-success)' },
  danger: { bg: 'var(--status-danger-bg)', fg: 'var(--status-danger)' },
  warning: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning)' },
  info: { bg: 'var(--status-info-bg)', fg: 'var(--status-info)' },
  primary: { bg: 'var(--red-50)', fg: 'var(--red-600)' },
  neutral: { bg: 'var(--neutral-100)', fg: 'var(--neutral-700)' },
};

// Common status words -> tone, so callers can pass a raw status string.
const WORD_TONE: Record<string, Tone> = {
  success: 'success', active: 'success', enabled: 'success', healthy: 'success', live: 'success', passed: 'success', verified: 'success', ok: 'success',
  failure: 'danger', failed: 'danger', error: 'danger', critical: 'danger', blocked: 'danger', disabled: 'danger',
  warning: 'warning', paused: 'warning', stale: 'warning', pending: 'warning', degraded: 'warning',
  info: 'info', running: 'info', queued: 'info', draft: 'neutral', unknown: 'neutral',
};

interface Props {
  label: string;
  tone?: Tone;
  icon?: string; // RemixIcon name without ri- prefix
}

/** StatusBadge — one semantic status pill replacing scattered hardcoded badge colors. */
export default function StatusBadge({ label, tone, icon }: Props) {
  const t = tone || WORD_TONE[label.toLowerCase()] || 'neutral';
  const c = TONE[t];
  return (
    <span className="admin-status-badge" style={{ background: c.bg, color: c.fg }}>
      {icon && <i className={`ri-${icon}`} aria-hidden="true" />}
      {label}
    </span>
  );
}
