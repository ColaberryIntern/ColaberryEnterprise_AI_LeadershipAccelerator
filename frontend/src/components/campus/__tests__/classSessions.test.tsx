/**
 * C32 (v7 R5): the Classroom's Live classes and replays (moved from /portal/rooms). The next class is a live one first, else the
 * soonest scheduled one from today; Check in uses the existing check-in flow, Join the live page; a broadcast class walks to the
 * Events Hall; replays are completed sessions, newest first, with ▶ Replay only when there is a recording. /portal/rooms has no
 * class list, only the link to the Classroom.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockOpenRecording = jest.fn(() => Promise.resolve());
jest.mock('../../../services/roomsApi', () => ({ openSessionRecording: (...a: unknown[]) => mockOpenRecording(...(a as [])) }));
jest.mock('../../../services/onboardingApi', () => ({ fetchMySessions: jest.fn() }));

// eslint-disable-next-line import/first
import ClassSessions from '../classroom/ClassSessions';
// eslint-disable-next-line import/first
import { classWhen, nextClass, replaysOf } from '../classroom/classSessionsModel';
// eslint-disable-next-line import/first
import type { MySession } from '../../../services/onboardingApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const s = (o: Partial<MySession>): MySession => ({ id: 's', session_number: 1, title: 'Build Day', session_date: '2026-10-26', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled', room_id: null, ...o });
const NOW = new Date('2026-10-26T15:00:00Z'); // Monday 10:00 AM Central

describe('the rules', () => {
  it('the next class: live first; else the soonest scheduled from today on; past or cancelled never', () => {
    const list = [s({ id: 'past', session_date: '2026-10-19' }), s({ id: 'later', session_date: '2026-10-28' }), s({ id: 'soon', session_date: '2026-10-26' }), s({ id: 'x', status: 'cancelled', session_date: '2026-10-26' })];
    expect(nextClass(list, NOW)?.id).toBe('soon');
    expect(nextClass([...list, s({ id: 'live', status: 'live', session_date: '2026-10-19' })], NOW)?.id).toBe('live');
    expect(nextClass([s({ status: 'completed' })], NOW)).toBeNull();
  });
  it('replays are completed sessions, newest first', () => {
    const r = replaysOf([s({ id: 'a', status: 'completed', session_date: '2026-10-12', session_number: 1 }), s({ id: 'b', status: 'completed', session_date: '2026-10-19', session_number: 2 }), s({ id: 'c' })]);
    expect(r.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('says Tonight / Today / Tomorrow / the date, in Central', () => {
    expect(classWhen(s({}), NOW)).toBe('Tonight 6:30 PM CDT');
    expect(classWhen(s({ start_time: '10:00:00' }), NOW)).toBe('Today 10:00 AM CDT');
    expect(classWhen(s({ session_date: '2026-10-27' }), NOW)).toBe('Tomorrow 6:30 PM CDT');
    expect(classWhen(s({ session_date: '2026-10-29' }), NOW)).toBe('Thu, Oct 29 · 6:30 PM CDT');
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockOpenRecording.mockReset(); mockOpenRecording.mockImplementation(() => Promise.resolve()); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (sel: string) => container.querySelector(sel);
const render = (el: React.ReactElement) => act(() => { root.render(el); });

describe('the section', () => {
  it('the next class has Check in (the check-in flow); replays with a recording have ▶ Replay, without one just "Done"', () => {
    const opened: string[] = [];
    render(<ClassSessions sessions={[s({ id: 'n1', title: 'Week 1 Build Day' }), s({ id: 'r1', status: 'completed', session_date: '2026-10-19', recording_url: '/api/rec/1' }), s({ id: 'r2', status: 'completed', session_date: '2026-10-12' })]} onOpen={(r) => opened.push(r)} now={NOW} />);
    expect(q('[data-testid="cm-cls-next"]')!.textContent).toContain('Tonight 6:30 PM CDT');
    act(() => { (q('[data-testid="cm-cls-checkin"]') as HTMLButtonElement).click(); });
    expect(opened).toEqual(['/portal/class-checkin/n1']);
    const rows = Array.from(container.querySelectorAll('[data-testid="cm-cls-replays"] li'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Done · replay available');
    expect(rows[1].querySelector('button')).toBeNull();
    act(() => { (rows[0].querySelector('button') as HTMLButtonElement).click(); });
    expect(mockOpenRecording).toHaveBeenCalledWith('/api/rec/1', 'Build Day');
  });
  it('live: Join goes to the live page; a broadcast class says it is live in the Events Hall and walks there', () => {
    const opened: string[] = [];
    render(<ClassSessions sessions={[s({ id: 'L', status: 'live' })]} onOpen={(r) => opened.push(r)} now={NOW} />);
    act(() => { (q('[data-testid="cm-cls-join"]') as HTMLButtonElement).click(); });
    render(<ClassSessions sessions={[s({ id: 'L', status: 'live' })]} onOpen={(r) => opened.push(r)} broadcastRoute="/portal/live/L" now={NOW} />);
    expect(q('[data-testid="cm-cls-next"]')!.textContent).toContain('Your class is live in the Events Hall');
    expect(q('[data-testid="cm-cls-join"]')!.textContent).toBe('Walk in');
    expect(opened).toEqual(['/portal/live/L']);
  });
  it('nothing scheduled says so; a failed read says so; loading renders nothing', () => {
    render(<ClassSessions sessions={[]} onOpen={() => undefined} now={NOW} />);
    expect(q('[data-testid="cm-cls"]')!.textContent).toContain('No class is scheduled yet');
    render(<ClassSessions sessions="error" onOpen={() => undefined} now={NOW} />);
    expect(q('[data-testid="cm-cls"]')!.textContent).toContain('can’t load your classes');
    render(<ClassSessions sessions={null} onOpen={() => undefined} now={NOW} />);
    expect(q('[data-testid="cm-cls"]')).toBeNull();
  });
});

it('/portal/rooms no longer lists the classes; it links to the Classroom', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../pages/portal/rooms/RoomsPage.tsx'), 'utf8');
  expect(src).not.toMatch(/Your Classes|fetchMySessions|ClassRailGroup/);
  expect(src).toContain('Your classes are in the Classroom');
  expect(src).toContain('to="/portal/classroom"');
});
