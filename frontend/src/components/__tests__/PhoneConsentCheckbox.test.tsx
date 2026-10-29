import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import PhoneConsentCheckbox, { shouldAskPhoneConsent } from '../PhoneConsentCheckbox';
import { PHONE_CONSENT_TEXT } from '../../config/consentText';

/**
 * The two rules that make a phone-permission tick consent rather than decoration.
 *
 * Both are the sort of thing that is obviously right while you are writing it and
 * silently wrong six months later: a box that renders before a number is typed
 * reads as a condition of submitting the form, and a box that arrives pre-ticked
 * is not an affirmative act at all. Neither shows up as a failure anywhere — the
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

describe('shouldAskPhoneConsent', () => {
  it.each([
    ['a number', '(214) 555-0100', true],
    ['a partial number', '214', true],
    ['the empty string', '', false],
    ['whitespace only', '   \t ', false],
    ['undefined', undefined, false],
    ['null', null, false],
  ])('asks for %s: %s', (label, phone, expected) => {
    expect(shouldAskPhoneConsent(phone as string)).toBe(expected);
  });

  it('asks for a half-typed number rather than judging validity', () => {
    // Deliberate. `normalizePhone` on the backend is the authority on what is
    // dialable, and it writes no grant it cannot key. A frontend that hid the box
    // for a number it thought malformed would collect a phone with no way at all
    // to authorise it — strictly worse than showing a box that turns out moot.
    expect(shouldAskPhoneConsent('5')).toBe(true);
  });
});

describe('PhoneConsentCheckbox', () => {
  it('renders NOTHING until a number is typed', () => {
    render(
      <PhoneConsentCheckbox id="t" phone="" checked={false} onChange={() => {}} />,
    );

    // Absent, not hidden. A display:none checkbox is still in the form, still
    // submittable, and still reachable by assistive tech in some modes.
    expect(box()).toBeNull();
    expect(container.textContent).not.toContain(PHONE_CONSENT_TEXT);
    expect(container.innerHTML).toBe('');
  });

  it('appears once a number is typed', () => {
    render(
      <PhoneConsentCheckbox id="t" phone="(214) 555-0100" checked={false} onChange={() => {}} />,
    );

    expect(box()).not.toBeNull();
    expect(container.textContent).toContain(PHONE_CONSENT_TEXT);
  });

  it('is NOT ticked when it appears', () => {
    render(
      <PhoneConsentCheckbox id="t" phone="2145550100" checked={false} onChange={() => {}} />,
    );

    expect(box()!.checked).toBe(false);
  });

  it('shows the exact wording the backend stores as evidence', () => {
    // Not a paraphrase. `consentTextParity.test.ts` pins this string to the one
    // written onto the consent record; rendering anything else here would make
    // that record an attestation to words nobody saw.
    render(
      <PhoneConsentCheckbox id="t" phone="2145550100" checked={false} onChange={() => {}} />,
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
      <PhoneConsentCheckbox id="t" phone="2145550100" checked={false} onChange={onChange} />,
    );

    act(() => {
      box()!.click();
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ties its label to its input, so the text is clickable and announced', () => {
    render(
      <PhoneConsentCheckbox id="sc-phone-consent" phone="2145550100" checked={false} onChange={() => {}} />,
    );

    const label = container.querySelector('label');
    expect(label!.getAttribute('for')).toBe('sc-phone-consent');
    expect(box()!.id).toBe('sc-phone-consent');
  });

  it('disables with the form, so it cannot be changed mid-submit', () => {
    render(
      <PhoneConsentCheckbox id="t" phone="2145550100" checked onChange={() => {}} disabled />,
    );

    expect(box()!.disabled).toBe(true);
  });
});
