import React from 'react';

const CSS = `
.cb-pag { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-body); }
.cb-pag button { min-width: 38px; height: 38px; padding: 0 10px; border: 1px solid var(--border-default); background: var(--surface-card); color: var(--text-body); border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); display: inline-flex; align-items: center; justify-content: center; transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
.cb-pag button:hover:not(:disabled):not(.is-current) { background: var(--surface-sunken); border-color: var(--border-strong); }
.cb-pag button:active:not(:disabled) { transform: translateY(1px); }
.cb-pag button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cb-pag button.is-current { background: var(--red-500); border-color: var(--red-500); color: #fff; }
.cb-pag button:disabled { opacity: .4; cursor: not-allowed; }
.cb-pag__ellipsis { min-width: 24px; text-align: center; color: var(--text-subtle); }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-pag-css')) return;
  const s = document.createElement('style'); s.id = 'cb-pag-css'; s.textContent = CSS; document.head.appendChild(s);
}

function range(start, end) { const a = []; for (let i = start; i <= end; i++) a.push(i); return a; }

/**
 * Page navigation with prev/next and truncated number pills (current = cherry).
 */
export function Pagination({ page = 1, total = 1, siblings = 1, onChange = () => {}, className = '', ...rest }) {
  inject();
  const pages = [];
  const left = Math.max(2, page - siblings);
  const right = Math.min(total - 1, page + siblings);
  pages.push(1);
  if (left > 2) pages.push('…l');
  pages.push(...range(left, right));
  if (right < total - 1) pages.push('…r');
  if (total > 1) pages.push(total);
  const go = (p) => p >= 1 && p <= total && p !== page && onChange(p);
  const Arrow = ({ d }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  return (
    <nav className={'cb-pag ' + className} aria-label="Pagination" {...rest}>
      <button onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous"><Arrow d="M15 6l-6 6 6 6" /></button>
      {pages.map((p, i) => typeof p === 'string'
        ? <span className="cb-pag__ellipsis" key={p + i}>…</span>
        : <button key={p} className={p === page ? 'is-current' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => go(p)}>{p}</button>)}
      <button onClick={() => go(page + 1)} disabled={page >= total} aria-label="Next"><Arrow d="M9 6l6 6-6 6" /></button>
    </nav>
  );
}
