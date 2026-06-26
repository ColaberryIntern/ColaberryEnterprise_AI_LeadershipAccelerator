import React from 'react';

const CSS = `
.cb-dialog__scrim { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(15,15,15,0.5); display: grid; place-items: center; padding: 24px; opacity: 0; transition: opacity var(--dur-base) var(--ease-out); }
.cb-dialog__scrim.is-open { opacity: 1; }
.cb-dialog { width: min(520px, 100%); max-height: 90vh; overflow-y: auto; background: var(--surface-card); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); transform: translateY(10px) scale(.97); transition: transform var(--dur-base) var(--ease-spring); }
.cb-dialog__scrim.is-open .cb-dialog { transform: translateY(0) scale(1); }
.cb-dialog__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 24px 0; }
.cb-dialog__title { font-family: var(--font-display); font-weight: var(--fw-bold); font-size: var(--fs-h4); color: var(--text-strong); margin: 0; }
.cb-dialog__close { flex: none; background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 4px; border-radius: var(--radius-sm); transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
.cb-dialog__close:hover { background: var(--surface-sunken); color: var(--text-strong); }
.cb-dialog__body { padding: 12px 24px 8px; font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-body); line-height: 1.6; }
.cb-dialog__foot { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px 24px; }
@media (prefers-reduced-motion: reduce){ .cb-dialog__scrim, .cb-dialog { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-dialog-css')) return;
  const s = document.createElement('style'); s.id = 'cb-dialog-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Centered modal dialog with scrim. Controlled via `open`; closes on scrim
 * click or Esc. Provide `footer` for action buttons.
 */
export function Dialog({ open = false, title, onClose, footer, children, className = '', ...rest }) {
  inject();
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  const panelRef = React.useRef(null);
  const lastFocus = React.useRef(null);
  const titleId = React.useMemo(() => 'cb-dlg-' + Math.random().toString(36).slice(2, 8), []);
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
    // body scroll lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus management: remember, move focus in, restore on close
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
    <div className={'cb-dialog__scrim ' + (shown ? 'is-open' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={'cb-dialog ' + className} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} ref={panelRef} {...rest}>
        {(title || onClose) && (
          <div className="cb-dialog__head">
            {title && <h2 className="cb-dialog__title" id={titleId}>{title}</h2>}
            {onClose && <button className="cb-dialog__close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>}
          </div>
        )}
        <div className="cb-dialog__body">{children}</div>
        {footer && <div className="cb-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}
