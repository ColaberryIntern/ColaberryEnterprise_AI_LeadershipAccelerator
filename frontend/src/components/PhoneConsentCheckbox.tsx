import React from 'react';
import { PHONE_CONSENT_TEXT } from '../config/consentText';

/**
 * Permission to call or text, asked for beside a phone field.
 *
 * ── WHAT IS SHARED HERE, AND WHAT DELIBERATELY IS NOT ───────────────────────
 *
 * Shared: the WORDING (via `PHONE_CONSENT_TEXT`, pinned to the string the backend
 * records as evidence by `consentTextParity.test.ts`) and the two RULES below.
 *
 * Not shared: the markup, past the default renderer at the bottom of this file.
 * The public pages here run four different styling systems — Bootstrap in the
 * strategy-call modal and the lead-capture form, design tokens plus the
 * `colaberry/core` primitives on /contact, the `cbv2-*` sheet on the publicV2
 * pages, inline styles on /enroll. One component trying to wear all four would
 * either take a dozen class-name props or render foreign markup into a page that
 * has its own, so the pages that have their own primitives render
 * `PHONE_CONSENT_TEXT` with them.
 *
 * ── THE TWO RULES (PH1, Ali 2026-11-19) ─────────────────────────────────────
 *
 * 1. ALWAYS SHOWN, NEVER REQUIRED. Every public form now requires a phone number,
 *    so the box sits beside the field from the start rather than appearing once a
 *    number is typed. Its wording says outright that consent is not required to
 *    sign up, and submitting never depends on it: a required number must never be
 *    read as a granted permission.
 *
 * 2. NEVER PRE-TICKED. Consent has to be an affirmative act. This is enforced by
 *    the caller's initial state rather than here (the component is controlled),
 *    which is exactly why every caller starts it `false`.
 */

export interface PhoneConsentCheckboxProps {
  /** Unique within the page. Several of these forms coexist on one route. */
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Bootstrap by default; overridable for a host page with its own classes. */
  wrapperClassName?: string;
  inputClassName?: string;
  labelClassName?: string;
}

/** The Bootstrap renderer, for the forms that are already Bootstrap. */
export default function PhoneConsentCheckbox({
  id,
  checked,
  onChange,
  disabled = false,
  wrapperClassName = 'form-check',
  inputClassName = 'form-check-input',
  labelClassName = 'form-check-label small text-muted',
}: PhoneConsentCheckboxProps) {
  return (
    <div className={wrapperClassName}>
      <input
        type="checkbox"
        className={inputClassName}
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <label className={labelClassName} htmlFor={id}>
        {PHONE_CONSENT_TEXT}
      </label>
    </div>
  );
}
