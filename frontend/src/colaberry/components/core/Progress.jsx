import React from 'react';

const CSS = `
.cb-prog { width: 100%; }
.cb-prog__track { height: 10px; background: var(--surface-sunken); border-radius: var(--radius-pill); overflow: hidden; }
.cb-prog__bar { height: 100%; border-radius: var(--radius-pill); background: var(--red-500); width: 0; transition: width var(--dur-slow) var(--ease-out); }
.cb-prog__bar.green { background: var(--green-600); } .cb-prog__bar.blue { background: var(--blue-500); }
.cb-prog__bar.indet { width: 40% !important; animation: cb-indet 1.3s var(--ease-in-out) infinite; }
.cb-prog__head { display: flex; justify-content: space-between; margin-bottom: 8px; font-family: var(--font-body); font-size: var(--fs-caption); }
.cb-prog__label { color: var(--text-strong); font-weight: var(--fw-medium); }
.cb-prog__val { color: var(--text-muted); font-family: var(--font-mono); }
@keyframes cb-indet { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
@media (prefers-reduced-motion: reduce){ .cb-prog__bar { transition-duration: .001ms; } .cb-prog__bar.indet { animation: none; width: 100% !important; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-prog-css')) return;
  const s = document.createElement('style'); s.id = 'cb-prog-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Progress bar with an animated fill. Pass `value`/`max` for determinate, or
 * `indeterminate` for an in-flight loop. `tone` = red|green|blue.
 */
export function Progress({ value = 0, max = 100, tone = 'red', indeterminate = false, label, showValue = false, className = '', ...rest }) {
  inject();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={'cb-prog ' + className} {...rest}>
      {(label || showValue) && (
        <div className="cb-prog__head">
          {label && <span className="cb-prog__label">{label}</span>}
          {showValue && !indeterminate && <span className="cb-prog__val">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="cb-prog__track" role="progressbar" aria-valuenow={indeterminate ? undefined : Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={'cb-prog__bar ' + (tone !== 'red' ? tone : '') + (indeterminate ? ' indet' : '')} style={indeterminate ? undefined : { width: pct + '%' }} />
      </div>
    </div>
  );
}
