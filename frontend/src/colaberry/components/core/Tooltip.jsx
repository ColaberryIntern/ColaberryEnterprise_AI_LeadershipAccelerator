import React from 'react';

const CSS = `
.cb-tip { position: relative; display: inline-flex; }
.cb-tip__pop { position: absolute; z-index: var(--z-overlay); pointer-events: none; background: var(--neutral-900); color: #fff; font-family: var(--font-body); font-size: var(--fs-caption); font-weight: var(--fw-medium); line-height: 1.3; padding: 7px 11px; border-radius: var(--radius-sm); white-space: nowrap; box-shadow: var(--shadow-md); opacity: 0; transform: translateY(4px); transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.cb-tip:hover .cb-tip__pop, .cb-tip:focus-within .cb-tip__pop { opacity: 1; transform: translateY(0); }
.cb-tip__pop::after { content: ''; position: absolute; width: 8px; height: 8px; background: var(--neutral-900); transform: rotate(45deg); }
.cb-tip__pop[data-p="top"] { bottom: calc(100% + 8px); left: 50%; translate: -50% 0; }
.cb-tip__pop[data-p="top"]::after { bottom: -4px; left: 50%; margin-left: -4px; }
.cb-tip__pop[data-p="bottom"] { top: calc(100% + 8px); left: 50%; translate: -50% 0; }
.cb-tip__pop[data-p="bottom"]::after { top: -4px; left: 50%; margin-left: -4px; }
.cb-tip__pop[data-p="left"] { right: calc(100% + 8px); top: 50%; translate: 0 -50%; }
.cb-tip__pop[data-p="left"]::after { right: -4px; top: 50%; margin-top: -4px; }
.cb-tip__pop[data-p="right"] { left: calc(100% + 8px); top: 50%; translate: 0 -50%; }
.cb-tip__pop[data-p="right"]::after { left: -4px; top: 50%; margin-top: -4px; }
@media (prefers-reduced-motion: reduce){ .cb-tip__pop { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-tip-css')) return;
  const s = document.createElement('style'); s.id = 'cb-tip-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Hover/focus tooltip. Wraps a single trigger; `placement` = top|bottom|left|right.
 */
export function Tooltip({ label, placement = 'top', children, className = '', ...rest }) {
  inject();
  return (
    <span className={'cb-tip ' + className} tabIndex={0} {...rest}>
      {children}
      <span className="cb-tip__pop" data-p={placement} role="tooltip">{label}</span>
    </span>
  );
}
