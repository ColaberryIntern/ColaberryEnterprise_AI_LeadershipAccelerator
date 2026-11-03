import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * C105: /portal/signup recognizes a browser that already holds a live portal session and offers the way back to Today
 * first (C97: 32 return visits were Explorers re-clicking the ad and landing on the signup pitch as strangers).
 * The session check reads the REAL localStorage token, so these tests set real (unsigned) JWT-shaped tokens.
 */
jest.mock('../../../services/onboardingApi', () => ({ freeSignup: jest.fn() }));
jest.mock('../../../utils/tracker', () => ({ identifyVisitor: jest.fn() }));
jest.mock('../../../contexts/ParticipantAuthContext', () => ({ useParticipantAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  Link: ({ children, to }: { children?: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import PortalFreeSignupPage from '../PortalFreeSignupPage';
import { hasLiveParticipantSession } from '../../../utils/participantToken';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import { useNavigate } from 'react-router-dom';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: object) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`;
const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

let container: HTMLDivElement;
let root: Root;
const mount = async () => { await act(async () => { root.render(<PortalFreeSignupPage />); }); };
const welcome = () => container.querySelector('[data-testid="cbfs-welcome-back"]');
const form = () => container.querySelector('form.cbfs-form');

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  // CRA's jest resets mock implementations before each test, so they are set here, not in the factories.
  (useParticipantAuth as unknown as jest.Mock).mockReturnValue({ login: jest.fn() });
  (useNavigate as unknown as jest.Mock).mockReturnValue(jest.fn());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

describe('/portal/signup with a live session (C105)', () => {
  it('offers "Welcome back" and one link to Today instead of the signup form', async () => {
    localStorage.setItem('participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    await mount();
    expect(welcome()).not.toBeNull();
    expect(form()).toBeNull();
    expect(container.textContent).toContain("You're already signed in");
    const links = Array.from(welcome()!.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/portal/today']);
    expect(container.textContent).not.toMatch(/\bfree\b/i);
  });

  it('"Create a different account" still reaches the form (a shared computer)', async () => {
    localStorage.setItem('participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    await mount();
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Create a different account')!;
    await act(async () => { btn.click(); });
    expect(welcome()).toBeNull();
    expect(form()).not.toBeNull();
  });

  it.each([
    ['no session', null],
    ['an expired session', jwt({ sub: 'e1', exp: inSeconds(-5) })],
    ['a session expiring within the minute', jwt({ sub: 'e1', exp: inSeconds(20) })],
    ['a malformed token', 'garbage'],
    ['a read-only view-as token', jwt({ sub: 'e1', exp: inSeconds(3600), read_only: true })],
  ])('%s: the page is unchanged (signup form, no welcome back)', async (_l, token) => {
    if (token) localStorage.setItem('participant_token', token);
    await mount();
    expect(welcome()).toBeNull();
    expect(form()).not.toBeNull();
    expect(container.textContent).toContain('Start for $0');
  });
});

describe('hasLiveParticipantSession', () => {
  it('reads only the real session, never the tab-local view-as token', () => {
    sessionStorage.setItem('view_as_participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    expect(hasLiveParticipantSession()).toBe(false);
    localStorage.setItem('participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    expect(hasLiveParticipantSession()).toBe(true);
  });

  it('uses the clock it is given, with a one-minute margin', () => {
    const exp = 2_000_000_000;
    localStorage.setItem('participant_token', jwt({ sub: 'e1', exp }));
    expect(hasLiveParticipantSession(exp * 1000 - 61_000)).toBe(true);
    expect(hasLiveParticipantSession(exp * 1000 - 59_000)).toBe(false);
  });
});
