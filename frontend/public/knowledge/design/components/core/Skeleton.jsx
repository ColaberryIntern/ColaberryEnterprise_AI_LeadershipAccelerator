import React from 'react';

const CSS = `
.cb-skel { display: block; background: var(--surface-sunken); border-radius: var(--radius-sm); position: relative; overflow: hidden; }
.cb-skel--text { height: 0.85em; border-radius: var(--radius-xs); margin: 0.2em 0; }
.cb-skel--circle { border-radius: 50%; }
.cb-skel::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--neutral-0) 60%, transparent), transparent); animation: cb-shimmer 1.4s var(--ease-in-out) infinite; }
[data-theme="dark"] .cb-skel::after { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); }
@keyframes cb-shimmer { 100% { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce){ .cb-skel::after { animation: none; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-skel-css')) return;
  const s = document.createElement('style'); s.id = 'cb-skel-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Loading placeholder with a soft shimmer. `variant` = rect|text|circle.
 * Size with `width`/`height` (numbers → px) or CSS.
 */
export function Skeleton({ variant = 'rect', width, height, radius, className = '', style, ...rest }) {
  inject();
  const dim = (v) => typeof v === 'number' ? v + 'px' : v;
  return (
    <span
      className={'cb-skel cb-skel--' + variant + ' ' + className}
      style={{ width: dim(width), height: dim(height), borderRadius: dim(radius), ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}
