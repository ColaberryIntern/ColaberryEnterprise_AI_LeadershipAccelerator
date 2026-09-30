import React from 'react';
import { Link } from 'react-router-dom';

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  primary: 'var(--red-500)',
  success: 'var(--status-success)',
  danger: 'var(--status-danger)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
  neutral: 'var(--text-muted)',
};

interface Props {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: string;          // RemixIcon name without ri- prefix
  tone?: Tone;
  hint?: string;          // small caption under the value (e.g. data freshness)
  to?: string;            // optional click-through route
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  // Ticket Board UX fixes (2026-08-17) — lets a StatCard drive in-page filter
  // state (e.g. the ticket board's Total/Open/Critical/Done cards) instead of
  // only ever navigating to a new route. Mutually exclusive with `to` in
  // practice (a card is either a route link or an in-page toggle, never
  // both) — `to` still takes precedence if both are somehow passed, so every
  // existing route-linked StatCard elsewhere in the codebase is unaffected by
  // this addition.
  onClick?: () => void;
  active?: boolean;        // visual "currently filtering by this" state — no-op without onClick
}

/**
 * StatCard — the one KPI card. Replaces the hand-rolled `.admin-kpi-card`
 * blocks (hardcoded hex borderLeft) repeated across the dashboards.
 */
export default function StatCard({ label, value, unit, icon, tone = 'primary', hint, to, delta, onClick, active }: Props) {
  const accent = TONE_COLOR[tone];
  const cardStyle = { '--stat-accent': accent } as React.CSSProperties;
  const cardClassName = `admin-stat-card${active ? ' admin-stat-card--active' : ''}`;
  const body = (
    <div className={cardClassName} style={cardStyle}>
      <div className="admin-stat-card__top">
        <span className="admin-stat-card__label">{label}</span>
        {icon && <i className={`ri-${icon} admin-stat-card__icon`} aria-hidden="true" />}
      </div>
      <div className="admin-stat-card__value">
        {value}
        {unit && <span className="admin-stat-card__unit">{unit}</span>}
      </div>
      <div className="admin-stat-card__foot">
        {delta && (
          <span className={`admin-stat-card__delta admin-stat-card__delta--${delta.direction}`}>
            <i className={`ri-arrow-${delta.direction === 'flat' ? 'right' : delta.direction}-line`} aria-hidden="true" /> {delta.value}
          </span>
        )}
        {hint && <span className="admin-stat-card__hint">{hint}</span>}
      </div>
    </div>
  );

  if (to) return <Link to={to} className="admin-stat-card__link">{body}</Link>;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="admin-stat-card__link admin-stat-card__button" aria-pressed={!!active}>
        {body}
      </button>
    );
  }

  return body;
}
