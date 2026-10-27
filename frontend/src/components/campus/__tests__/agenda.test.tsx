/**
 * C33 (v7 R6): the Schedule is one list. With one class, one signed-up event and one booked session, the board shows all three in
 * date order with the right icon and building; each row's action (🎓 Class walks to the Classroom, Sign up / ✓ You're going, 🚪
 * Booked walks to Meeting Rooms); Coming up keeps only what is on your calendar in the next week, with Walk there; the Schedule page
 * puts a booked session on its Central day.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { MySession, OpenHouseView } from '../../../services/onboardingApi';
import { agenda, comingUp, classStartIso, agendaWhen, type AgendaBooking } from '../events/agendaModel';
import { AgendaBoard, ComingUpAgenda } from '../events/Agenda';
import { buildSchedule, dkey, itemClass } from '../../../pages/portal/schedule/scheduleModel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date('2026-10-26T15:00:00Z'); // Monday 10:00 AM CDT
const cls = (o: Partial<MySession> = {}): MySession => ({ id: 's1', session_number: 3, title: 'Build Day', session_date: '2026-10-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled', room_id: null, ...o });
const ev = (o: Partial<OpenHouseView> = {}): OpenHouseView => ({ id: 'e1', title: 'Open House', description: null, starts_at: '2026-10-28T17:00:00Z', ends_at: null, timezone: 'America/Chicago',
  registration_url: 'https://www.eventbrite.com/e/e1', meeting_link: null, image_url: null, signup_count: null, is_registered: true, ...o });
const bk = (o: Partial<AgendaBooking> = {}): AgendaBooking => ({ booking_id: 'b1', room_id: 'r1', title: 'Pair on STORY-001', start_at: '2026-10-26T20:00:00Z', ...o });
const PLACE: Record<string, string> = { lecture: 'Classroom', amphi: 'Events Hall', commons: 'Meeting Rooms' };
const place = (id: string) => PLACE[id] ?? id;

describe('the model', () => {
  it('a class, an event and a session, in date order, each in its building', () => {
    const items = agenda({ sessions: [cls()], events: [ev()], bookings: [bk()], now: NOW });
    expect(items.map((i) => [i.kind, i.building])).toEqual([['session', 'commons'], ['class', 'lecture'], ['event', 'commons']]); // C62: events happen in the Meeting Rooms
    expect(items[1].title).toBe('Week 3 · Build Day');
  });
  it('a class starts at its Central wall time (DST-correct); a past class, a completed one and a cancelled one are not ahead', () => {
    expect(classStartIso(cls())).toBe('2026-10-27T23:30:00.000Z');
    expect(classStartIso(cls({ session_date: '2026-11-03' }))).toBe('2026-11-04T00:30:00.000Z');
    expect(classStartIso(cls({ start_time: '6:30 PM' }))).toBe('2026-10-27T23:30:00.000Z');
    const items = agenda({ sessions: [cls({ id: 'old', session_date: '2026-10-19' }), cls({ id: 'done', status: 'completed' }), cls({ id: 'x', status: 'cancelled' })], events: [], bookings: [], now: NOW });
    expect(items).toEqual([]);
  });
  it('Coming up: only what is on your calendar (signed-up events), within a week', () => {
    const items = comingUp({ sessions: [cls(), cls({ id: 'far', session_date: '2026-11-10' })], events: [ev(), ev({ id: 'e2', is_registered: false })], bookings: [bk()], now: NOW });
    expect(items.map((i) => i.id)).toEqual(['session-b1', 'class-s1', 'event-e1']);
  });
  it('says the day and time in Central', () => {
    expect(agendaWhen('2026-10-27T23:30:00Z')).toBe('Tue Oct 27 · 6:30 PM');
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);

describe('rendered', () => {
  it('the board: icons 🚪 🎓 🎪 in order with their buildings, 🎓 Class walks to the Classroom, 🚪 Booked to Meeting Rooms, the event signs up', () => {
    const walks: string[] = [];
    const items = agenda({ sessions: [cls()], events: [ev({ is_registered: false })], bookings: [bk()], now: NOW });
    act(() => { root.render(<div className="cm-r3-screen"><AgendaBoard items={items} now={NOW} place={place} onWalk={(id) => walks.push(id)} onOpen={() => undefined} /></div>); });
    expect(q('.k')!.textContent).toBe('Your week'); // C80: one line, never clipped
    const rows = Array.from(container.querySelectorAll('.cm-ag-row'));
    expect(rows.map((r) => r.querySelector('.ic')!.textContent)).toEqual(['🚪', '🎓', '🎪']);
    expect(rows[0].textContent).toContain('Meeting Rooms');
    expect(rows[1].textContent).toContain('Tue Oct 27 · 6:30 PM · Classroom');
    expect(rows[2].querySelector('[data-testid="cm-ev-signup-e1"]')).not.toBeNull();
    act(() => { (rows[1].querySelector('button') as HTMLButtonElement).click(); });
    act(() => { (rows[0].querySelector('button') as HTMLButtonElement).click(); });
    expect(walks).toEqual(['lecture', 'commons']);
    expect(container.querySelectorAll('[data-testid="cm-board-strip"] .d[data-has-event]').length).toBe(3);
  });
  it('C80: the board has three small buttons, Calendar, Events and Today, each to its own page (no single "Open my schedule")', () => {
    const opened: string[] = [];
    act(() => { root.render(<div className="cm-r3-screen"><AgendaBoard items={[]} now={NOW} place={place} onWalk={() => undefined} onOpen={(r) => opened.push(r)} /></div>); });
    expect(q('[data-testid="cm-board-primary"]')).toBeNull();
    expect(container.textContent).not.toContain('Open my schedule');
    for (const k of ['calendar', 'events', 'today']) act(() => { (q(`[data-testid="cm-board-${k}"]`) as HTMLButtonElement).click(); });
    expect(opened).toEqual(['/portal/schedule', '/portal/events', '/portal/today?stay=1']);
  });
  it('Coming up shows "‹day› · time · ‹building›" with Walk there; nothing when empty', () => {
    const walks: string[] = [];
    act(() => { root.render(<ComingUpAgenda items={comingUp({ sessions: [cls()], events: [], bookings: [], now: NOW })} place={place} onWalk={(id) => walks.push(id)} />); });
    expect(q('[data-testid="cm-cc-coming-agenda"]')!.textContent).toContain('Tue Oct 27 · 6:30 PM · Classroom');
    act(() => { (q('.cm-ag-walk') as HTMLButtonElement).click(); });
    expect(walks).toEqual(['lecture']);
    act(() => { root.render(<ComingUpAgenda items={[]} place={place} onWalk={() => undefined} />); });
    expect(q('[data-testid="cm-cc-coming-agenda"]')).toBeNull();
  });
});

it('the Schedule page puts a booked session on its Central day, opening its room, styled as booked', () => {
  const s = buildSchedule([], [], null, new Date(2026, 9, 26), [], [bk({ start_at: '2026-10-28T02:00:00Z' })]); // Tue Oct 27, 9 PM CDT
  const day = s[dkey(new Date(2026, 9, 27))];
  expect(day.map((e) => [e.kind, e.title, e.href])).toEqual([['session', 'Pair on STORY-001', '/portal/rooms/r1']]);
  expect(itemClass(day[0])).toBe('booked');
});
