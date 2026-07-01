import React from 'react';

const CSS = `
.cb-bc { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-family: var(--font-body); font-size: var(--fs-body-sm); }
.cb-bc a, .cb-bc span { color: var(--text-muted); text-decoration: none; }
.cb-bc a { transition: color var(--dur-fast) var(--ease-out); }
.cb-bc a:hover { color: var(--red-500); }
.cb-bc__sep { color: var(--border-strong); display: inline-flex; }
.cb-bc__cur { color: var(--text-strong); font-weight: var(--fw-medium); }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-bc-css')) return;
  const s = document.createElement('style'); s.id = 'cb-bc-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Breadcrumb trail. The last item renders as the current page (non-link).
 */
export function Breadcrumb({ items = [], className = '', ...rest }) {
  inject();
  return (
    <nav className={'cb-bc ' + className} aria-label="Breadcrumb" {...rest}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {last
              ? <span className="cb-bc__cur" aria-current="page">{it.label}</span>
              : <a href={it.href || '#'} onClick={it.onClick}>{it.label}</a>}
            {!last && <span className="cb-bc__sep" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
