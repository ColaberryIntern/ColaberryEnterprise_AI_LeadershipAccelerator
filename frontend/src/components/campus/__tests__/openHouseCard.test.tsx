/**
 * C47 (Ali, 2026-10-25): the next Open House in the side panel's Coming up. Explorers are asked to sign up (the event's Eventbrite
 * registration, new tab) until they do, then see "You're going" until it ends; members get "Tell friends & family" (share sheet, else
 * copy the link); staff get a reminder to tell everyone; business accounts get nothing. No event, no link, or a past event: no card.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
const mockRsvp = jest.fn();
jest.mock('../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../services/onboardingApi'), rsvpOpenHouse: (...a: unknown[]) => mockRsvp(...a) }));
// eslint-disable-next-line import/first
import { OpenHouseCard, openHouseVariant } from '../events/OpenHouseCard';
// eslint-disable-next-line import/first
import type { OpenHouseView } from '../../../services/onboardingApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NOW = new Date('2026-10-25T18:00:00Z');
const EV: OpenHouseView = {
  id: 'oh-1', title: 'Colaberry AI Systems Architect Accelerator Open House', description: null, starts_at: '2026-10-29T23:30:00.000Z', ends_at: '2026-10-30T01:00:00.000Z',
  timezone: 'America/Chicago', registration_url: 'https://www.eventbrite.com/e/oh-1', meeting_link: null, image_url: null, signup_count: null, is_registered: false,
};

it('picks the card per account, and none without an event, a link, or after it ends', () => {
  expect(['explorer', 'member', 'staff', 'business'].map((a) => openHouseVariant(a as never, EV, false, NOW))).toEqual(['signup', 'share', 'staff', null]);
  expect(openHouseVariant('explorer', EV, true, NOW)).toBe('going');
  expect(openHouseVariant('explorer', null, false, NOW)).toBeNull();
  expect(openHouseVariant('explorer', { ...EV, registration_url: null }, false, NOW)).toBeNull();
  expect(openHouseVariant('explorer', EV, false, new Date('2026-10-30T02:00:00Z'))).toBeNull();
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const show = (audience: string, registered = false) => act(() => { root.render(<OpenHouseCard audience={audience as never} ev={EV} registered={registered} now={NOW} />); });

it('Explorer: the real title and Central time, and Save my seat opens Eventbrite in a new tab', () => {
  show('explorer');
  expect(q('[data-testid="cm-cc-openhouse"]')!.textContent).toContain('Colaberry AI Systems Architect Accelerator Open House');
  expect(q('[data-testid="cm-cc-openhouse"]')!.textContent).toContain('6:30 PM');
  const a = q('[data-testid="cm-oh-signup"]') as HTMLAnchorElement;
  expect([a.getAttribute('href'), a.getAttribute('target'), (a.getAttribute('rel') || '').includes('noopener')]).toEqual(['https://www.eventbrite.com/e/oh-1', '_blank', true]);
});

it('Explorer after signing up: You\'re going, no sign-up button', () => {
  show('explorer', true);
  expect(q('[data-testid="cm-oh-going"]')).not.toBeNull();
  expect(q('[data-testid="cm-oh-signup"]')).toBeNull();
});

it('member: Tell friends & family copies the link when there is no share sheet', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  show('member');
  await act(async () => { q('[data-testid="cm-oh-share"]')!.click(); });
  expect(writeText).toHaveBeenCalledWith('https://www.eventbrite.com/e/oh-1');
  expect(q('[data-testid="cm-oh-said"]')!.textContent).toBe('Link copied');
});

it('staff: the reminder to tell everyone, with the link to copy; business: no card', () => {
  show('staff');
  expect(q('[data-testid="cm-cc-openhouse"]')!.textContent).toContain('Tell everyone you come in contact with');
  expect(q('[data-testid="cm-oh-share"]')!.textContent).toBe('Copy the link');
  show('business');
  expect(q('[data-testid="cm-cc-openhouse"]')).toBeNull();
});

it('never says "free"', () => {
  for (const a of ['explorer', 'member', 'staff']) { show(a); expect(container.textContent).not.toMatch(/\bfree\b/i); }
});

it('Save my seat records the RSVP on the same click and tells the page, so the card can flip to "You are going" (Ali: recognise the sign-up)', async () => {
  mockRsvp.mockResolvedValue({ ok: true, awarded: true, points: 25 });
  const onRegistered = jest.fn();
  act(() => { root.render(<OpenHouseCard audience="explorer" ev={EV} registered={false} now={NOW} onRegistered={onRegistered} />); });
  const a = q('[data-testid="cm-oh-signup"]') as HTMLAnchorElement;
  a.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot open the new tab
  await act(async () => { a.click(); });
  expect(mockRsvp).toHaveBeenCalledWith('oh-1');
  expect(onRegistered).toHaveBeenCalledTimes(1);
  act(() => { root.render(<OpenHouseCard audience="explorer" ev={EV} registered now={NOW} onRegistered={onRegistered} />); });
  expect(q('[data-testid="cm-oh-signup"]')).toBeNull();
  expect(q('[data-testid="cm-oh-going"]')).not.toBeNull();
});

it('a failed RSVP leaves Save my seat so they can try again', async () => {
  mockRsvp.mockRejectedValue(new Error('UpstreamUnavailable'));
  const onRegistered = jest.fn();
  act(() => { root.render(<OpenHouseCard audience="explorer" ev={EV} registered={false} now={NOW} onRegistered={onRegistered} />); });
  const a = q('[data-testid="cm-oh-signup"]') as HTMLAnchorElement;
  a.addEventListener('click', (e) => e.preventDefault());
  await act(async () => { a.click(); });
  expect(onRegistered).not.toHaveBeenCalled();
  expect(q('[data-testid="cm-oh-signup"]')).not.toBeNull();
});
