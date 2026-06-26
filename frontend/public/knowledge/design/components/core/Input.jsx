import React from 'react';

const CSS = `
.cb-field { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-body); }
.cb-field__label { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.cb-field__req { color: var(--red-500); margin-left: 2px; }
.cb-input {
  font-family: var(--font-body); font-size: var(--fs-body); color: var(--text-strong);
  background: var(--surface-card);
  border: var(--border-1) solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px; width: 100%;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.cb-input::placeholder { color: var(--text-subtle); }
.cb-input:hover { border-color: var(--border-strong); }
.cb-input:focus { outline: none; border-color: var(--blue-500); box-shadow: var(--focus-ring); }
.cb-input:disabled { background: var(--surface-sunken); color: var(--text-subtle); cursor: not-allowed; }
.cb-input--sm { padding: 8px 12px; font-size: var(--fs-body-sm); }
.cb-input--lg { padding: 15px 16px; font-size: var(--fs-body-lg); }
.cb-field--error .cb-input { border-color: var(--red-500); }
.cb-field--error .cb-input:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--red-500) 35%, transparent); }
.cb-field__msg { font-size: var(--fs-caption); color: var(--text-muted); }
.cb-field--error .cb-field__msg { color: var(--red-600); }
`;

function inject() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cb-input-css')) return;
  const s = document.createElement('style');
  s.id = 'cb-input-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let _id = 0;

/**
 * Text input with optional label, helper / error message, and sizes.
 * Pass `multiline` to render a textarea.
 */
export function Input({
  label,
  required = false,
  size = 'md',
  error,
  helperText,
  multiline = false,
  id,
  className = '',
  ...rest
}) {
  inject();
  const fieldId = id || ('cb-input-' + (++_id));
  const inputClasses = ['cb-input'];
  if (size === 'sm') inputClasses.push('cb-input--sm');
  if (size === 'lg') inputClasses.push('cb-input--lg');
  if (className) inputClasses.push(className);
  const msg = error || helperText;
  const Control = multiline ? 'textarea' : 'input';
  const msgId = msg ? fieldId + '-msg' : undefined;
  return (
    <div className={'cb-field' + (error ? ' cb-field--error' : '')}>
      {label && (
        <label className="cb-field__label" htmlFor={fieldId}>
          {label}{required && <span className="cb-field__req" aria-hidden="true">*</span>}
        </label>
      )}
      <Control id={fieldId} className={inputClasses.join(' ')} aria-invalid={!!error} aria-describedby={msgId} {...rest} />
      {msg && <span className="cb-field__msg" id={msgId}>{msg}</span>}
    </div>
  );
}
