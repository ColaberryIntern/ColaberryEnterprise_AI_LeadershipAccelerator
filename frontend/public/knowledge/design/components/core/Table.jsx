import React from 'react';

const CSS = `
.cb-table-wrap { width: 100%; overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
.cb-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--fs-body-sm); }
.cb-table thead th { text-align: left; padding: 13px 16px; background: var(--surface-subtle); color: var(--text-muted); font-size: var(--fs-caption); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: var(--ls-wide); white-space: nowrap; border-bottom: 1px solid var(--border-subtle); }
.cb-table tbody td { padding: 13px 16px; color: var(--text-body); border-bottom: 1px solid var(--border-subtle); }
.cb-table tbody tr:last-child td { border-bottom: none; }
.cb-table tbody tr { transition: background var(--dur-fast) var(--ease-out); }
.cb-table--hover tbody tr:hover { background: var(--surface-sunken); }
.cb-table--striped tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-sunken) 55%, transparent); }
.cb-table td.num, .cb-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-table-css')) return;
  const s = document.createElement('style'); s.id = 'cb-table-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Data table. `columns` = [{ key, header, align, render }]; `data` = row objects.
 * `hover` highlights rows; `striped` zebra-stripes them.
 */
export function Table({ columns = [], data = [], hover = true, striped = false, className = '', ...rest }) {
  inject();
  const cls = ['cb-table'];
  if (hover) cls.push('cb-table--hover');
  if (striped) cls.push('cb-table--striped');
  if (className) cls.push(className);
  return (
    <div className="cb-table-wrap">
      <table className={cls.join(' ')} {...rest}>
        <thead><tr>{columns.map((c, i) => <th key={i} className={c.align === 'right' ? 'num' : ''}>{c.header}</th>)}</tr></thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri}>
              {columns.map((c, ci) => (
                <td key={ci} className={c.align === 'right' ? 'num' : ''}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
