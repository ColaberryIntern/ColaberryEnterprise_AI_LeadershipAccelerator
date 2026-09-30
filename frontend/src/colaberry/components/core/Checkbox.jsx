import React from 'react';

const CSS = `
.cb-check { display: inline-flex; align-items: flex-start; gap: 10px; font-family: var(--font-body); cursor: pointer; color: var(--text-body); font-size: var(--fs-body-sm); }
.cb-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.cb-check__box {
  width: 22px; height: 22px; flex: none; border-radius: var(--radius-sm);
  border: var(--border-2) solid var(--border-strong); background: var(--surface-card);
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  margin-top: 1px;
}
.cb-check__box svg { width: 14px; height: 14px; opacity: 0; transform: scale(.6); transition: all var(--dur-fast) var(--ease-spring); }
.cb-check input:checked + .cb-check__box { background: var(--green-500); border-color: var(--green-500); }
.cb-check input:checked + .cb-check__box svg { opacity: 1; transform: scale(1); }
.cb-check input:focus-visible + .cb-check__box { box-shadow: var(--focus-ring); }
.cb-check:hover .cb-check__box { border-color: var(--green-500); }
.cb-check input:disabled + .cb-check__box { opacity: .45; }
.cb-check--disabled { cursor: not-allowed; color: var(--text-subtle); }
`;

function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-check-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-check-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Checkbox with a leaf-green checked state and a soft spring-in tick.
 */
export function Checkbox({ label, disabled = false, className = '', children, ...rest }) {
  inject();
  const classes = ['cb-check'];
  if (disabled) classes.push('cb-check--disabled');
  if (className) classes.push(className);
  return (
    <label className={classes.join(' ')}>
      <input type="checkbox" disabled={disabled} {...rest} />
      <span className="cb-check__box" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 4.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
      {(label || children) && <span>{label || children}</span>}
    </label>
  );
}
