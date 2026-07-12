import React from 'react';

const CSS = `
.cb-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-body); font-weight: var(--fw-medium);
  font-size: var(--fs-caption); line-height: 1;
  padding: 5px 12px; border-radius: var(--radius-pill);
  background: var(--surface-sunken); color: var(--text-body);
  white-space: nowrap;
}
.cb-badge--solid { background: var(--red-500); color: #fff; }
.cb-badge--neutral { background: var(--surface-sunken); color: var(--text-body); }
.cb-badge--red { background: var(--status-danger-bg); color: var(--red-700); }
.cb-badge--green { background: var(--status-success-bg); color: var(--green-700); }
.cb-badge--blue { background: var(--status-info-bg); color: var(--blue-700); }
.cb-badge--warning { background: var(--status-warning-bg); color: var(--amber-500); }
.cb-badge--outline { background: transparent; box-shadow: inset 0 0 0 1px var(--border-default); color: var(--text-body); }
.cb-badge__dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
`;

function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-badge-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-badge-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Small status / category label. Soft tints by default; use `solid` for the
 * cherry-red emphasis pill and `dot` for a status indicator.
 */
export function Badge({ tone = 'neutral', solid = false, outline = false, dot = false, className = '', children, ...rest }) {
  inject();
  const classes = ['cb-badge'];
  if (solid) classes.push('cb-badge--solid');
  else if (outline) classes.push('cb-badge--outline');
  else classes.push('cb-badge--' + tone);
  if (className) classes.push(className);
  return (
    <span className={classes.join(' ')} {...rest}>
      {dot && <span className="cb-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
