import React from 'react';

const CSS = `
.cb-card {
  display: flex; flex-direction: column;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.cb-card--pad { padding: var(--space-6); }
.cb-card--hoverable { cursor: pointer; }
.cb-card--hoverable:hover { box-shadow: var(--shadow-lg); transform: translateY(-3px); }
.cb-card--flat { box-shadow: none; }
.cb-card--elevated { box-shadow: var(--shadow-md); border-color: transparent; }
.cb-card--accent { border-top: 4px solid var(--red-500); }
.cb-card--accent-green { border-top: 4px solid var(--green-500); }
.cb-card--accent-blue { border-top: 4px solid var(--blue-500); }
.cb-card__media { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--surface-sunken); }
.cb-card__body { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
`;

function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-card-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-card-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Surface container with rounded corners and a soft shadow. Optional media
 * header, body padding, hover lift, and a colored accent top-border.
 */
export function Card({
  elevation = 'sm',
  accent,
  hoverable = false,
  padded = false,
  media,
  className = '',
  children,
  ...rest
}) {
  inject();
  const classes = ['cb-card'];
  if (elevation === 'flat') classes.push('cb-card--flat');
  if (elevation === 'md') classes.push('cb-card--elevated');
  if (hoverable) classes.push('cb-card--hoverable');
  if (padded && !media) classes.push('cb-card--pad');
  if (accent === 'red') classes.push('cb-card--accent');
  if (accent === 'green') classes.push('cb-card--accent-green');
  if (accent === 'blue') classes.push('cb-card--accent-blue');
  if (className) classes.push(className);
  return (
    <div className={classes.join(' ')} {...rest}>
      {media && (typeof media === 'string'
        ? <img className="cb-card__media" src={media} alt="" />
        : <div className="cb-card__media">{media}</div>)}
      {media ? <div className="cb-card__body">{children}</div> : children}
    </div>
  );
}
