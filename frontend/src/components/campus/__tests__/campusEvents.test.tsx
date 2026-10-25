/**
 * C27 (v6 D5): upcoming events with one-tap sign up. Eventbrite is the record (Ali, 2026-10-24, Q1: A).
 *  - "Sign up" is the event's Eventbrite registration link, in a new tab; a registered event shows "✓ You're going" (no button);
 *    an event without a registration page shows nothing;
 *  - the board: a 7-day strip from today (today marked, event days dotted) and the upcoming events with their buttons;
 *  - Coming up lists only the events you are registered for, soonest first;
 *  - the Schedule puts each event on its Central weekday, carries its feed row for the button, and adds today's plan in teal.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { OpenHouseView } from '../../../services/onboardingApi';
import { signupOf, upcoming, goingTo, weekStrip, centralDay } from '../events/eventsModel';
import { EventSignup } from '../events/EventSignup';
import { ScheduleBoard, ComingUpEvents, UpcomingEvents } from '../events/EventRows';
import { buildSchedule, dkey, itemClass } from '../../../pages/portal/schedule/scheduleModel';

const NOW = new Date('2026-10-26T15:00:00Z'); // Monday 10:00 CDT
const ev = (id: string, starts: string, o: Partial<OpenHouseView> = {}): OpenHouseView => ({
  id, title: `Event ${id}`, description: null, starts_at: starts, ends_at: null, timezone: 'America/Chicago',
  registration_url: `https://www.eventbrite.com/e/${id}`, meeting_link: null, image_url: null, signup_count: null, is_registered: false, ...o,
});
const A = ev('a', '2026-10-27T23:30:00Z');                         // Tue 6:30 PM CDT
const B = ev('b', '2026-10-29T17:00:00Z', { is_registered: true }); // Thu noon CDT
const C = ev('c', '2026-11-01T01:00:00Z');                          // Sat Oct 31, 8 PM CDT (UTC is already Sunday)
const PAST = ev('p', '2026-10-20T17:00:00Z', { is_registered: true });
const NOLINK = ev('n', '2026-10-28T17:00:00Z', { registration_url: null });

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const t = (s: string) => container.querySelector(`[data-testid="${s}"]`) as HTMLElement | null;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('the model', () => {
  it('sign up is the Eventbrite link; registered is "going"; no link, nothing', () => {
    expect(signupOf(A)).toEqual({ kind: 'signup', href: 'https://www.eventbrite.com/e/a' });
    expect(signupOf(B)).toEqual({ kind: 'going' });
    expect(signupOf(NOLINK)).toEqual({ kind: 'none' });
  });
  it('upcoming drops what has ended and sorts; Coming up keeps only what you are registered for', () => {
    expect(upcoming([C, PAST, B, A], NOW).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(goingTo([C, PAST, B, A], NOW).map((e) => e.id)).toEqual(['b']);
  });
  it('days are Central: an 8 PM Saturday event is Saturday even though UTC says Sunday', () => {
    expect(centralDay(C.starts_at)).toBe('2026-10-31');
  });
  it('the week strip: seven days from today, today first, event days dotted', () => {
    const s = weekStrip([A, B, C], NOW);
    expect(s).toHaveLength(7);
    expect(s[0]).toMatchObject({ today: true, wd: 'Mon', d: '26', hasEvent: false });
    expect(s.filter((d) => d.hasEvent).map((d) => d.ymd)).toEqual(['2026-10-27', '2026-10-29', '2026-10-31']);
  });
});

describe('rendered', () => {
  it('Sign up opens Eventbrite in a new tab; registered reads "You\'re going" with no button', () => {
    act(() => { root.render(<><EventSignup event={A} /><EventSignup event={B} /><EventSignup event={NOLINK} /></>); });
    const a = t('cm-ev-signup-a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://www.eventbrite.com/e/a');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(t('cm-ev-going-b')!.textContent).toBe('✓ You’re going');
    expect(t('cm-ev-signup-b')).toBeNull();
    expect(t('cm-ev-signup-n')).toBeNull();
    act(() => { a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(t('cm-ev-signup-a')!.textContent).toContain('Finish on Eventbrite');
  });

  it('the board: strip, upcoming rows with their buttons, and Open my schedule', () => {
    const open = jest.fn();
    act(() => { root.render(<div className="cm-r3-screen"><ScheduleBoard events={[A, B]} all={[A, B, C]} now={NOW} onSection={open} /></div>); });
    expect(container.querySelectorAll('[data-testid="cm-board-strip"] .d')).toHaveLength(7);
    expect(container.querySelectorAll('[data-testid="cm-board-strip"] .d.is-today')).toHaveLength(1);
    expect(t('cm-board-ev-a')!.textContent).toContain('Tue, Oct 27');
    expect(t('cm-board-ev-a')!.querySelector('[data-testid="cm-ev-signup-a"]')).not.toBeNull();
    expect(t('cm-board-ev-b')!.textContent).toContain('You’re going');
    t('cm-board-primary')!.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Coming up lists the events you are going to; nothing when none; the arrival rows say when there are none', () => {
    act(() => { root.render(<ComingUpEvents events={goingTo([A, B, C], NOW)} />); });
    expect(t('cm-cc-coming-events')!.textContent).toContain('Event b');
    expect(t('cm-cc-coming-events')!.textContent).not.toContain('Event a');
    act(() => { root.render(<ComingUpEvents events={[]} />); });
    expect(t('cm-cc-coming-events')).toBeNull();
    act(() => { root.render(<UpcomingEvents events={[]} />); });
    expect(t('cm-ev-upcoming')!.textContent).toContain('No events on the calendar');
  });
});

describe('the schedule', () => {
  const today = new Date(2026, 9, 26);
  it('puts each event on its Central weekday with its feed row, and today\'s plan in teal on today', () => {
    const plan = [{ key: 'k1', title: 'Deep Dive', route: '/portal/runtime/c1', done: false, label: 'Deep Dive', minutes: 6 }];
    const s = buildSchedule([], [A, B, C], null, today, plan);
    expect(s[dkey(new Date(2026, 9, 27))].map((e) => e.id)).toEqual(['a']);
    expect(s[dkey(new Date(2026, 9, 31))].map((e) => e.id)).toEqual(['c']);
    expect(s[dkey(new Date(2026, 9, 29))][0].event).toBe(B);
    expect(itemClass(s[dkey(new Date(2026, 9, 29))][0])).toBe('registered');
    const t0 = s[dkey(today)];
    expect(t0.map((e) => [e.kind, e.title, e.href])).toEqual([['plan', 'Deep Dive', '/portal/runtime/c1']]);
    expect(itemClass(t0[0])).toBe('plan');
  });
});
