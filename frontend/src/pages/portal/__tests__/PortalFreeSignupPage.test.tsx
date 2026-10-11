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
