import React from 'react';

const CSS = `
.cb-toast { display: flex; align-items: flex-start; gap: 12px; width: min(380px, calc(100vw - 32px)); background: var(--surface-card); border: 1px solid var(--border-subtle); border-left: 4px solid var(--neutral-400); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 14px 16px; font-family: var(--font-body); }
.cb-toast--fixed { position: fixed; left: 50%; bottom: 24px; z-index: var(--z-toast); transform: translateX(-50%) translateY(16px); opacity: 0; transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring); pointer-events: none; }
.cb-toast--fixed.is-open { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
.cb-toast--success { border-left-color: var(--green-600); } .cb-toast--success .cb-toast__ic { color: var(--green-600); }
.cb-toast--danger { border-left-color: var(--red-500); } .cb-toast--danger .cb-toast__ic { color: var(--red-500); }
.cb-toast--info { border-left-color: var(--blue-500); } .cb-toast--info .cb-toast__ic { color: var(--blue-500); }
.cb-toast__ic { flex: none; margin-top: 1px; color: var(--text-muted); }
.cb-toast__body { flex: 1; min-width: 0; }
.cb-toast__title { font-weight: var(--fw-bold); font-size: var(--fs-body-sm); color: var(--text-strong); }
.cb-toast__msg { font-size: var(--fs-caption); color: var(--text-muted); margin-top: 2px; line-height: 1.45; }
.cb-toast__close { flex: none; background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 2px; border-radius: var(--radius-xs); transition: color var(--dur-fast) var(--ease-out); }
.cb-toast__close:hover { color: var(--text-strong); }
@media (prefers-reduced-motion: reduce){ .cb-toast--fixed { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-toast-css')) return;
  const s = document.createElement('style'); s.id = 'cb-toast-css'; s.textContent = CSS; document.head.appendChild(s);
}

const ICONS = {
  success: 'M20 6L9 17l-5-5', danger: 'M12 8v5M12 16.5v.5M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-5M12 8v.5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', neutral: 'M12 16v-5M12 8v.5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'
};

/**
 * Notification toast. `variant` = neutral|success|danger|info. Renders
 * fixed-bottom-center by default; pass `static` to place it in normal flow.
 */
export function Toast({ open = true, variant = 'neutral', title, children, onClose, static: inFlow = false, className = '', ...rest }) {
  inject();
  const cls = ['cb-toast', 'cb-toast--' + variant];
  if (!inFlow) { cls.push('cb-toast--fixed'); if (open) cls.push('is-open'); }
  if (className) cls.push(className);
  if (inFlow && !open) return null;
  return (
    <div className={cls.join(' ')} role="status" {...rest}>
      <svg className="cb-toast__ic" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d={ICONS[variant]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <div className="cb-toast__body">
        {title && <div className="cb-toast__title">{title}</div>}
        {children && <div className="cb-toast__msg">{children}</div>}
      </div>
      {onClose && <button className="cb-toast__close" onClick={onClose} aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      </button>}
    </div>
  );
}
