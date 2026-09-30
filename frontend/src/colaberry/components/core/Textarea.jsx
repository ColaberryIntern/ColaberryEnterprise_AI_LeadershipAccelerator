import React from 'react';

const CSS = `
.cb-ta-field { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-body); }
.cb-ta-field__label { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.cb-ta-field__req { color: var(--red-500); margin-left: 2px; }
.cb-ta { font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-strong); background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px 14px; width: 100%; resize: vertical; min-height: 96px; line-height: 1.5; transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out); }
.cb-ta::placeholder { color: var(--text-subtle); }
.cb-ta:hover { border-color: var(--border-strong); }
.cb-ta:focus { outline: none; border-color: var(--blue-500); box-shadow: var(--focus-ring); }
.cb-ta:disabled { background: var(--surface-sunken); color: var(--text-subtle); cursor: not-allowed; }
.cb-ta-field--error .cb-ta { border-color: var(--red-500); }
.cb-ta-field__foot { display: flex; justify-content: space-between; font-size: var(--fs-caption); color: var(--text-muted); }
.cb-ta-field--error .cb-ta-field__msg { color: var(--red-600); }
.cb-ta-field__count { font-family: var(--font-mono); margin-left: auto; }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-ta-css')) return;
  const s = document.createElement('style'); s.id = 'cb-ta-css'; s.textContent = CSS; document.head.appendChild(s);
}

let _taid = 0;

/**
 * Multi-line text field with optional label, error/helper text, and a live
 * character counter when `maxLength` is set.
 */
export function Textarea({ label, required = false, error, helperText, maxLength, id, value, defaultValue, onChange, className = '', ...rest }) {
  inject();
  const fid = id || ('cb-ta-' + (++_taid));
  const [len, setLen] = React.useState((value ?? defaultValue ?? '').length);
  const msg = error || helperText;
  const msgId = msg ? fid + '-msg' : undefined;
  return (
    <div className={'cb-ta-field' + (error ? ' cb-ta-field--error' : '')}>
      {label && <label className="cb-ta-field__label" htmlFor={fid}>{label}{required && <span className="cb-ta-field__req">*</span>}</label>}
      <textarea
        id={fid} className={'cb-ta ' + className} maxLength={maxLength} value={value} defaultValue={defaultValue}
        aria-invalid={!!error} aria-describedby={msgId}
        onChange={(e) => { setLen(e.target.value.length); onChange && onChange(e); }}
        {...rest}
      />
      {(msg || maxLength) && (
        <div className="cb-ta-field__foot">
          {msg && <span className="cb-ta-field__msg" id={msgId}>{msg}</span>}
          {maxLength && <span className="cb-ta-field__count">{len}/{maxLength}</span>}
        </div>
      )}
    </div>
  );
}
