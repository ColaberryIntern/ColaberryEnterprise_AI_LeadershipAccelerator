import React from 'react';

const CSS = `
.cb-btn {
  --_bg: var(--action-bg);
  --_fg: var(--action-fg);
  --_bg-hover: var(--action-bg-hover);
  --_bg-press: var(--action-bg-press);
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-body); font-weight: var(--fw-bold);
  font-size: var(--fs-body-sm); line-height: 1.2; min-height: 48px;
  border: none; border-radius: var(--radius-pill); cursor: pointer;
  padding: 0 24px; text-decoration: none; white-space: nowrap;
  background: var(--_bg); color: var(--_fg);
  transition: background var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}
.cb-btn:hover { background: var(--_bg-hover); text-decoration: none; color: var(--_fg); }
.cb-btn:active { background: var(--_bg-press); transform: translateY(1px); }
.cb-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cb-btn[disabled], .cb-btn[aria-disabled="true"] {
  opacity: .45; cursor: not-allowed; pointer-events: none;
}
.cb-btn--sm { font-size: var(--fs-caption); min-height: 38px; padding: 0 16px; gap: 6px; }
.cb-btn--lg { font-size: var(--fs-body); min-height: 56px; padding: 0 32px; }
.cb-btn--green { --_bg: var(--action-green-bg); --_bg-hover: var(--action-green-bg-hover); --_bg-press: var(--green-700); --_fg: #fff; }
.cb-btn--blue { --_bg: var(--blue-500); --_bg-hover: var(--blue-600); --_bg-press: var(--blue-700); --_fg: #fff; }
.cb-btn--primary { box-shadow: var(--shadow-brand); }
.cb-btn--primary:hover { box-shadow: 0 12px 30px color-mix(in srgb, var(--red-500) 34%, transparent); }
.cb-btn--outline {
  background: transparent; color: var(--text-strong);
  box-shadow: inset 0 0 0 var(--border-2) var(--border-strong);
}
.cb-btn--outline:hover { background: var(--surface-sunken); color: var(--text-strong); box-shadow: inset 0 0 0 var(--border-2) var(--text-strong); }
.cb-btn--outline:active { background: var(--surface-sunken); }
.cb-btn--ghost { background: transparent; color: var(--text-strong); }
.cb-btn--ghost:hover { background: var(--surface-sunken); color: var(--text-strong); }
.cb-btn--ghost:active { background: var(--surface-sunken); }
.cb-btn--link { background: transparent; color: var(--text-link); border-radius: var(--radius-xs); padding: 4px 6px; min-height: 0; }
.cb-btn--link:hover { background: transparent; color: var(--text-link-hover); text-decoration: underline; }
.cb-btn--full { width: 100%; }
`;

function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-btn-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-btn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Colaberry primary button. Cherry-red by default; supports green/blue
 * brand tones, outline/ghost/link variants, three sizes, and icons.
 */
export function Button({
  variant = 'primary',
  tone,
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  as,
  className = '',
  children,
  ...rest
}) {
  inject();
  const classes = ['cb-btn'];
  if (variant === 'primary') classes.push('cb-btn--primary');
  if (variant === 'outline') classes.push('cb-btn--outline');
  if (variant === 'ghost') classes.push('cb-btn--ghost');
  if (variant === 'link') classes.push('cb-btn--link');
  // tone overrides fill color for solid buttons
  if ((variant === 'primary' || variant === 'solid') && tone === 'green') classes.push('cb-btn--green');
  if ((variant === 'primary' || variant === 'solid') && tone === 'blue') classes.push('cb-btn--blue');
  if (size === 'sm') classes.push('cb-btn--sm');
  if (size === 'lg') classes.push('cb-btn--lg');
  if (fullWidth) classes.push('cb-btn--full');
  if (className) classes.push(className);

  // Only forward real DOM attributes to the host element (never component-only props).
  const dom = {};
  for (const k in rest) {
    if (k.startsWith('aria-') || k.startsWith('data-') || /^on[A-Z]/.test(k) ||
        ['href','target','rel','type','name','value','id','title','role','tabIndex','disabled','form','autoFocus'].includes(k)) {
      dom[k] = rest[k];
    }
  }
  const Tag = (rest.href || as === 'a') ? 'a' : (as || 'button');
  if (Tag === 'button' && dom.type === undefined) dom.type = 'button';

  return (
    <Tag className={classes.join(' ')} {...dom}>
      {leadingIcon}
      {children && <span>{children}</span>}
      {trailingIcon}
    </Tag>
  );
}
