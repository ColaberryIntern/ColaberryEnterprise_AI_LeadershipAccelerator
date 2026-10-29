import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The booking form behind fifteen landing pages, and the permission it never asked
 * for.
 *
 * ── WHAT THIS PINS, AND WHY EACH ONE IS A REAL TRAP ─────────────────────────
 *
 * 1. THE PREFILLED BRANCH. The modal has two renderings of step 3. A visitor who
 *    arrives with a name and email already known never sees the form at all —
 *    they read a summary card and press Confirm. A tick added only to the form
 *    would therefore be missing on exactly the highest-intent path, and would look
 *    completely correct in a diff and in a screenshot of the form. So both
 *    branches are asserted.
 *
 * 2. THE PREFILLED NUMBER IS NOT A GRANT. `initialPhone` is a number we already
 *    hold from some earlier form. Seeding the tick from it would mean the page
 *    answering a consent question on the person's behalf.
 *
 * 3. THE KEY ACTUALLY REACHES BOTH POSTS. The modal writes to /api/calendar/book
 *    AND to /api/leads (a shadow lead for attribution). A grant on one and not the
 *    other would record permission against one copy of the number and not the
 *    other.
 */

/*
 * The mock is created INSIDE the factory and read back through the typed import
 * below. Declaring it as a `const` above a `jest.mock` call does not work: babel
 * hoists the call above the declaration, and the factory runs while that binding
 * is still in its temporal dead zone. Same note as in
 * `pages/portal/__tests__/PortalFreeSignupPage.test.tsx`.
 */
jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock('../../hooks/useCalendarAvailability', () => ({
  useCalendarAvailability: () => ({
    dates: [{ date: '2026-11-04', slots: [{ start: '2026-11-04T15:00:00.000Z', end: '2026-11-04T15:30:00.000Z' }] }],
    loading: false,
    error: null,
    refetch: jest.fn(),
    ensureLoaded: jest.fn(),
  }),
}));
jest.mock('../../services/utmService', () => ({ getUTMPayloadFields: () => ({}) }));
jest.mock('../../utils/tracker', () => ({ trackEvent: jest.fn(), identifyVisitor: jest.fn() }));
jest.mock('../../utils/ics', () => ({ downloadICS: jest.fn() }));

import api from '../../utils/api';
import StrategyCallModal from '../StrategyCallModal';
import { PHONE_CONSENT_TEXT } from '../../config/consentText';

const postMock = (api as unknown as { post: jest.Mock }).post;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({
    data: { booking: { scheduled_at: '2026-11-04T15:00:00.000Z', meet_link: 'https://meet.example', prep_token: 'tok' } },
  });
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

const render = (props: Record<string, unknown> = {}) => {
  act(() => {
    root.render(<StrategyCallModal show onClose={() => {}} {...props} />);
  });
};

const buttons = () => Array.from(container.querySelectorAll('.modal-body button'));
const clickText = (text: string) => {
  const el = buttons().find((b) => (b.textContent || '').includes(text));
  if (!el) {
    throw new Error(
      `no button containing "${text}". Saw: ${buttons().map((b) => JSON.stringify(b.textContent)).join(', ')}`,
    );
  }
  act(() => {
    (el as HTMLButtonElement).click();
  });
};

/**
 * Advance date -> time by clicking the first choice offered at each step.
 *
 * Deliberately NOT matched on the rendered time ("3:00 PM"): that string comes
 * from `toLocaleTimeString`, so it depends on the test environment's ICU data and
 * resolved timezone. A selector that reads a locale-formatted label is a test that
 * passes on one machine's Node build and fails on another's for no reason anybody
 * will enjoy diagnosing. The back link is `btn-link`; the choices are not.
 */
