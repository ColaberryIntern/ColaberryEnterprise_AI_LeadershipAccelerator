import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * The Open House front door (OH-3), where the ads land.
 *
 * WHAT IS WORTH PINNING HERE, in order:
 *
 *  1. The page NEVER shows a date it was not given. A signup funnel advertising the wrong
 *     Open House is worse than one advertising none, and the endpoint behind it was reporting
 *     12:30 PM for a 6:30 PM event until OH-1. So: a known event renders the server's labels
 *     verbatim; an unknown one says so and still takes the signup.
 *  2. It sends ONLY the three acquisition keys the route's `.strict()` schema accepts, and
 *     retries without them on a 400. Attribution must never cost a signup.
 *  3. It calls `identifyVisitor`, which is what answers "who clicked". That call cannot be
 *     caught by a type or a lint rule, which is why PortalFreeSignupPage pins it too - it was
 *     missing from that page for months and nothing failed, the answer to "who clicked" was
 *     just always "we don't know".
 *  4. Consent is unchecked, optional, and sent as the person left it.
 *
 * The mocks are created INSIDE the factories and read back through the typed import, for the
 * reason PortalFreeSignupPage.test.tsx states: babel hoists `jest.mock` above the const
 * declarations, so a factory closing over them runs in their temporal dead zone.
 */

jest.mock('../../services/openHouseApi', () => ({
  fetchNextOpenHouse: jest.fn(),
  signUpForOpenHouse: jest.fn(),
  openHouseAcquisitionFields: jest.fn(),
}));
jest.mock('../../utils/tracker', () => ({ identifyVisitor: jest.fn() }));
// C121: the real helper navigates the window; here it only records the call.
jest.mock('../../utils/startPortalSession', () => ({ startPortalSession: jest.fn(() => true) }));
jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import {
  fetchNextOpenHouse,
  openHouseAcquisitionFields,
  signUpForOpenHouse,
} from '../../services/openHouseApi';
import { identifyVisitor } from '../../utils/tracker';
import OpenHouseSignupPage, { seatsLabel, whenLabel } from '../OpenHouseSignupPage';
import { SIGNUP_CONSENT_TEXT } from '../../config/consentText';

const mockFetchEvent = fetchNextOpenHouse as jest.Mock;
const mockSignUp = signUpForOpenHouse as jest.Mock;
const mockAcquisition = openHouseAcquisitionFields as jest.Mock;
const mockIdentify = identifyVisitor as jest.Mock;

/** The real shape of GET /api/v1/open-house/event, measured on production 2026-11-10. */
const EVENT = {
  event_id: '2004289439668',
  name: 'Colaberry AI Systems Architect Accelerator Open House',
  starts_at: '2026-11-20T00:30:00.000Z',
  ends_at: '2026-11-20T01:30:00.000Z',
  timezone: 'America/Chicago',
  date_label: 'Thu, Nov 19, 2026',
  time_label: '6:30 PM CT',
  format_label: 'Live online event',
  price_label: 'No card needed',
  is_online: true,
  capacity: 400,
  registered: 6,
  seats_remaining: 394,
  rsvp_url: 'https://www.eventbrite.com/e/x-tickets-2004289439668',
};

const OK = {
  ok: true as const,
  created: true,
  registered: true,
  event: {
    event_id: EVENT.event_id,
    date_label: EVENT.date_label,
    time_label: EVENT.time_label,
    format_label: EVENT.format_label,
    seats_remaining: 393,
  },
  message: 'You are signed up. Check your email for your login link and start learning for $0.',
};

let container: HTMLDivElement;
let root: Root;

/**
 * Type into a controlled React input. Assigning `el.value` directly does NOT work: React 18
 * tracks the value property on the node and treats an unchanged tracker as "no change", so
 * state never updates. The value has to go through the prototype's native setter.
 */
