import React from 'react';

interface Props {
  title?: React.ReactNode;
  subtitle?: string;
  icon?: string;             // RemixIcon name without ri- prefix
  actions?: React.ReactNode; // right-aligned header actions
  padded?: boolean;          // body padding (default true)
  className?: string;
  /** When true, the header becomes a toggle that shows/hides the body (progressive disclosure). */
  collapsible?: boolean;
  /** Initial open state when collapsible (default true). */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * SectionCard — the one content card: optional header (title/subtitle/actions)
 * over a rounded, soft-shadow surface. Replaces ad-hoc
 * `card border-0 shadow-sm` blocks so spacing/shape stay consistent.
 *
 * `collapsible` makes the header a toggle so a long page can show a few sections
 * and let the reader click to expand the rest. The body stays in the DOM (hidden
 * via display:none) when collapsed, so field state is preserved across toggles.
 */
export default function SectionCard({
  title, subtitle, icon, actions, padded = true, className = '', collapsible = false, defaultOpen = true, children,
}: Props) {
  const [open, setOpen] = React.useState(defaultOpen);
  const toggleable = collapsible && !!title; // need a header to hang the toggle on
  const showBody = !toggleable || open;      // never hide a body the reader can't reopen
  const headerInner = (
    <>
      {title && (
        <h2 className="admin-section-card__title">
          {toggleable && <i className={`ri-${open ? 'arrow-down-s-line' : 'arrow-right-s-line'}`} aria-hidden="true" />}
          {icon && <i className={`ri-${icon}`} aria-hidden="true" />}
          {title}
        </h2>
      )}
      {subtitle && <p className="admin-section-card__subtitle">{subtitle}</p>}
    </>
  );
  return (
    <section className={`admin-section-card ${className}`}>
      {(title || actions) && (
        <div className="admin-section-card__head">
          {toggleable ? (
            <button type="button" className="admin-section-card__toggle" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', width: '100%', cursor: 'pointer', color: 'inherit' }}>
              {headerInner}
            </button>
          ) : (
            <div>{headerInner}</div>
          )}
          {actions && <div className="admin-section-card__actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'admin-section-card__body' : ''} style={showBody ? undefined : { display: 'none' }}>{children}</div>
    </section>
  );
}