const chooseFirst = () => {
  const el = buttons().find((b) => !b.className.includes('btn-link'));
  if (!el) throw new Error('no choice button at this step');
  act(() => {
    (el as HTMLButtonElement).click();
  });
};
const setValue = (selector: string, value: string) => {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  act(() => {
    // React tracks the DOM value internally; setting `.value` alone is ignored.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const consentBox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');

/** Walk date -> time -> details, which is how a real visitor reaches the form. */
const reachDetails = () => {
  chooseFirst();
  chooseFirst();
};

const bodyOf = (url: string) =>
  (postMock.mock.calls.find((c) => c[0] === url) || [])[1] as Record<string, unknown> | undefined;

/**
 * Let the submit's promise chain settle.
 *
 * The shadow lead is posted in the continuation AFTER `await api.post('/api/
 * calendar/book')` resolves, so a synchronous click only ever produces the first
 * call. Asserting on the second one without this passes vacuously via `undefined`
 * — which is how the first draft of this file "passed".
 */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('the booking form', () => {
  it('shows no permission tick before a number is typed', () => {
    render();
    reachDetails();

    expect(container.textContent).not.toContain(PHONE_CONSENT_TEXT);
  });

  it('shows the tick, unticked, once a number is typed', () => {
    render();
    reachDetails();
    setValue('#sc-phone', '2145550100');

    expect(container.textContent).toContain(PHONE_CONSENT_TEXT);
    expect(consentBox()!.checked).toBe(false);
  });

  it('sends the grant to BOTH the booking and the shadow lead', async () => {
    render();
    reachDetails();
    setValue('#sc-name', 'Dana Reyes');
    setValue('#sc-email', 'dana@example.com');
    setValue('#sc-phone', '2145550100');
    act(() => {
      consentBox()!.click();
    });
    clickText('Confirm Strategy Call');
    await settle();

    expect(bodyOf('/api/calendar/book')!.phone_consent).toBe(true);
    // The second post is the attribution lead. A grant on one copy of the number
    // and not the other is a half-recorded permission.
    expect(bodyOf('/api/leads')!.phone_consent).toBe(true);
  });

  it('still books when the tick is left alone, and says so', async () => {
    render();
    reachDetails();
    setValue('#sc-name', 'Dana Reyes');
    setValue('#sc-email', 'dana@example.com');
    setValue('#sc-phone', '2145550100');
    clickText('Confirm Strategy Call');
    await settle();

    // The permission is optional. Declining must cost nobody their call — and the
    // request must still SAY false, so a declined tick is distinguishable from an
    // older client that could not ask.
    expect(bodyOf('/api/calendar/book')!.phone_consent).toBe(false);
    // Sent as the field displays it. The modal formats as you type and the
    // backend's `normalizePhone` keys the grant, so punctuation here is correct
    // rather than something to strip on the client.
    expect(bodyOf('/api/calendar/book')!.phone).toBe('(214) 555-0100');
  });
});

describe('the prefilled branch, which skips the form entirely', () => {
  const PREFILL = {
    initialName: 'Dana Reyes',
    initialEmail: 'dana@example.com',
    initialPhone: '2145550100',
  };

  it('asks for permission there too', () => {
    render(PREFILL);
    reachDetails();

    // There is no #sc-phone input on this branch at all — the summary card is
    // shown instead — so this is the assertion that catches a tick wired only
    // into the form.
    expect(container.querySelector('#sc-phone')).toBeNull();
    expect(container.textContent).toContain(PHONE_CONSENT_TEXT);
  });

  it('does NOT treat a number we already hold as permission to use it', () => {
    render(PREFILL);
    reachDetails();

    expect(consentBox()!.checked).toBe(false);
  });

  it('sends the grant from the confirm button', async () => {
    render(PREFILL);
    reachDetails();
    act(() => {
      consentBox()!.click();
    });
    clickText('Confirm Strategy Call');
    await settle();

    expect(bodyOf('/api/calendar/book')!.phone_consent).toBe(true);
    expect(bodyOf('/api/leads')!.phone_consent).toBe(true);
  });
});
