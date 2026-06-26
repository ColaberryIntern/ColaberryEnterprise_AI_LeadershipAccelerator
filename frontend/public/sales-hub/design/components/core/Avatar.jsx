import React from 'react';

const CSS = `
.cb-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex: none;
  font-family: var(--font-body); font-weight: var(--fw-bold); color: #fff;
  background: var(--green-500); user-select: none;
}
.cb-avatar { position: relative; }
.cb-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: inherit; }
.cb-avatar__txt { line-height: 1; white-space: nowrap; }
.cb-avatar--xs { width: 28px; height: 28px; font-size: 11px; }
.cb-avatar--sm { width: 36px; height: 36px; font-size: 13px; }
.cb-avatar--md { width: 48px; height: 48px; font-size: 16px; }
.cb-avatar--lg { width: 64px; height: 64px; font-size: 22px; }
.cb-avatar--xl { width: 88px; height: 88px; font-size: 30px; }
.cb-avatar--ring { box-shadow: 0 0 0 3px var(--surface-card), 0 0 0 5px var(--red-500); }
.cb-avatar-group { display: inline-flex; }
.cb-avatar-group > .cb-avatar { box-shadow: 0 0 0 3px var(--surface-card); }
.cb-avatar-group > .cb-avatar + .cb-avatar { margin-left: -12px; }
`;

const TONES = ['var(--green-500)', 'var(--blue-500)', 'var(--red-500)', 'var(--green-600)', 'var(--blue-600)'];

function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-avatar-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-avatar-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

/**
 * Circular avatar. Shows a photo when `src` is given, with the person's
 * initials underneath as a graceful fallback (used while the image loads or
 * if it fails). Initials get a stable brand-tone background from the name.
 */
export function Avatar({ src, name = '', size = 'md', ring = false, className = '', style, ...rest }) {
  inject();
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  const classes = ['cb-avatar', 'cb-avatar--' + size];
  if (ring) classes.push('cb-avatar--ring');
  if (className) classes.push(className);
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = TONES[hash % TONES.length];
  const showImg = src && !failed;
  return (
    <span className={classes.join(' ')} style={{ background: bg, ...style }} role="img" aria-label={name || undefined} {...rest}>
      <span className="cb-avatar__txt" aria-hidden="true">{initials(name)}</span>
      {showImg && <img src={src} alt="" onError={() => setFailed(true)} />}
    </span>
  );
}
