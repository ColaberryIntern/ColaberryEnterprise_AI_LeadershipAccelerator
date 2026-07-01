import React from 'react';
import { Link } from 'react-router-dom';
import TrustBadge from './TrustBadge';
import { TrustSignal } from './trust';

interface Crumb { label: string; to?: string; }

interface Props {
  title: string;
  subtitle?: string;
  icon?: string;            // RemixIcon name without ri- prefix
  breadcrumb?: Crumb[];
  trust?: TrustSignal;      // the per-page trust signal -> renders <TrustBadge>
  actions?: React.ReactNode; // right-aligned action buttons
  children?: React.ReactNode; // optional KPI row / filters rendered under the header
}

/**
 * PageHeader — the one consistent page chrome for every admin page.
 * Replaces the hand-rolled <h1 style={{color:var(--color-primary)}}> + action
 * row repeated across ~42 pages, and carries the required TrustBadge slot.
 */
export default function PageHeader({ title, subtitle, icon, breadcrumb, trust, actions, children }: Props) {
  return (
    <header className="admin-page-header">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="breadcrumb" className="mb-2">
          <ol className="breadcrumb mb-0 small">
            {breadcrumb.map((c, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <li key={i} className={`breadcrumb-item${isLast ? ' active' : ''}`} aria-current={isLast ? 'page' : undefined}>
                  {isLast || !c.to ? c.label : <Link to={c.to}>{c.label}</Link>}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="admin-page-header__row">
        <div className="admin-page-header__title-wrap">
          <h1 className="admin-page-header__title">
            {icon && <i className={`ri-${icon}`} aria-hidden="true" />}
            {title}
          </h1>
          {subtitle && <p className="admin-page-header__subtitle">{subtitle}</p>}
        </div>

        <div className="admin-page-header__aside">
          {trust && <TrustBadge signal={trust} />}
          {actions && <div className="admin-page-header__actions">{actions}</div>}
        </div>
      </div>

      {children && <div className="admin-page-header__extra">{children}</div>}
    </header>
  );
}