function type(el: HTMLElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const inputs = () => Array.from(container.querySelectorAll('input'));
const submitButton = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;
const text = () => container.textContent ?? '';

async function mount() {
  await act(async () => { root.render(<OpenHouseSignupPage />); });
}

async function fillAndSubmit(name = 'Dana Okoro', email = 'dana@example.com', consent = false) {
  const [nameEl, emailEl, consentEl] = inputs();
  await act(async () => { type(nameEl, name); });
  await act(async () => { type(emailEl, email); });
  if (consent) await act(async () => { consentEl.click(); });
  await act(async () => {
    submitButton().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockFetchEvent.mockResolvedValue(EVENT);
  mockSignUp.mockResolvedValue(OK);
  mockAcquisition.mockReturnValue({});
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('the date on the page is the date the server gave it', () => {
  it('shows the real next Open House, rendered from the server labels verbatim', async () => {
    await mount();
    expect(text()).toContain('Thu, Nov 19, 2026 · 6:30 PM CT');
    expect(text()).toContain('Live online event');
    expect(text()).toContain('394 seats left');
    // The ISO instant never reaches the page: the backend owns Central, not this component.
    expect(text()).not.toContain('2026-11-20');
    expect(text()).not.toContain('00:30');
  });

  it('says so plainly when no event is announced, and still offers the form', async () => {
    mockFetchEvent.mockResolvedValue(null);
    await mount();
    expect(text()).toContain('Next date being confirmed');
    expect(text()).not.toContain('Nov');
    // The signup is the point; a missing date must not take the form down with it.
    expect(submitButton()).not.toBeNull();
    await fillAndSubmit();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it('shows neither a date nor a "being confirmed" line while it is still asking', async () => {
    // A pending promise: the question has not been answered yet, so the page claims nothing
    // in either direction rather than flashing "being confirmed" on a fast connection.
    mockFetchEvent.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(text()).not.toContain('Next date being confirmed');
    expect(text()).not.toContain('Nov');
    expect(submitButton()).not.toBeNull();
  });
});

describe('what it sends', () => {
  it('sends the name, the email and the consent as left, and nothing else', async () => {
    await mount();
    await fillAndSubmit();
    expect(mockSignUp).toHaveBeenCalledWith({
      name: 'Dana Okoro',
      email: 'dana@example.com',
      marketing_opt_in: false,
    });
  });

  it('sends marketing_opt_in true only when the box was actually ticked', async () => {
    await mount();
    // Unchecked on arrival: a pre-ticked box is not an affirmative act, and this value is the
    // consent of record for every marketing email afterwards.
    const [, , consentEl] = inputs();
    expect(consentEl.checked).toBe(false);
    expect(text()).toContain(SIGNUP_CONSENT_TEXT);

    await fillAndSubmit('Dana Okoro', 'dana@example.com', true);
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ marketing_opt_in: true }));
  });

  it('adds the acquisition keys the route accepts', async () => {
    mockAcquisition.mockReturnValue({
      utm_source: 'meta|cpc',
      utm_campaign: 'open_house_nov',
      page_url: 'https://enterprise.colaberry.ai/open-house?utm_source=meta',
    });
    await mount();
    await fillAndSubmit();
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({
      utm_source: 'meta|cpc',
      utm_campaign: 'open_house_nov',
    }));
  });

  it('retries WITHOUT the acquisition keys when the strict route rejects them', async () => {
    // The route is `.strict()`, so a backend older than a key - or one that refuses a value in
    // it - answers 400 for the whole request. Attribution must never cost a signup.
    mockAcquisition.mockReturnValue({ utm_source: 'meta|cpc' });
    mockSignUp
      .mockRejectedValueOnce({ response: { status: 400, data: { error: 'Validation failed' } } })
      .mockResolvedValueOnce(OK);
    await mount();
    await fillAndSubmit();

    expect(mockSignUp).toHaveBeenCalledTimes(2);
    expect(mockSignUp).toHaveBeenNthCalledWith(1, expect.objectContaining({ utm_source: 'meta|cpc' }));
    expect(mockSignUp).toHaveBeenNthCalledWith(2, {
      name: 'Dana Okoro', email: 'dana@example.com', marketing_opt_in: false,
    });
    expect(text()).toContain('Your seat is saved');
  });

  it('does not retry a 400 that was really about the person', async () => {
    mockAcquisition.mockReturnValue({});
    mockSignUp.mockRejectedValue({ response: { status: 400, data: { error: 'Validation failed' } } });
    await mount();
    await fillAndSubmit();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Validation failed');
  });

  it('identifies the visitor, which is what answers "who clicked"', async () => {
    await mount();
    await fillAndSubmit();
    expect(mockIdentify).toHaveBeenCalledWith(
      'dana@example.com',
      expect.objectContaining({
        name: 'Dana Okoro',
        metadata: expect.objectContaining({ source_form: 'open_house_signup' }),
      }),
    );
  });

  it('still completes the signup when the tracker throws', async () => {
    mockIdentify.mockImplementation(() => { throw new Error('blocked'); });
    await mount();
    await fillAndSubmit();
    expect(text()).toContain('Your seat is saved');
  });
});

describe('validation and failure', () => {
  it('refuses an empty name and a malformed email without calling the server', async () => {
    await mount();
    await act(async () => {
      submitButton().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(text()).toContain('Please enter your name.');
    expect(mockSignUp).not.toHaveBeenCalled();

    const [nameEl, emailEl] = inputs();
    await act(async () => { type(nameEl, 'Dana Okoro'); });
    await act(async () => { type(emailEl, 'dana@'); });
    await act(async () => {
      submitButton().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(text()).toContain('Please enter a valid email.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('explains a rate limit rather than showing the limiter’s own wording', async () => {
    mockSignUp.mockRejectedValue({ response: { status: 429 } });
    await mount();
    await fillAndSubmit();
    expect(text()).toContain('wait a few minutes');
    // The form is still usable: a limiter is a "later", not a dead end.
    expect(submitButton().disabled).toBe(false);
  });

  it('leaves the form usable after a network failure', async () => {
    mockSignUp.mockRejectedValue(new Error('offline'));
    await mount();
    await fillAndSubmit();
    expect(text()).toContain('Could not sign you up just now.');
    expect(submitButton().disabled).toBe(false);
  });
});

describe('after signing up', () => {
  it('confirms with the server’s own message and the event it echoed back', async () => {
    await mount();
    await fillAndSubmit();
    // The echo, not the date the page rendered a moment ago - those can differ if the event
    // rolled over between the page load and the click.
    expect(text()).toContain('Your seat is saved');
    expect(text()).toContain('Check your email for your login link');
    expect(text()).toContain('Thu, Nov 19, 2026 · 6:30 PM CT');
    expect(container.querySelector('form')).toBeNull();
  });

  it('still confirms the account when no seat could be taken', async () => {
    // `registered: false` means the account and the email happened and the seat did not. The
    // backend says so in its message; the page must not overwrite that with a claim of a seat.
    mockSignUp.mockResolvedValue({
      ...OK,
      registered: false,
      event: null,
      message: 'Your account is ready - check your email for your login link. We will confirm the Open House date separately.',
    });
    await mount();
    await fillAndSubmit();
    expect(text()).toContain('Your account is ready');
    expect(text()).not.toContain('Nov');
  });
});

describe('the pure labels', () => {
  it('seatsLabel claims a number only when there is one', () => {
    expect(seatsLabel(394)).toBe('394 seats left');
    expect(seatsLabel(1)).toBe('1 seat left');
    expect(seatsLabel(0)).toBe('');
    expect(seatsLabel(null)).toBe('');
    expect(seatsLabel(undefined)).toBe('');
    expect(seatsLabel(-3)).toBe('');
    expect(seatsLabel(Number.NaN)).toBe('');
  });

  it('whenLabel joins what it has and invents nothing', () => {
    expect(whenLabel({ date_label: 'Thu, Nov 19, 2026', time_label: '6:30 PM CT' }))
      .toBe('Thu, Nov 19, 2026 · 6:30 PM CT');
    expect(whenLabel({ date_label: 'Thu, Nov 19, 2026', time_label: '' })).toBe('Thu, Nov 19, 2026');
    expect(whenLabel({ date_label: '', time_label: '6:30 PM CT' })).toBe('6:30 PM CT');
    expect(whenLabel({ date_label: '', time_label: '' })).toBe('');
    expect(whenLabel(null)).toBe('');
  });
});

describe('the advertising rule', () => {
  it('never uses the word barred by 40 TAC 807.172(d), in either state', async () => {
    await mount();
    expect(text()).toMatch(/\$0/);
    expect(text()).toContain('No card needed');
    expect(text().toLowerCase()).not.toMatch(/\bfree\b/);
    await fillAndSubmit();
    expect(text().toLowerCase()).not.toMatch(/\bfree\b/);
  });
});

// C121 (Ali, 11 Nov): a brand-new account opens with one click instead of a trip to the inbox.
describe("C121: Access your account", () => {
  const { startPortalSession } = jest.requireMock("../../utils/startPortalSession");
  const ACCESS = { jwt: "jwt-new", next: "/portal/runtime/b0c844c0-01b0-439e-bc28-6a1b76b09afb" };

  it("shows Access your account for a new account and opens the welcome video with its session", async () => {
    mockSignUp.mockResolvedValue({ ...OK, access: ACCESS });
    await mount();
    await fillAndSubmit();
    expect(text()).toContain("Your account is ready");
    expect(text()).toContain("come back any time");
    expect(text()).not.toContain("Check your email for your login link");
    const btn = container.querySelector("[data-testid=\"cboh-access\"]") as HTMLButtonElement;
    expect(btn.textContent).toBe("Access your account");
    await act(async () => { btn.click(); });
    expect(startPortalSession).toHaveBeenCalledWith("jwt-new", ACCESS.next, undefined);
  });

  it("sends an existing account to sign in, with no Access button", async () => {
    mockSignUp.mockResolvedValue({ ...OK, created: false, access: null,
      message: "You are signed up. You already have an account with this email, so sign in to pick up where you left off." });
    await mount();
    await fillAndSubmit();
    expect(text()).toContain("Your seat is saved");
    expect(container.querySelector("[data-testid=\"cboh-access\"]")).toBeNull();
    // This file's router mock renders Link as a bare <span> (props dropped), so assert on what the person reads.
    expect(text()).toContain("already have an account with this email, so sign in");
    expect(text()).toContain("Sign in");
    expect(text()).not.toContain("Check your email for your login link");
  });

  it("falls back to the email when the browser will not keep the session", async () => {
    (startPortalSession as jest.Mock).mockReturnValueOnce(false);
    mockSignUp.mockResolvedValue({ ...OK, access: ACCESS });
    await mount();
    await fillAndSubmit();
    await act(async () => { (container.querySelector("[data-testid=\"cboh-access\"]") as HTMLButtonElement).click(); });
    expect(text()).toContain("sign-in link we just emailed you");
    expect(container.querySelector("[data-testid=\"cboh-access\"]")).toBeNull();
  });

  it("never says the barred word on the new-account screen", async () => {
    mockSignUp.mockResolvedValue({ ...OK, access: ACCESS });
    await mount();
    await fillAndSubmit();
    expect(text().toLowerCase()).not.toMatch(/\bfree\b/);
  });
});
