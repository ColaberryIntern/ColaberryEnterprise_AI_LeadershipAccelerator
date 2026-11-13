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
// The factory CREATES the navigate spy rather than closing over an outer const:
// babel hoists `jest.mock` above the declarations, so a factory referring to one
// would run in its temporal dead zone (see the note above). Tests read it back off
// the mocked module as `__nav`.
jest.mock('react-router-dom', () => {
  const nav = jest.fn();
  return {
    Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    useNavigate: () => nav,
    __nav: nav,
  };
});
jest.mock('../../services/metaPixel', () => ({
  loadMetaPixel: jest.fn().mockResolvedValue('2250748725203240'),
  trackLeadOnce: jest.fn().mockResolvedValue(true),
}));

import {
  fetchNextOpenHouse,
  openHouseAcquisitionFields,
  signUpForOpenHouse,
} from '../../services/openHouseApi';
import { identifyVisitor } from '../../utils/tracker';
import OpenHouseSignupPage, { seatsLabel, whenLabel, phoneProblem } from '../OpenHouseSignupPage';
import { SIGNUP_CONSENT_TEXT, PHONE_CONSENT_TEXT } from '../../config/consentText';

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

// BY ID, NOT BY POSITION. Adding the phone field shifted every index, and a positional
// helper would have silently started typing an email address into a phone box.
const field = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;
const submitButton = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;
const text = () => container.textContent ?? '';

/**
 * A completed signup is now a NAVIGATION, not a panel rendered in place.
 *
 * These assertions used to read "Your seat is saved" off this page. The confirmation
 * moved to /open-house/lead so that Meta has a URL meaning "registered" rather than
 * one shared with the empty form, and its own rendering is covered in
 * OpenHouseLeadPage.test.tsx. What this page is still responsible for is handing the
 * result over correctly, which is what this checks.
 */
function expectSignedUp(): void {
  const { __nav } = jest.requireMock('react-router-dom') as { __nav: jest.Mock };
  expect(__nav).toHaveBeenCalledWith('/open-house/lead', expect.objectContaining({
    replace: true,
    state: { signup: expect.objectContaining({ message: expect.any(String) }) },
  }));
}

async function mount() {
  await act(async () => { root.render(<OpenHouseSignupPage />); });
}

async function fillAndSubmit(
  name = 'Dana Okoro',
  email = 'dana@example.com',
  consent = false,
  phone = '(512) 555-0142',
) {
  await act(async () => { type(field('cboh-name'), name); });
  await act(async () => { type(field('cboh-email'), email); });
  await act(async () => { type(field('cboh-phone'), phone); });
  if (consent) await act(async () => { field('cboh-consent').click(); });
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
      phone: '(512) 555-0142',
      marketing_opt_in: false,
    });
  });

  it('sends marketing_opt_in true only when the box was actually ticked', async () => {
    await mount();
    // Unchecked on arrival: a pre-ticked box is not an affirmative act, and this value is the
    // consent of record for every marketing email afterwards.
    expect(field('cboh-consent').checked).toBe(false);
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
      name: 'Dana Okoro', email: 'dana@example.com', phone: '(512) 555-0142', marketing_opt_in: false,
    });
    expectSignedUp();
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
    expectSignedUp();
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

    await act(async () => { type(field('cboh-name'), 'Dana Okoro'); });
    await act(async () => { type(field('cboh-email'), 'dana@'); });
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

/**
 * THE FIELD THAT WENT MISSING.
 *
 * The landing page's CTAs used to point at /portal/signup, which asks for a phone
 * number. OH-3 pointed them at this page instead, and this page asked for a name and an
 * email only - so from the day it shipped the funnel quietly stopped collecting phone
 * numbers. Ali noticed on 2026-11-11 and asked for it back, mandatory.
 *
 * "Mandatory" is pinned as three separate refusals - empty, too short, too long -
 * because a field a visitor can satisfy with "555" is not really required.
 */
