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
 * has its own, so the pages that have their own primitives call
 * `shouldAskPhoneConsent` and render with them.
 *
 * ── THE TWO RULES ───────────────────────────────────────────────────────────
 *
 * 1. ASK ONLY ONCE A NUMBER IS TYPED. Permission to call somebody we have no
 *    number for grants nothing, and a phone-permission box sitting on a form
 *    before the field is filled reads as a condition of submitting it, which it
 *    is not.
 *
 * 2. NEVER PRE-TICKED. Consent has to be an affirmative act. This is enforced by
 *    the caller's initial state rather than here (the component is controlled),
 *    which is exactly why `phoneConsentState.test.tsx` asserts every caller
 *    starts it `false`.
 */

/**
 * Rule 1, as a function, so every form asks the same question of the same input.
 *
 * Whitespace-only is not a number. This intentionally does NOT try to validate the
 * number — `normalizePhone` on the backend is the authority on what is dialable,
 * and a frontend that hid the tick for a number it judged malformed would collect
 * a phone with no way to authorise it. Showing the box for a half-typed number
 * costs nothing: the backend writes no grant it cannot key.
 */
export function shouldAskPhoneConsent(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && phone.trim() !== '';
}

export interface PhoneConsentCheckboxProps {
  /** Unique within the page. Several of these forms coexist on one route. */
  id: string;
  /** The current phone value. The box renders only once this is non-blank. */
  phone: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Bootstrap by default; overridable for a host page with its own classes. */
  wrapperClassName?: string;
  inputClassName?: string;
  labelClassName?: string;
}

/**
 * The Bootstrap renderer, for the forms that are already Bootstrap.
 *
 * Returns null rather than a hidden element when there is no number: a
 * `display:none` checkbox is still in the form, still submittable, and still read
 * by a screen reader in some modes.
 */
export default function PhoneConsentCheckbox({
  id,
  phone,
  checked,
  onChange,
  disabled = false,
  wrapperClassName = 'form-check',
  inputClassName = 'form-check-input',
  labelClassName = 'form-check-label small text-muted',
}: PhoneConsentCheckboxProps) {
  if (!shouldAskPhoneConsent(phone)) return null;

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
