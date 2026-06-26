import React from 'react';

const CSS = `
.cb-pop { position: relative; display: inline-flex; }
.cb-pop__panel { position: absolute; z-index: var(--z-overlay); min-width: 200px; background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 14px 16px; font-family: var(--font-body); font-size: var(--fs-body-sm); color: var(--text-body); opacity: 0; transform: translateY(6px) scale(.98); transform-origin: top center; transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); pointer-events: none; }
.cb-pop__panel[data-p="top"] { bottom: calc(100% + 8px); left: 0; transform-origin: bottom center; }
.cb-pop__panel[data-p="bottom"] { top: calc(100% + 8px); left: 0; }
.cb-pop__panel[data-p="right"] { top: 0; left: calc(100% + 8px); }
.cb-pop.is-open .cb-pop__panel { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
@media (prefers-reduced-motion: reduce){ .cb-pop__panel { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-pop-css')) return;
  const s = document.createElement('style'); s.id = 'cb-pop-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Click-triggered floating panel that closes on outside-click or Esc.
 * `trigger` is the clickable node; children are the panel content.
 */
export function Popover({ trigger, placement = 'bottom', children, className = '', ...rest }) {
  inject();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span className={'cb-pop ' + (open ? 'is-open ' : '') + className} ref={ref} {...rest}>
      <span onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex' }}>{trigger}</span>
      <span className="cb-pop__panel" data-p={placement} role="dialog">{children}</span>
    </span>
  );
}
