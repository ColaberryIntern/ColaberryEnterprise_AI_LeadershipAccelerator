import React from 'react';

const CSS = `
.cb-switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; font-family: var(--font-body); font-size: var(--fs-body-sm); color: var(--text-body); }
.cb-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.cb-switch__track { width: 44px; height: 26px; border-radius: var(--radius-pill); background: var(--neutral-300); position: relative; flex: none; transition: background var(--dur-base) var(--ease-out); }
.cb-switch__knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-sm); transition: transform var(--dur-base) var(--ease-spring); }
.cb-switch input:checked + .cb-switch__track { background: var(--green-600); }
.cb-switch input:checked + .cb-switch__track .cb-switch__knob { transform: translateX(18px); }
.cb-switch input:focus-visible + .cb-switch__track { box-shadow: var(--focus-ring); }
.cb-switch:hover .cb-switch__track { filter: brightness(0.97); }
.cb-switch--disabled { opacity: .45; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce){ .cb-switch__track, .cb-switch__knob { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-switch-css')) return;
  const s = document.createElement('style'); s.id = 'cb-switch-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * On/off toggle switch with a soft spring knob (leaf-green when on).
 */
export function Switch({ label, disabled = false, className = '', children, ...rest }) {
  inject();
  return (
    <label className={'cb-switch ' + (disabled ? 'cb-switch--disabled ' : '') + className}>
      <input type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="cb-switch__track"><span className="cb-switch__knob" /></span>
      {(label || children) && <span>{label || children}</span>}
    </label>
  );
}
