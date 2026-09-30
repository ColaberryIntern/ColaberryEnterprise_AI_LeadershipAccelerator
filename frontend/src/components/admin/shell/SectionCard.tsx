import React from 'react';

interface Props {
  title?: React.ReactNode;
  subtitle?: string;
  icon?: string;             // RemixIcon name without ri- prefix
  actions?: React.ReactNode; // right-aligned header actions
  padded?: boolean;          // body padding (default true)
  className?: string;
  children: React.ReactNode;
}

/**
 * SectionCard — the one content card: optional header (title/subtitle/actions)
 * over a rounded, soft-shadow surface. Replaces ad-hoc
 * `card border-0 shadow-sm` blocks so spacing/shape stay consistent.
 */
export default function SectionCard({ title, subtitle, icon, actions, padded = true, className = '', children }: Props) {
  return (
    <section className={`admin-section-card ${className}`}>
      {(title || actions) && (
        <div className="admin-section-card__head">
          <div>
            {title && (
              <h2 className="admin-section-card__title">
                {icon && <i className={`ri-${icon}`} aria-hidden="true" />}
                {title}
              </h2>
            )}
            {subtitle && <p className="admin-section-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="admin-section-card__actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'admin-section-card__body' : ''}>{children}</div>
    </section>
  );
}
