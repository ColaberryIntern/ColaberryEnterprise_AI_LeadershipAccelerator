import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * SNACK-2 on the Open House door.
 *
 * WHAT IS WORTH PINNING, and why each one can actually fail:
 *
 *  1. The box is THERE, unticked, with the exact shared wording. A bare boolean column is the
 *     only record of this grant, so the sentence on screen is the entire evidence of what was
 *     agreed to - if it drifts, nothing anywhere records what the person was shown.
 *  2. Ticking it sends `social_proof_opt_in: true`.
 *  3. LEAVING IT ALONE SENDS NO KEY AT ALL. Not `false`. An absence records nothing; a `false`
 *     would be a stored answer the person never gave.
 *  4. It never blocks the signup.
 *
 * Mocks are created inside the factories and read back through the typed import, because babel
 * hoists `jest.mock` above the const declarations - the note in OpenHouseSignupPage.test.tsx
 * explains the temporal-dead-zone trap this avoids.
 */

jest.mock('../../services/openHouseApi', () => ({
  fetchNextOpenHouse: jest.fn(),
  signUpForOpenHouse: jest.fn(),
  openHouseAcquisitionFields: jest.fn(),
}));
jest.mock('../../utils/tracker', () => ({ identifyVisitor: jest.fn() }));
jest.mock('../../utils/startPortalSession', () => ({ startPortalSession: jest.fn(() => true) }));
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
import OpenHouseSignupPage from '../OpenHouseSignupPage';
import { SOCIAL_PROOF_CONSENT_TEXT } from '../../config/consentText';

const mockFetchEvent = fetchNextOpenHouse as jest.Mock;
const mockSignUp = signUpForOpenHouse as jest.Mock;
const mockAcquisition = openHouseAcquisitionFields as jest.Mock;

const EVENT = {
  event_id: '2004289439668',
  name: 'Colaberry Forward Deployed AI Engineer Accelerator Open House',
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
  event: null,
  message: 'You are signed up.',
};

let container: HTMLDivElement;
let root: Root;

/**
 * Type into a controlled React input. Assigning `el.value` directly does NOT work: React 18
 * tracks the value property on the node and treats an unchanged tracker as "no change".
 */
function type(el: HTMLElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// BY ID, never by position. The sibling test file records what a positional helper cost once
// already: adding a field silently retargeted every lookup below it.
const field = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;
const submitButton = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;

async function mount() {
  await act(async () => { root.render(<OpenHouseSignupPage />); });
}

async function fillAndSubmit(tickSocialProof: boolean) {
  await act(async () => { type(field('cboh-name'), 'Dana Okoro'); });
  await act(async () => { type(field('cboh-email'), 'dana@example.com'); });
  await act(async () => { type(field('cboh-phone'), '(512) 555-0142'); });
  if (tickSocialProof) await act(async () => { field('cboh-social-proof').click(); });
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

describe('the Open House form asks to name you, and asks honestly', () => {
  it('shows the box unticked, with the exact shared wording', async () => {
    await mount();
    const box = field('cboh-social-proof');
    expect(box).toBeTruthy();
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    // The sentence, not a paraphrase. It is the only evidence of what was agreed to.
    expect(container.textContent ?? '').toContain(SOCIAL_PROOF_CONSENT_TEXT);
  });

  it('sends social_proof_opt_in: true when the person ticks it', async () => {
    await mount();
    await fillAndSubmit(true);
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(mockSignUp.mock.calls[0][0]).toMatchObject({ social_proof_opt_in: true });
  });

  it('sends NO key at all when the person leaves it alone, rather than false', async () => {
    await mount();
    await fillAndSubmit(false);
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    const body = mockSignUp.mock.calls[0][0];
    // CONTROL on the same object: the signup really was submitted, so "key absent" cannot be
    // "nothing happened". If this line fails the assertion below means nothing.
    expect(body).toMatchObject({ name: 'Dana Okoro', email: 'dana@example.com' });
    expect('social_proof_opt_in' in body).toBe(false);
  });

  it('does not block the signup either way', async () => {
    await mount();
    await fillAndSubmit(false);
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });
});
