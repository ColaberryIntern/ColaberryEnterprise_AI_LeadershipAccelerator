import React from 'react';

const CSS = `
.cb-acc { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface-card); }
.cb-acc__item + .cb-acc__item { border-top: 1px solid var(--border-subtle); }
.cb-acc__btn { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; background: none; border: none; cursor: pointer; font-family: var(--font-body); font-weight: var(--fw-bold); font-size: var(--fs-body); color: var(--text-strong); text-align: left; transition: background var(--dur-fast) var(--ease-out); }
.cb-acc__btn:hover { background: var(--surface-sunken); }
.cb-acc__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cb-acc__ic { flex: none; color: var(--red-500); transition: transform var(--dur-base) var(--ease-out); }
.cb-acc__item[data-open="true"] .cb-acc__ic { transform: rotate(180deg); }
.cb-acc__panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-base) var(--ease-out); }
.cb-acc__item[data-open="true"] .cb-acc__panel { grid-template-rows: 1fr; }
.cb-acc__inner { overflow: hidden; }
.cb-acc__body { padding: 0 20px 18px; font-size: var(--fs-body-sm); color: var(--text-muted); line-height: 1.6; }
@media (prefers-reduced-motion: reduce){ .cb-acc__panel, .cb-acc__ic { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-acc-css')) return;
  const s = document.createElement('style'); s.id = 'cb-acc-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Vertically stacked, animated disclosure panels. Single-open by default;
 * pass `allowMultiple` to let several stay open. `defaultOpen` seeds indices.
 */
export function Accordion({ items = [], allowMultiple = false, defaultOpen = [], className = '', ...rest }) {
  inject();
  const [open, setOpen] = React.useState(() => new Set(defaultOpen));
  const toggle = (i) => setOpen(prev => {
    const next = new Set(allowMultiple ? prev : []);
    if (prev.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  return (
    <div className={'cb-acc ' + className} {...rest}>
      {items.map((it, i) => {
        const isOpen = open.has(i);
        const btnId = 'cb-acc-b' + i, panelId = 'cb-acc-p' + i;
        return (
          <div className="cb-acc__item" data-open={isOpen} key={i}>
            <button className="cb-acc__btn" id={btnId} aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(i)}>
              <span>{it.title}</span>
              <svg className="cb-acc__ic" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div className="cb-acc__panel" id={panelId} role="region" aria-labelledby={btnId}><div className="cb-acc__inner"><div className="cb-acc__body">{it.content}</div></div></div>
          </div>
        );
      })}
    </div>
  );
}