describe('the phone number is mandatory (Ali, 2026-11-11)', () => {
  it('asks for one on the form, before anyone submits', async () => {
    await mount();
    expect(field('cboh-phone')).not.toBeNull();
    expect(text()).toContain('Phone number');
  });

  it('refuses to submit with it empty, and does not call the route at all', async () => {
    await mount();
    await fillAndSubmit('Dana Okoro', 'dana@example.com', false, '');
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(text()).toContain('Please enter your phone number.');
  });

  it('refuses a number too short to dial, naming the area code', async () => {
    await mount();
    await fillAndSubmit('Dana Okoro', 'dana@example.com', false, '555-0142');
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(text()).toContain('area code');
  });

  it('sends a formatted number as typed, without normalising it', async () => {
    // The route counts digits, and reformatting what the visitor typed is a good way
    // to mangle an international number.
    await mount();
    await fillAndSubmit('Dana Okoro', 'dana@example.com', false, '(512) 555-0142');
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ phone: '(512) 555-0142' }));
  });

  it('CONTROL: a valid number still gets through, so the guard is not refusing everything', async () => {
    await mount();
    await fillAndSubmit();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expectSignedUp();
  });

  describe('phoneProblem', () => {
    it.each([
      ['', 'Please enter your phone number.'],
      ['   ', 'Please enter your phone number.'],
      ['555', 'too short'],
      ['512-555-014', 'too short'],
      ['1234567890123456', 'too many digits'],
      // The route caps the raw string at 50 chars as well as the digits. The form used
      // to accept this and the route then answered 400.
      ['(512) 555-0142 ' + 'x'.repeat(40), 'too long'],
    ])('rejects %p', (raw, fragment) => {
      expect(phoneProblem(raw)).toContain(fragment);
    });

    it.each(['5125550142', '(512) 555-0142', '512.555.0142', '+1 512 555 0142'])('accepts %p', (raw) => {
      expect(phoneProblem(raw)).toBeNull();
    });
  });
});

/**
 * The number is mandatory. PERMISSION TO RING IT IS NOT.
 *
 * `everyPhoneFormAsksPermission.test.ts` is a repo-wide invariant: a public form that
 * collects a telephone number must ask what may be done with it. Making the field
 * required without this would have been the exact defect that test exists to catch -
 * fifteen landing pages once collected numbers with no consent row behind any of them.
 */
describe('permission to call is asked, separately and never assumed', () => {
  it('does not ask before a number is typed', async () => {
    // Permission to call somebody we have no number for grants nothing, and a box above
    // an empty field reads as a condition of submitting.
    await mount();
    expect(field('cboh-phone-consent')).toBeNull();
    expect(text()).not.toContain(PHONE_CONSENT_TEXT);
  });

  it('asks once a number is typed, and starts UNTICKED', async () => {
    await mount();
    await act(async () => { type(field('cboh-phone'), '(512) 555-0142'); });
    expect(field('cboh-phone-consent')).not.toBeNull();
    expect(field('cboh-phone-consent').checked).toBe(false);
    expect(text()).toContain(PHONE_CONSENT_TEXT);
  });

  it('sends NO phone_consent key when the box was left alone', async () => {
    // An absent key records nothing. A `false` would be a grant row that says "no",
    // which is a different and untrue claim.
    await mount();
    await fillAndSubmit();
    expect(mockSignUp).toHaveBeenCalledWith(expect.not.objectContaining({ phone_consent: expect.anything() }));
  });

  it('sends phone_consent true only when the box was actually ticked', async () => {
    await mount();
    await act(async () => { type(field('cboh-name'), 'Dana Okoro'); });
    await act(async () => { type(field('cboh-email'), 'dana@example.com'); });
    await act(async () => { type(field('cboh-phone'), '(512) 555-0142'); });
    await act(async () => { field('cboh-phone-consent').click(); });
    await act(async () => {
      submitButton().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ phone_consent: true }));
  });

  it('uses the SHARED wording, not a sentence invented on this page', async () => {
    // The backend records this exact string as the evidence of what was shown.
    // consentTextParity.test.ts pins the two together; this pins the page to the constant.
    await mount();
    await act(async () => { type(field('cboh-phone'), '5125550142'); });
    expect(text()).toContain(PHONE_CONSENT_TEXT);
  });

  it('keeps the two grants separate: ticking email consent does not grant the phone', async () => {
    await mount();
    await fillAndSubmit('Dana Okoro', 'dana@example.com', true);
    const body = mockSignUp.mock.calls[0][0];
    expect(body.marketing_opt_in).toBe(true);
    expect(body.phone_consent).toBeUndefined();
  });
});
