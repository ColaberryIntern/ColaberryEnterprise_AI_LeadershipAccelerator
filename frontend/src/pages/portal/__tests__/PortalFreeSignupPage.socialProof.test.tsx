import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * SNACK-2: the consent that decides whether a signup can be shown BY NAME.
 *
 * ── WHY ITS OWN FILE ────────────────────────────────────────────────────────
 *
 * `PortalFreeSignupPage.test.tsx` was at 447 lines and these cases take it past CLAUDE.md's
 * 500-line hard ceiling. The rule is that the next change to an oversize file splits it rather
 * than adding to it, and `PortalFreeSignupPage.welcomeBack.test.tsx` is the precedent for the
 * seam. The harness below is duplicated on purpose: a shared helper module for two test files
 * would couple them, and the preamble is the part least likely to change.
 *
 * ── WHAT IS BEING TESTED ────────────────────────────────────────────────────
 *
 * `leads.social_proof_opt_in` is `NOT NULL DEFAULT false` and, until this change, NOTHING WROTE
 * IT. So the landing-page snack bar could only ever render "Someone in <city>", the by-name path
 * in `composeSignupEvents` was unreachable, and a page configured `name_format: 'opted_in_only'`
 * dropped every row and showed no bar at all while every health check passed. This form is the
 * missing half.
 */

jest.mock('../../../services/onboardingApi', () => ({ freeSignup: jest.fn() }));
jest.mock('../../../utils/tracker', () => ({ identifyVisitor: jest.fn() }));
jest.mock('../../../contexts/ParticipantAuthContext', () => ({ useParticipantAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import { freeSignup } from '../../../services/onboardingApi';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import { useNavigate } from 'react-router-dom';
import PortalFreeSignupPage from '../PortalFreeSignupPage';
import { SOCIAL_PROOF_CONSENT_TEXT } from '../../../config/consentText';

const mockFreeSignup = freeSignup as jest.Mock;
const mockUseAuth = useParticipantAuth as unknown as jest.Mock;
const mockUseNavigate = useNavigate as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root;
let mockLogin: jest.Mock;
let mockNavigate: jest.Mock;

/** React 18 tracks the value property, so the value must go through the native setter. */
function type(el: HTMLElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const submitButton = () => container.querySelector('button[type="submit"]')!;
const text = () => container.textContent ?? '';

async function mount() {
  await act(async () => { root.render(<PortalFreeSignupPage />); });
}

/** By id, never by index: this suite exists because a field was inserted above the others. */
async function fillAndSubmit(name = 'Dana Okoro', email = 'dana@example.com') {
  const nameEl = container.querySelector<HTMLInputElement>('#cbfs-name')!;
  const emailEl = container.querySelector<HTMLInputElement>('#cbfs-email')!;
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

/**
 * SNACK-2: permission to be NAMED in the recent-signup notices.
 *
 * The feature it unlocks has been dead against real data since it shipped. `social_proof_opt_in`
 * is `NOT NULL DEFAULT false` and nothing ever wrote it, so the bar could only ever say
 * "Someone in <city>" and a page configured `opted_in_only` showed no bar at all. This form is
 * the thing that was missing.
 */
describe('social-proof consent', () => {
  const box = () => container.querySelector<HTMLInputElement>('#cbfs-social-proof')!;

  it('shows the wording the column stands for', async () => {
    await mount();
    expect(text()).toContain(SOCIAL_PROOF_CONSENT_TEXT);
  });

  it('is UNCHECKED by default, because a pre-ticked box is not an affirmative act', async () => {
    await mount();
    expect(box()).toBeTruthy();
    expect(box().checked).toBe(false);
  });

  it('is a real checkbox wired to its label, so it can be clicked and read out', async () => {
    await mount();
    expect(box().type).toBe('checkbox');
    const label = container.querySelector('label[for="cbfs-social-proof"]');
    expect(label).toBeTruthy();
    expect(label!.textContent).toContain(SOCIAL_PROOF_CONSENT_TEXT);
  });

  it('DOES NOT BLOCK SUBMISSION when left alone', async () => {
    await mount();
    await fillAndSubmit();
    expect(mockFreeSignup).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('a.b.c');
  });

  /**
   * OMITTED, not `false`. The route is `.strict()`, so a page that reaches a server deployed
   * before this field existed would have the WHOLE SIGNUP rejected over a key it does not know.
   * Absent and false land identically on the row, so omitting costs nothing and protects the
   * deploy order.
   */
  it('sends NO key at all when left alone, which is what makes the deploy order safe', async () => {
    await mount();
    await fillAndSubmit();
    expect(mockFreeSignup.mock.calls[0][0]).not.toHaveProperty('social_proof_opt_in');
  });

  it('sends true once ticked', async () => {
    await mount();
    await act(async () => { box().click(); });
    expect(box().checked).toBe(true);

    await fillAndSubmit();

    expect(mockFreeSignup.mock.calls[0][0]).toMatchObject({
      full_name: 'Dana Okoro',
      email: 'dana@example.com',
      social_proof_opt_in: true,
    });
  });

  /**
   * THE ASSERTION THIS BLOCK IS FOR. Two separate permissions, two separate boxes. Ticking the
   * one that shows your name on a public page must not also sign you up for email, and ticking
   * the email box must not put your name on a page.
   */
  it('is INDEPENDENT of the email consent in both directions', async () => {
    await mount();
    await act(async () => { box().click(); });
    await fillAndSubmit();

    expect(mockFreeSignup.mock.calls[0][0]).toMatchObject({
      social_proof_opt_in: true,
      marketing_opt_in: false,
    });
  });

  it('and ticking the email box alone sends no naming permission', async () => {
    await mount();
    const emailConsent = container.querySelector<HTMLInputElement>('#cbfs-consent')!;
    await act(async () => { emailConsent.click(); });
    await fillAndSubmit();

    const body = mockFreeSignup.mock.calls[0][0];
    expect(body).toMatchObject({ marketing_opt_in: true });
    expect(body).not.toHaveProperty('social_proof_opt_in');
  });
});
