/**
 * C20 (round 3 §2.7): "Book a call with admissions".
 *  - the sheet: the four topics, the next business days, Central times; Book stays off until a topic and a time are picked;
 *    booking shows the confirmation (day, time, zone, Meet) and announces the change (Coming up refreshes);
 *  - a time taken meanwhile says so and reloads the times; an existing booking offers Keep it / Reschedule, and Reschedule cancels
 *    it first, then shows the picker; an unavailable calendar says so and claims nothing;
 *  - Coming up: the booked call with Reschedule (Join only at call time); the help desk's "Talk to a person" opens the sheet;
 *  - both searches find it for learners and Explorers only.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockCalls: string[] = [];
let mockBook: () => Promise<unknown> = async () => ({ kind: 'booked', booking: BOOKING });
let mockSlots: () => Promise<unknown> = async () => ({ timezone: 'America/Chicago', dates: DAYS });
jest.mock('../admissions/admissionsCallApi', () => ({
  ...jest.requireActual('../admissions/admissionsCallApi'),
  getSlots: () => { mockCalls.push('slots'); return mockSlots(); },
  bookCall: (b: unknown) => { mockCalls.push('book ' + JSON.stringify(b)); return mockBook(); },
  cancelCall: (id: string) => { mockCalls.push('cancel ' + id); return Promise.resolve(); },
}));

import BookCallSheet from '../admissions/BookCallSheet';
import { ComingUpCall, joinable } from '../admissions/BookCallHost';
import { HelpDesk } from '../home/ConciergeCards';
import { BOOK_CALL_EVENT, BOOKING_CHANGED_EVENT } from '../admissions/admissionsCallApi';
import { searchCampus } from '../campusSearch';
import { wayfinderEmpty, wayfinderSearch, type WfContext } from '../wayfinderIndex';

const DAYS = [
  { date: '2026-10-27', slots: [{ start: '2026-10-27T15:00:00.000Z', end: '2026-10-27T15:30:00.000Z' }, { start: '2026-10-27T15:30:00.000Z', end: '2026-10-27T16:00:00.000Z' }] },
  { date: '2026-10-28', slots: [{ start: '2026-10-28T19:00:00.000Z', end: '2026-10-28T19:30:00.000Z' }] },
];
const BOOKING = { eventId: 'ev123456', startTime: '2026-10-27T15:00:00.000Z', endTime: '2026-10-27T15:30:00.000Z', meetLink: 'https://meet.google.com/abc', topic: 'payment' as const };

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const t = (s: string) => container.querySelector(`[data-testid="${s}"]`) as HTMLElement | null;
const byText = (txt: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === txt) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => {
  mockCalls.length = 0;
  mockBook = async () => ({ kind: 'booked', booking: BOOKING });
  mockSlots = async () => ({ timezone: 'America/Chicago', dates: DAYS });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function open(props: Partial<React.ComponentProps<typeof BookCallSheet>> = {}) {
  await act(async () => { root.render(<BookCallSheet name="Ada Learner" onClose={() => mockCalls.push('close')} {...props} />); });
  await flush();
}

describe('the sheet', () => {
  it('offers the four topics, the days and Central times; Book waits for a topic and a time; booking confirms and announces', async () => {
    const changed = jest.fn();
    window.addEventListener(BOOKING_CHANGED_EVENT, changed);
    await open();
    expect(t('cm-book')!.getAttribute('role')).toBe('dialog');
    expect(container.textContent).toContain('A real person from the admissions team, not an AI.');
    for (const tp of ['enroll', 'payment', 'cohort', 'other']) expect(t(`cm-book-topic-${tp}`)).not.toBeNull();
    expect(container.textContent).toContain('Pick a time · Central (CDT)');
    expect(t('cm-book-slots')!.textContent).toBe('10:00 AM10:30 AM');
    expect((t('cm-book-submit') as HTMLButtonElement).disabled).toBe(true);
    await click(t('cm-book-topic-payment')!);
    expect((t('cm-book-submit') as HTMLButtonElement).disabled).toBe(true);
    await click(byText('10:00 AM'));
    expect((t('cm-book-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(t('cm-book-you')!.textContent).toBe('ALAda LearnerUses your account email');
    expect(container.textContent).toContain('Tue, Oct 27 · 10:00 AM'); // the footer hint names the chosen time
    await click(t('cm-book-submit')!);
    expect(mockCalls).toContain('book {"slotStart":"2026-10-27T15:00:00.000Z","topic":"payment"}');
    expect(t('cm-book-confirmed')).not.toBeNull();
    expect(t('cm-book-when')!.textContent).toBe('Tue, Oct 27 · 10:00 AM CDT · 30 minutes on Google Meet');
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(BOOKING_CHANGED_EVENT, changed);
  });

  it('picking another day shows that day\'s times and clears the chosen time', async () => {
    await open();
    await click(t('cm-book-topic-other')!);
    await click(byText('10:00 AM'));
    await click(container.querySelector('[aria-label="Wed, Oct 28"]') as HTMLElement);
    expect(t('cm-book-slots')!.textContent).toBe('2:00 PM');
    expect((t('cm-book-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a time taken meanwhile says so and reloads the times', async () => {
    mockBook = async () => ({ kind: 'taken' });
    await open();
    await click(t('cm-book-topic-other')!);
    await click(byText('10:00 AM'));
    await click(t('cm-book-submit')!);
    await flush();
    expect(container.textContent).toContain('That time was just taken. Please pick another.');
    expect(mockCalls.filter((c) => c === 'slots')).toHaveLength(2);
  });

  it('an existing booking offers Keep it / Reschedule; Reschedule cancels it first, then shows the picker', async () => {
    mockBook = async () => ({ kind: 'already', booking: BOOKING });
    await open();
    await click(t('cm-book-topic-other')!);
    await click(byText('10:00 AM'));
    await click(t('cm-book-submit')!);
    expect(t('cm-book-already')).not.toBeNull();
    await click(t('cm-book-reschedule')!);
    await flush();
    expect(mockCalls).toContain('cancel ev123456');
    expect(t('cm-book-slots')).not.toBeNull();
  });

  it('opened on a booking (Coming up\'s Reschedule) it shows that call first, without loading times', async () => {
    await open({ current: BOOKING });
    expect(t('cm-book-already')).not.toBeNull();
    expect(mockCalls).not.toContain('slots');
  });

  it('an unavailable calendar says so, with Try again, and nothing is booked', async () => {
    mockSlots = async () => { throw new Error('503'); };
    await open();
    expect(container.textContent).toContain('Booking is not available right now.');
    expect(mockCalls.some((c) => c.startsWith('book'))).toBe(false);
    mockSlots = async () => ({ timezone: 'America/Chicago', dates: DAYS });
    await click(byText('Try again'));
    await flush();
    expect(t('cm-book-slots')).not.toBeNull();
  });

  it('Escape closes it', async () => {
    await open();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(mockCalls).toContain('close');
  });
});

describe('Coming up and the entry points', () => {
  it('Coming up shows the call with Reschedule; Join only from ten minutes before until the end', async () => {
    act(() => { root.render(<ComingUpCall booking={BOOKING} now={new Date('2026-10-26T15:00:00Z')} />); });
    expect(t('cm-cc-coming')!.textContent).toContain('Admissions call');
    expect(t('cm-cc-coming')!.textContent).toContain('Tue, Oct 27 · 10:00 AM CDT · Google Meet');
    expect(container.querySelector('a[href="https://meet.google.com/abc"]')).toBeNull();
    expect(joinable(BOOKING, new Date('2026-10-27T14:51:00Z'))).toBe(true);
    expect(joinable(BOOKING, new Date('2026-10-27T15:31:00Z'))).toBe(false);
    const opened = jest.fn();
    window.addEventListener(BOOK_CALL_EVENT, opened);
    await click(t('cm-cc-coming-reschedule')!);
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual(BOOKING);
    window.removeEventListener(BOOK_CALL_EVENT, opened);
    act(() => { root.render(<ComingUpCall booking={null} now={new Date()} />); });
    expect(t('cm-cc-coming')).toBeNull();
  });

  it('the help desk shows "Talk to a person" when asked, even with no AI staff on duty, and it opens the sheet', async () => {
    const opened = jest.fn();
    window.addEventListener(BOOK_CALL_EVENT, opened);
    act(() => { root.render(<HelpDesk desks={[]} talk />); });
    expect(t('cm-cc-talk')!.textContent).toContain('Talk to a person');
    await click(t('cm-cc-talk')!);
    expect(opened).toHaveBeenCalledTimes(1);
    act(() => { root.render(<HelpDesk desks={[]} />); });
    expect(t('cm-cc-helpdesk')).toBeNull();
    window.removeEventListener(BOOK_CALL_EVENT, opened);
  });

  it('both searches find it for learners and Explorers only', () => {
    expect(searchCampus('book', [], null, false, true)[0]).toMatchObject({ kind: 'book', label: 'Book a call with admissions' });
    expect(searchCampus('talk to a person', [], null, false, true)[0]?.kind).toBe('book');
    expect(searchCampus('book', [], null, false, false).some((r) => r.kind === 'book')).toBe(false);
    expect(searchCampus('bo', [], null, false, true).some((r) => r.kind === 'book')).toBe(false); // too short to mean it
    const ctx = (audience: WfContext['audience']): WfContext => ({ audience, workplace: false, buildings: [], accessOf: () => 'open', presence: null, desks: [], urgent: null, suggested: [] });
    expect(wayfinderSearch('admissions', ctx('member'))[0]).toMatchObject({ kind: 'book', group: 'Help' });
    expect(wayfinderEmpty(ctx('explorer')).some((i) => i.kind === 'book')).toBe(true);
    expect(wayfinderEmpty(ctx('staff')).some((i) => i.kind === 'book')).toBe(false);
    expect(wayfinderSearch('call', ctx('business')).some((i) => i.kind === 'book')).toBe(false);
  });
});
