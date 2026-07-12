import React from 'react';

const CSS = `
.cb-drawer__scrim { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(15,15,15,0.5); opacity: 0; transition: opacity var(--dur-base) var(--ease-out); }
.cb-drawer__scrim.is-open { opacity: 1; }
.cb-drawer { position: fixed; z-index: var(--z-modal); top: 0; bottom: 0; width: min(380px, 88vw); background: var(--surface-card); box-shadow: var(--shadow-xl); display: flex; flex-direction: column; transition: transform var(--dur-base) var(--ease-out); }
.cb-drawer--right { right: 0; transform: translateX(100%); }
.cb-drawer--left { left: 0; transform: translateX(-100%); }
.cb-drawer.is-open { transform: translateX(0); }
.cb-drawer__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-bottom: 1px solid var(--border-subtle); }
.cb-drawer__title { font-family: var(--font-display); font-weight: var(--fw-bold); font-size: var(--fs-h4); color: var(--text-strong); margin: 0; }
.cb-drawer__close { background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 4px; border-radius: var(--radius-sm); transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
.cb-drawer__close:hover { background: var(--surface-sunken); color: var(--text-strong); }
.cb-drawer__body { padding: 20px 22px; overflow-y: auto; font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-body); line-height: 1.6; flex: 1; }
@media (prefers-reduced-motion: reduce){ .cb-drawer__scrim, .cb-drawer { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-drawer-css')) return;
  const s = document.createElement('style'); s.id = 'cb-drawer-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Slide-in panel anchored to a screen edge. Controlled via `open`; `side` =
 * right|left. Closes on scrim click or Esc.
 */
export function Drawer({ open = false, side = 'right', title, onClose, children, className = '', ...rest }) {
  inject();
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  const panelRef = React.useRef(null);
  const lastFocus = React.useRef(null);
  const titleId = React.useMemo(() => 'cb-drw-' + Math.random().toString(36).slice(2, 8), []);
  React.useEffect(() => {
    let t;
    if (open) { setMounted(true); t = requestAnimationFrame(() => setShown(true)); }
    else { setShown(false); t = setTimeout(() => setMounted(false), 240); }
    return () => { cancelAnimationFrame(t); clearTimeout(t); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lastFocus.current = document.activeElement;
    const f = requestAnimationFrame(() => { if (panelRef.current) panelRef.current.focus(); });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(f);
      if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus();
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return (
    <React.Fragment>
      <div className={'cb-drawer__scrim ' + (shown ? 'is-open' : '')} onMouseDown={() => onClose && onClose()} />
      <aside className={'cb-drawer cb-drawer--' + side + ' ' + (shown ? 'is-open ' : '') + className} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} ref={panelRef} {...rest}>
        <div className="cb-drawer__head">
          {title && <h2 className="cb-drawer__title" id={titleId}>{title}</h2>}
          {onClose && <button className="cb-drawer__close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>}
        </div>
        <div className="cb-drawer__body">{children}</div>
      </aside>
    </React.Fragment>
  );
}
