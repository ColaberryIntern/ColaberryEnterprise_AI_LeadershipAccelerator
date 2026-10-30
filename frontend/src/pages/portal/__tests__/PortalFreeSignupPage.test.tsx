import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * Signing up here is what turns an anonymous visitor into a person we can name.
 *
 * WHY THIS TEST EXISTS. `identifyVisitor` stitches the fingerprint to the lead and backfills
 * that person's earlier anonymous sessions. EnrollPage, ContactPage, LeadCaptureForm and
 * StrategyCallModal all call it. This page - the destination of every landing-page CTA - did
 * not, and neither did the backend signup path, which never reads a fingerprint. So someone
 * could arrive from a campaign, read the page, click the button and create an account, and
 * their visit stayed anonymous for ever. Nothing failed; the answer to "who clicked" was just
 * always "we don't know".
 *
 * A missing call cannot be caught by a type or a lint rule, so it is pinned here.
 *
 * The mocks are created INSIDE the factories and read back through the typed import: declaring
 * them as `const` above a `jest.mock` call does not work, because babel hoists the call above
 * the declarations and the factory runs while those bindings are still in their temporal dead
 * zone.
 */

jest.mock('../../../services/onboardingApi', () => ({ freeSignup: jest.fn() }));
jest.mock('../../../utils/tracker', () => ({ identifyVisitor: jest.fn() }));
jest.mock('../../../contexts/ParticipantAuthContext', () => ({ useParticipantAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import { freeSignup } from '../../../services/onboardingApi';
import { identifyVisitor } from '../../../utils/tracker';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import { useNavigate } from 'react-router-dom';
import PortalFreeSignupPage from '../PortalFreeSignupPage';
import { SIGNUP_CONSENT_TEXT } from '../../../config/consentText';

const mockFreeSignup = freeSignup as jest.Mock;
const mockIdentify = identifyVisitor as jest.Mock;
const mockUseAuth = useParticipantAuth as unknown as jest.Mock;
const mockUseNavigate = useNavigate as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root;
let mockLogin: jest.Mock;
let mockNavigate: jest.Mock;

/**
 * Type into a controlled React input. Assigning `el.value` directly does NOT work: React 18
 * tracks the value property on the node and treats an unchanged tracker as "no change", so state
 * never updates. The value has to go through the prototype's native setter.
 */
function type(el: HTMLElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const inputs = () => Array.from(container.querySelectorAll('input'));
const submitButton = () => container.querySelector('button[type="submit"]')!;
const text = () => container.textContent ?? '';

async function mount() {
  await act(async () => { root.render(<PortalFreeSignupPage />); });
}

/** One field per act(), which is what React 18 wants. */
async function fillAndSubmit(name = 'Dana Okoro', email = 'dana@example.com') {
  const [nameEl, emailEl] = inputs();
  await act(async () => { type(nameEl, name); });
  await act(async () => { type(emailEl, email); });
  await act(async () => { submitButton().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockLogin = jest.fn();
  mockNavigate = jest.fn();
  mockUseAuth.mockReturnValue({ login: mockLogin });
  mockUseNavigate.mockReturnValue(mockNavigate);
  mockFreeSignup.mockResolvedValue({ jwt: 'a.b.c' });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('a successful signup identifies the visitor', () => {
  it('calls identifyVisitor with the email the person typed', async () => {
    await mount();
    await fillAndSubmit();

    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockIdentify).toHaveBeenCalledWith(
      'dana@example.com',
      expect.objectContaining({
        name: 'Dana Okoro',
        metadata: expect.objectContaining({ source_form: 'portal_free_signup' }),
      }),
    );
  });

  it('still logs the person in and sends them on', async () => {
    await mount();
    await fillAndSubmit();

    expect(mockLogin).toHaveBeenCalledWith('a.b.c');
    expect(mockNavigate).toHaveBeenCalledWith('/portal/today', { replace: true });
  });

  it('identifies BEFORE navigating away, so the call is issued while the page is alive', async () => {
    const order: string[] = [];
    mockIdentify.mockImplementation(() => { order.push('identify'); });
    mockNavigate.mockImplementation(() => { order.push('navigate'); });

    await mount();
    await fillAndSubmit();

    expect(order).toEqual(['identify', 'navigate']);
  });
});

describe('attribution never gets in the way of signing up', () => {
  it('a thrown identifyVisitor does not cost the person their account', async () => {
    mockIdentify.mockImplementation(() => { throw new Error('tracker blocked'); });

    await mount();
    await fillAndSubmit();

    expect(mockLogin).toHaveBeenCalledWith('a.b.c');
    expect(mockNavigate).toHaveBeenCalledWith('/portal/today', { replace: true });
  });

  it('a failed signup identifies nobody', async () => {
    mockFreeSignup.mockRejectedValue({ response: { data: { error: 'Email already in use.' } } });

    await mount();
    await fillAndSubmit();

    expect(text()).toContain('Email already in use.');
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('an invalid email never reaches the API or the tracker', async () => {
    await mount();
    await fillAndSubmit('Dana Okoro', 'not-an-email');

    expect(mockFreeSignup).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
  });
});

describe('the copy carries no banned wording', () => {
  it('never advertises the word this business may not advertise', async () => {
    await mount();
    // Ali, 2026-10-05: "don't use free" - TWC 807.172(d).
    expect(text()).not.toMatch(/\bfree\b/i);
    expect(text()).toContain('Create my account');
  });
});

/**
 * Marketing consent.
 *
 * WHY IT IS HERE AT ALL: this form never asked, so `leads.consent_contact` took its
 * column default and every signup recorded a refusal nobody made - 110 of 110
 * measured on production against an all-time baseline of 21,847 true to 3,068
 * false. Downstream, the send gate reads that as "do not contact".
 *
 * WHY IT MUST NOT BLOCK: this is the front door of a live paid-ad funnel. A required
 * checkbox trades signups for permissions, and that is a business decision rather
 * than something a bug fix settles on its own. The two assertions that matter most
 * below are that an untouched box still produces an account, and that an untouched
 * box sends `false` rather than nothing.
 */
const consentBox = () => container.querySelector('#cbfs-consent') as HTMLInputElement;

describe('marketing consent', () => {
  it('shows the wording that will be recorded as the consent of record', async () => {
    await mount();
    expect(text()).toContain(SIGNUP_CONSENT_TEXT);
  });

  it('is UNCHECKED by default, because a pre-ticked box is not an affirmative act', async () => {
    await mount();
    expect(consentBox()).toBeTruthy();
    expect(consentBox().checked).toBe(false);
  });

  it('is a real checkbox wired to its label, so it can be clicked and read out', async () => {
    await mount();
    expect(consentBox().type).toBe('checkbox');
    const label = container.querySelector('label[for="cbfs-consent"]');
    expect(label).toBeTruthy();
    expect(label!.textContent).toContain(SIGNUP_CONSENT_TEXT);
  });

  it('DOES NOT BLOCK SUBMISSION when left alone', async () => {
    await mount();
    await fillAndSubmit();

    expect(mockFreeSignup).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('a.b.c');
  });

  it('sends false when left alone, which is a measurement rather than a silence', async () => {
    await mount();
    await fillAndSubmit();

    expect(mockFreeSignup.mock.calls[0][0]).toMatchObject({ marketing_opt_in: false });
  });

  it('sends true once ticked', async () => {
    await mount();
    await act(async () => { consentBox().click(); });
    expect(consentBox().checked).toBe(true);

    await fillAndSubmit();

    expect(mockFreeSignup.mock.calls[0][0]).toMatchObject({
      full_name: 'Dana Okoro',
      email: 'dana@example.com',
      marketing_opt_in: true,
    });
  });

  it('does not disturb the name and email fields it sits beside', async () => {
    // `fillAndSubmit` destructures `[nameEl, emailEl] = inputs()`, so a field inserted ABOVE
    // them would silently retarget every other test in this file. This guard caught exactly
    // that when the optional phone field was added: it failed with "Expected checkbox,
    // Received tel", which is the guard working rather than the change being wrong.
    //
    // The phone CONSENT checkbox is deliberately absent here - it renders only once a number
    // has been typed.
    //
    // ORDER CHANGED 2026-10-29, and this guard fired exactly as its author predicted, just with
    // the operands swapped. The marketing checkbox was MOVED UP to sit directly under the email
    // field: at the bottom of the form it was read, if at all, after attention had already moved
    // to the submit button, and 59 of 347 free_signup leads in thirty days ticked it. What this
    // guard actually protects is name and email staying at indexes 0 and 1, because
    // `fillAndSubmit` destructures exactly those two. A checkbox arriving at index 2 leaves that
    // intact, and the other 21 tests in this file passing unchanged is the evidence for it.
    await mount();
    const [first, second, third, fourth] = inputs();
    expect(first.type).toBe('text');
    expect(second.type).toBe('email');
    expect(third.type).toBe('checkbox');
    expect(fourth.type).toBe('tel');
  });
});

describe('phone and permission to call', () => {
  /**
   * Measured 2026-10-26: 270 landing-page signups in thirty days, ZERO phone numbers, because
   * this form never asked. Open House, which does ask, collected 48 of 53. Nobody could be
   * called, so no amount of CRM or dialer work could reach these people.
   *
   * It stays OPTIONAL. The page converts at 41.6% precisely because of how little it asks for,
   * and a required number would be paid for in signups.
   */
  const phoneField = () => inputs().find((i) => i.type === 'tel')!;
  const phoneConsentBox = () =>
    container.querySelector<HTMLInputElement>('#cbfs-phone-consent');

  it('offers a phone field that is not required', async () => {
    await mount();
    expect(phoneField()).toBeTruthy();
    expect(phoneField().required).toBe(false);
  });

  it('does not send a phone when none is given', async () => {
    await mount();
    await fillAndSubmit();
    const body = mockFreeSignup.mock.calls[0][0];
    expect(body.phone).toBeUndefined();
    expect(body.phone_consent).toBeUndefined();
  });

  it('hides the call permission until there is a number to call', async () => {
    // A box granting permission to ring a number we do not have authorises nothing, and asking
    // up front reads as a condition of signing up.
    await mount();
    expect(phoneConsentBox()).toBeNull();

    await act(async () => { type(phoneField(), '555-0100'); });
    expect(phoneConsentBox()).not.toBeNull();
  });

  it('leaves the call permission UNTICKED, because a pre-ticked box is not an affirmative act', async () => {
    await mount();
    await act(async () => { type(phoneField(), '555-0100'); });
    expect(phoneConsentBox()!.checked).toBe(false);
  });

  it('sends the number without permission when the box is left alone', async () => {
    // The number is still useful for support and for somebody who later asks to be called. What
    // it must NOT do is imply permission, so phone_consent stays absent.
    await mount();
    await act(async () => { type(phoneField(), '555-0100'); });
    await fillAndSubmit();

    const body = mockFreeSignup.mock.calls[0][0];
    expect(body.phone).toBe('555-0100');
    expect(body.phone_consent).toBeUndefined();
  });

  it('sends both once the number and the permission are given', async () => {
    await mount();
    await act(async () => { type(phoneField(), '555-0100'); });
    await act(async () => { phoneConsentBox()!.click(); });
    await fillAndSubmit();

    const body = mockFreeSignup.mock.calls[0][0];
    expect(body.phone).toBe('555-0100');
    expect(body.phone_consent).toBe(true);
  });

  it('shows wording about calls and texts, separate from the email consent', async () => {
    // A record attesting "Email me about Colaberry courses" cannot stand as evidence that
    // somebody agreed to a phone call, so the two sentences must not be the same sentence.
    await mount();
    await act(async () => { type(phoneField(), '555-0100'); });

    const shown = phoneConsentBox()!.closest('label')!.textContent!;
    expect(shown.toLowerCase()).toContain('call');
    expect(shown.toLowerCase()).toContain('text');
    expect(shown).not.toBe(SIGNUP_CONSENT_TEXT);
  });

  it('does not block submission when no number is typed at all', async () => {
    await mount();
    await fillAndSubmit();
    expect(mockFreeSignup).toHaveBeenCalledTimes(1);
  });
});
