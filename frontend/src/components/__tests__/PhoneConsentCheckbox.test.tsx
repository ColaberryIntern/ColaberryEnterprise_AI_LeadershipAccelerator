import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import PhoneConsentCheckbox from '../PhoneConsentCheckbox';
import { PHONE_CONSENT_TEXT } from '../../config/consentText';

/**
 * The two rules that make a phone-permission tick consent rather than decoration.
 *
 * Both are the sort of thing that is obviously right while you are writing it and
 * silently wrong six months later: a box that is required turns a mandatory phone
 * field into mandatory consent, and a box that arrives pre-ticked is not an
 * affirmative act at all. Neither shows up as a failure anywhere — the
 * grant gets written, the row looks perfect, and it attests to a choice nobody
 * made.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui);
  });
};

const box = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');

describe('PhoneConsentCheckbox', () => {
  it('is ALWAYS shown, before any number is typed (PH1)', () => {
    // The phone is required on every public form now, so the permission sits beside
    // it from the start. Its wording says consent is not required to sign up.
    render(<PhoneConsentCheckbox id="t" checked={false} onChange={() => {}} />);

    expect(box()).not.toBeNull();
    expect(container.textContent).toContain(PHONE_CONSENT_TEXT);
  });

  it('is never required to submit', () => {
    render(<PhoneConsentCheckbox id="t" checked={false} onChange={() => {}} />);

    expect(box()!.required).toBe(false);
    expect(PHONE_CONSENT_TEXT).toContain("Consent isn't required to sign up.");
  });

  it('is NOT ticked when it appears', () => {
    render(
      <PhoneConsentCheckbox id="t" checked={false} onChange={() => {}} />,
    );

    expect(box()!.checked).toBe(false);
  });

  it('shows the exact wording the backend stores as evidence', () => {
    // Not a paraphrase. `consentTextParity.test.ts` pins this string to the one
    // written onto the consent record; rendering anything else here would make
    // that record an attestation to words nobody saw.
    render(
      <PhoneConsentCheckbox id="t" checked={false} onChange={() => {}} />,
    );

    expect(container.textContent).toBe(PHONE_CONSENT_TEXT);
  });

  it('never says the advertising word this project may not use', () => {
    // TWC 807.172(d).
    expect(PHONE_CONSENT_TEXT).not.toMatch(/\bfree\b/i);
  });

  it('reports a tick to the caller', () => {
    const onChange = jest.fn();
    render(
      <PhoneConsentCheckbox id="t" checked={false} onChange={onChange} />,
    );

    act(() => {
      box()!.click();
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ties its label to its input, so the text is clickable and announced', () => {
    render(
      <PhoneConsentCheckbox id="sc-phone-consent" checked={false} onChange={() => {}} />,
    );

    const label = container.querySelector('label');
    expect(label!.getAttribute('for')).toBe('sc-phone-consent');
    expect(box()!.id).toBe('sc-phone-consent');
  });

  it('disables with the form, so it cannot be changed mid-submit', () => {
    render(
      <PhoneConsentCheckbox id="t" checked onChange={() => {}} disabled />,
    );

    expect(box()!.disabled).toBe(true);
  });
});
