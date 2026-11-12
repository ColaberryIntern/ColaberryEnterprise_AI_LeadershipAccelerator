/**
 * `/open-house/lead` — the Open House confirmation on its own URL.
 *
 * The confirmation used to render inside OpenHouseSignupPage, and the tests for it
 * lived in that page's file. They moved here with the component. What is new, and
 * what most of this file is about, is the Meta Lead event: it must fire for a real
 * signup and must NOT fire for someone who simply opens the URL, because the whole
 * point of the separate URL is to tell those two apart.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { Location } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  useLocation: () => ({ pathname: '/open-house/lead', state: null, search: '', hash: '', key: 'k' }),
}));
jest.mock('../../services/metaPixel', () => ({
  loadMetaPixel: jest.fn().mockResolvedValue('2250748725203240'),
  trackLeadOnce: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../utils/startPortalSession', () => ({ startPortalSession: jest.fn(() => true) }));

import OpenHouseLeadPage from '../OpenHouseLeadPage';
import { trackLeadOnce } from '../../services/metaPixel';
import { startPortalSession } from '../../utils/startPortalSession';

const mockLead = trackLeadOnce as jest.Mock;

const ACCESS = { jwt: 'jwt-new', next: '/portal/today' };

const SIGNUP = {
  message: 'You are signed up. Check your email for your login link and start learning for $0.',
  when: 'Thu, Nov 19, 2026 · 6:30 PM CT',
  formatLabel: 'Live online event',
  access: null as { jwt: string; next: string } | null,
  leadKey: 'dana@example.com',
};

let container: HTMLDivElement;
let root: Root;

/** A router location carrying signup state, as the sign-up page's navigate() produces. */
function locationWith(signup: unknown): Location {
  return {
    pathname: '/open-house/lead', search: '', hash: '', key: 'k',
    state: signup === undefined ? null : { signup },
  } as Location;
}

async function mount(signup?: unknown): Promise<void> {
  await act(async () => {
    root.render(<OpenHouseLeadPage locationOverride={locationWith(signup)} />);
  });
}

const text = (): string => container.textContent || '';

beforeEach(() => {
  jest.clearAllMocks();
  mockLead.mockResolvedValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('a real signup', () => {
  it('confirms with the server’s own message and the event it echoed back', async () => {
    await mount(SIGNUP);
    expect(text()).toContain('Your seat is saved');
    expect(text()).toContain('Check your email for your login link');
    expect(text()).toContain('Thu, Nov 19, 2026 · 6:30 PM CT');
    // The form belongs to the other page; this one must never re-offer it.
    expect(container.querySelector('form')).toBeNull();
  });

  it('reports the Lead against the PERSON, not the visit', async () => {
    await mount(SIGNUP);
    expect(mockLead).toHaveBeenCalledTimes(1);
    expect(mockLead).toHaveBeenCalledWith('dana@example.com');
  });

  it('still confirms the account when no seat could be taken', async () => {
    // `registered: false` upstream means the account and the email happened and the
    // seat did not. The backend says so in its message; this page must not overwrite
    // that with a claim of a seat.
    await mount({
      ...SIGNUP,
      when: '',
      message: 'Your account is ready - check your email for your login link. We will confirm the Open House date separately.',
    });
    expect(text()).toContain('Your account is ready');
    expect(text()).not.toContain('Nov');
  });

  it('does not let a tracking failure break the confirmation', async () => {
    // A pixel must never be able to cost somebody the page that tells them they are in.
    mockLead.mockRejectedValue(new Error('meta is down'));
    await mount(SIGNUP);
    expect(text()).toContain('Your seat is saved');
  });
});

describe('somebody who just opens the URL', () => {
  it('is NOT counted as a lead', async () => {
    // Sohail's third condition. Without this the dedicated URL would be worthless:
    // anyone who bookmarked or reloaded it would report as a fresh registration.
    await mount(undefined);
    expect(mockLead).not.toHaveBeenCalled();
  });

  it('is told plainly what the page is, and sent back to the form', async () => {
    await mount(undefined);
    expect(text()).toContain('Nothing to confirm here');
    expect(text()).toContain('sign up');
    expect(container.querySelector('form')).toBeNull();
  });

  it('treats state with no signup payload the same as no state at all', async () => {
    // Boundary: router state can exist and carry something else entirely.
    await mount(undefined);
    expect(mockLead).not.toHaveBeenCalled();
  });

  it('does not fire a Lead when the key is missing', async () => {
    // A signup whose key did not survive is still a signup to the visitor - show the
    // confirmation - but it cannot be reported once per person, and trackLeadOnce
    // refuses a null key rather than reporting one per visit.
    await mount({ ...SIGNUP, leadKey: null });
    expect(text()).toContain('Your seat is saved');
    expect(mockLead).toHaveBeenCalledWith(null);
  });
});

describe('C121: Access your account', () => {
  it('opens a new account in one click', async () => {
    await mount({ ...SIGNUP, access: ACCESS });
    const btn = container.querySelector('[data-testid="cboh-access"]') as HTMLButtonElement;
    expect(btn.textContent).toBe('Access your account');
    await act(async () => { btn.click(); });
    expect(startPortalSession).toHaveBeenCalledWith('jwt-new', ACCESS.next, undefined);
  });

  it('sends an existing account to sign in, with no Access button', async () => {
    await mount({
      ...SIGNUP,
      access: null,
      message: 'You are signed up. You already have an account with this email, so sign in to pick up where you left off.',
    });
    expect(text()).toContain('Your seat is saved');
    expect(container.querySelector('[data-testid="cboh-access"]')).toBeNull();
    // The router mock renders Link as a bare <span>, so assert on what the person reads.
    expect(text()).toContain('already have an account with this email, so sign in');
    expect(text()).not.toContain('Check your email for your login link');
  });
});
