/**
 * WP-5, people and rooms: Who's here (staff first, first names with their level, eight at most then "+N more", the prototype's
 * empty and failure lines), the person card as a popover (here with you, walk over, profile, the Explorer note, a partner's
 * teammate progress, a press outside), the staff card (Q7: role line, Visit the desk, Maya only for Explorers and staff), the room's
 * people (gear, level coin, rings, lanyards, tags), the desk bubble and arcade cabinets, the walk to the door and back, the room
 * tags, and the walls' real facts.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockMember: () => Promise<unknown> = () => Promise.resolve({ enrollment_id: 'e-mia', name: 'Mia Lopez', team: 'Data team', readiness: { pct: 62.4, level: 'x' },
  band_rung: 'AI Enabled II', section_progress: { week: 5 } });
jest.mock('../../../services/orgApi', () => ({ ...jest.requireActual('../../../services/orgApi'), getOrgMember: () => mockMember() }));

/* eslint-disable import/first */
import WhoIsHere from '../WhoIsHere';
import PersonPop from '../PersonPop';
import { useStaffPop, placeName } from '../StaffPop';
import { openStaffCard, staffRole } from '../staffCard';
import { Figure } from '../interior/Figure';
import BuildingInterior from '../interior/BuildingInterior';
import CampusInside from '../interior/CampusInside';
import { doorLabel } from '../interior/roomModel';
import { Arcade, SprintWall, ScheduleBoard } from '../interior/RoomWalls';
import { scheduleRows, classroomLine, eventBanner, sprintOf } from '../interior/roomWallFacts';
import { popPosition } from '../usePopover';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { BuildingId } from '../campusMap';
import type { CampusPerson } from '../campusApi';
import type { StaffDesk } from '../campusPeopleApi';
import { levelOfRung } from '../../../services/bandLadder';
/* eslint-enable import/first */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const B = [...CAMPUS_BUILDINGS];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (el: React.ReactElement) => act(() => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const person = (id: string, name: string, rung?: string): CampusPerson => ({ enrollment_id: id, display_name: name, avatar_url: null, can_message: true, rung_name: rung });
const desk = (id: 'reese' | 'dara' | 'maya', building: string, on = true): StaffDesk =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), title: `${id[0].toUpperCase() + id.slice(1)} desk`, building, ai: true, on_duty: on, enrollment_id: null, opens: null, prompts: ['How do I start?'] });

describe("Who's here (renderWho)", () => {
  it('staff first with STAFF, then first names with their level; the header counts people, then "+ staff"', () => {
    const staff: string[] = [];
    render(<WhoIsHere presence={{ count: 2, people: [person('a', 'Mia Lopez', 'AI Enabled II'), { anonymous: true }] }} error={false} desks={[desk('reese', 'commons')]}
      onStaff={(id) => staff.push(id)} onPick={() => undefined} onMore={() => undefined} />);
    expect(q('.cm-who h3')!.textContent).toBe('Who’s here · 2 + staff');
    const chips = Array.from(document.querySelectorAll('.cm-who-chips li'));
    expect(chips[0].textContent).toBe('RReeseSTAFF');
    expect(chips[1].textContent).toBe(`MLMiaLv ${levelOfRung('AI Enabled II')}`);
    expect(q('[data-testid="cm-who-more"]')!.textContent).toBe('+1 more');
    act(() => { q('[data-testid="cm-who-staff-reese"]')!.click(); });
    expect(staff).toEqual(['reese']);
  });
  it('eight names at most; the rest is "+N more", which opens the peek', () => {
    const more: number[] = [];
    const ppl = Array.from({ length: 11 }, (_, i) => person(`p${i}`, `Person${i} X`));
    render(<WhoIsHere presence={{ count: 11, people: ppl }} error={false} onPick={() => undefined} onMore={(at) => more.push(at.x)} />);
    expect(document.querySelectorAll('.cm-person')).toHaveLength(8);
    act(() => { q('[data-testid="cm-who-more"]')!.click(); });
    expect(q('[data-testid="cm-who-more"]')!.textContent).toBe('+3 more');
    expect(more).toHaveLength(1);
  });
  it('empty, failed, and without presence (staff only)', () => {
    render(<WhoIsHere presence={{ count: 0, people: [] }} error={false} />);
    expect(q('[data-testid="cm-who-quiet"]')!.textContent).toBe('Nobody yet. You’re first in.');
    render(<WhoIsHere presence={undefined} error />);
    expect(q('[data-testid="cm-who-broken"]')!.textContent).toBe('⚠ Can’t load who’s here right now — that isn’t the same as nobody being here.');
    render(<WhoIsHere presence={undefined} error={false} peopleHidden desks={[desk('dara', 'library')]} />);
    expect(q('[data-testid="cm-who-quiet"]')).toBeNull();
    expect(q('[data-testid="cm-who-staff-dara"]')).not.toBeNull();
  });
});

describe('the person card (pcard)', () => {
  const base = { place: 'Library', audience: 'member' as const, onClose: () => undefined, onWalkOver: () => undefined };
  it('here with you: no Walk over; elsewhere: "In <building>" and Walk over; Profile always', () => {
    render(<PersonPop {...base} person={person('a', 'Mia Lopez')} here />);
    expect(q('[data-testid="cm-person-where"]')!.textContent).toBe('📍 Here with you');
    expect(q('[data-testid="cm-walk-over"]')).toBeNull();
    expect(q('[data-testid="cm-person-profile"]')!.getAttribute('href')).toBe('/portal/community/people');
    render(<PersonPop {...base} person={person('a', 'Mia Lopez')} here={false} />);
    expect(q('[data-testid="cm-person-where"]')!.textContent).toBe('📍 In Library');
    expect(q('[data-testid="cm-walk-over"]')).not.toBeNull();
  });
  it('cannot message: the cohort note points to Reese when he is on duty; an Explorer gets the Explorer note', () => {
    const blocked = { ...person('a', 'Mia Lopez'), can_message: false };
    render(<PersonPop {...base} person={blocked} here={false} reeseOnDuty />);
    expect(q('[data-testid="cm-message-note"]')!.textContent).toBe('You can only message people in your cohort. Walk over to their room, or ask Reese to connect you.');
    render(<PersonPop {...base} audience="explorer" person={blocked} here={false} />);
    expect(q('[data-testid="cm-message-note"]')!.textContent).toBe('As an Explorer you can message other Explorers and staff. Enroll to message your cohort.');
  });
  it('a partner sees their teammate\'s real progress, no Message or Wave; a failed read says so', async () => {
    render(<PersonPop {...base} audience="business" person={person('e-mia', 'Mia Lopez')} here={false} />);
    await flush();
    expect(q('[data-testid="cm-teammate-sub"]')!.textContent).toBe('Data team · Week 5');
    expect(q('[data-testid="cm-teammate-kpis"]')!.textContent).toContain('62%Readiness');
    expect(q('[data-testid="cm-wave"]')).toBeNull();
    expect(q('[data-testid="cm-teammate-progress"]')!.getAttribute('href')).toBe('/portal/company');
    mockMember = () => Promise.reject(Object.assign(new Error('x'), { name: 'NetworkError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    act(() => root.unmount()); root = createRoot(container);
    render(<PersonPop {...base} audience="business" person={person('e-x', 'Ann B')} here={false} />);
    await flush();
    expect(container.textContent).toContain('Their progress could not be loaded just now.');
    warn.mockRestore();
  });
  it('opens at the press, clamped clear of the top bar and the edges; a press outside closes it', () => {
    jest.useFakeTimers();
    expect(popPosition({ x: 5, y: 5 }, 300)).toEqual({ left: 10, top: 76 });
    let closed = 0;
    render(<PersonPop {...base} person={person('a', 'Mia Lopez')} here={false} at={{ x: 400, y: 200 }} onClose={() => { closed += 1; }} />);
    expect(q('[data-testid="cm-person-card"]')!.style.left).toBe('250px');
    act(() => { jest.runAllTimers(); });
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(closed).toBe(1);
    jest.useRealTimers();
  });
});

describe('the staff card (Q7)', () => {
  const walked: string[] = [];
  function Host({ audience = 'member' as const, here = null as BuildingId | null }): React.ReactElement {
    const s = useStaffPop({ desks: [desk('reese', 'commons'), desk('maya', 'gate')], audience, buildings: B, workplace: false, hereId: here, walk: (id) => walked.push(id) });
    return <>{s.node}</>;
  }
  it('opens from the bus with the role line and where the desk is; Visit the desk walks there and closes it', () => {
    render(<Host />);
    act(() => openStaffCard('reese', { x: 300, y: 300 }));
    expect(q('[data-testid="cm-staff-card"]')!.textContent).toContain('AI mentor · Student success');
    expect(q('[data-testid="cm-staff-card"]')!.textContent).toContain('Reese desk in the Community Lounge');
    act(() => { q('[data-testid="cm-desk-visit-reese"]')!.click(); });
    expect(walked).toEqual(['commons']);
    expect(q('[data-testid="cm-staff-card"]')).toBeNull();
  });
  it('no Visit when you are there; Maya opens only for Explorers and staff', () => {
    render(<Host here="commons" />);
    act(() => openStaffCard('reese'));
    expect(q('[data-testid="cm-desk-visit-reese"]')).toBeNull();
    act(() => openStaffCard('maya'));
    expect(q('[data-testid="cm-desk-maya"]')).toBeNull();
    expect(staffRole({ id: 'dara', title: 'x' }, true)).toBe('AI guide · Learning & certification');
    expect([placeName(B.find((b) => b.kind === 'gate'), false), placeName(undefined, true)]).toEqual(['the Main Gate', 'the Plaza']);
  });
  it('focus goes into the card and, on close, back to what opened it (found by the e2e: a second Esc must still reach the map)', () => {
    render(<><button type="button" data-testid="opener">Reese</button><Host /></>);
    q('[data-testid="opener"]')!.focus();
    act(() => openStaffCard('reese'));
    expect(document.activeElement).toBe(q('[data-testid="cm-staff-card"]'));
    act(() => { (q('[data-testid="cm-staff-card"] .cm-pc-x') as HTMLButtonElement).click(); });
    expect(q('[data-testid="cm-staff-card"]')).toBeNull();
    expect(document.activeElement).toBe(q('[data-testid="opener"]'));
  });
});

describe('the room (personSVG, the desk, the cabinets, the door)', () => {
  const svg = (el: React.ReactElement) => render(<svg>{el}</svg>);
  it('a figure wears its gear, carries its level coin, the right ring, a lanyard where asked; the tag is pinned only for you and a team', () => {
    svg(<Figure x={100} y={200} s={1} pose="sit" lanyard p={{ key: 'a', name: 'Mia Lopez', initials: 'ML', photo: null, levelN: 4, gear: { head: 'cap', face: 'shades', ride: 'board' } as never, tone: 'red' }} />);
    expect(document.querySelectorAll('[data-gear]').length).toBe(2);
    expect(q('[data-testid="cm-fig-coin"]')!.textContent).toBe('4');
    expect(q('[data-testid="cm-fig-lanyard"]')).not.toBeNull();
    expect(q('.nm')!.getAttribute('class')).toBe('nm');
    svg(<Figure x={100} y={200} s={1} pose="sit" p={{ key: 'b', name: 'Ann B', initials: 'AB', photo: null, team: true, tone: 'red' }} />);
    expect(q('.nm')!.getAttribute('class')).toBe('nm is-pinned');
    expect(q('.cm-fig-ring')!.getAttribute('stroke')).toBe('var(--cm-art-team)');
    svg(<Figure x={100} y={200} s={1} pose="stand" p={{ key: 'c', name: 'Reese', initials: 'RE', photo: null, staff: true, tone: 'gold' }} />);
    expect(q('.cm-fig-ring')!.getAttribute('stroke')).toBe('var(--cm-art-gold-ring)');
  });
  const you = { key: 'you', name: 'You', initials: 'ME', photo: null, you: true, tone: 'red' };
  it('"Ask <name> anything" opens the staff card; a cabinet opens its game', () => {
    const desks: number[] = [];
    render(<BuildingInterior id="commons" people={[]} you={you} doorSign="YOUR PAGE →" name="Commons" onAir={false} desk={{ name: 'Reese', initials: 'RE', title: 'Mentor desk' }} onDesk={(at) => desks.push(at.x)} />);
    act(() => { q('[data-testid="cm-inside-ask"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 42, clientY: 9 })); });
    expect(desks).toEqual([42]);
    const games: string[] = [];
    render(<BuildingInterior id="arcade" people={[]} you={you} doorSign="YOUR PAGE →" name="Game Room" onAir={false} onGame={(g) => games.push(g)} />);
    act(() => { q('[data-testid="cm-cab-launch-lab"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(games).toEqual(['launch-lab']);
  });
  it('going out: you stand at the door; back from a page: you start there and walk to your seat; reduce motion: never', async () => {
    render(<BuildingInterior id="library" people={[]} you={you} doorSign="x" name="Library" onAir={false} going />);
    expect(q('[data-testid="cm-you-walk"]')!.getAttribute('data-at-door')).toBe('true');
    const frames: FrameRequestCallback[] = [];
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    act(() => root.unmount()); root = createRoot(container);
    render(<BuildingInterior id="library" people={[]} you={you} doorSign="x" name="Library" onAir={false} fromDoor />);
    expect(q('[data-testid="cm-you-walk"]')!.getAttribute('data-at-door')).toBe('true');
    act(() => { frames.shift()!(0); }); act(() => { frames.shift()!(16); });
    expect(q('[data-testid="cm-you-walk"]')!.getAttribute('data-at-door')).toBe('false');
    raf.mockRestore();
    render(<BuildingInterior id="library" people={[]} you={you} doorSign="x" name="Library" onAir={false} going reduceMotion />);
    expect(q('[data-testid="cm-you-walk"]')!.getAttribute('data-at-door')).toBe('false');
  });
  it('the door sign\'s lock, the glass, and the corner tags (preview green, a partner\'s teal)', () => {
    expect(doorLabel('explorer', 'locked')).toBe('MEMBERS ONLY 🔒');
    const lib = B.find((b) => b.id === 'library')!;
    const inside = (audience: 'explorer' | 'business', access: 'locked' | 'preview' | 'open') => render(<CampusInside building={lib} buildingName="Library" audience={audience} access={access}
      onAir={false} reduceMotion onStepOutside={() => undefined} />);
    inside('explorer', 'locked');
    expect(q('.cm-in-lock b')!.textContent).toBe('🔒 Members only');
    inside('explorer', 'preview');
    expect(q('[data-testid="cm-inside-tag"]')!.getAttribute('class')).toBe('cm-in-tag is-preview');
    inside('business', 'open');
    expect(q('[data-testid="cm-inside-tag"]')!.textContent).toBe('PARTNER VIEW · YOUR TEAM IN TEAL');
  });
});

describe('the walls (real facts only)', () => {
  const now = new Date('2026-10-22T15:00:00Z'); // Thursday 10 AM Central
  const session = (date: string, status: 'scheduled' | 'live' = 'scheduled') => ({ id: 's', session_number: 5, title: 'Build Day', session_date: date, start_time: '18:30:00',
    end_time: '20:00', status, meeting_link: null, meeting_provider: null, timezone: 'America/Chicago', room_id: null });
  const event = (iso: string, rsvp: string | null) => ({ id: 'e', title: 'Open House', starts_at: iso, registration_url: rsvp } as never);
  it('the schedule board: today\'s session by time, another day by date, live, the event (RSVP/OPEN), then plan steps; four rows', () => {
    const stop = (t: string, done: boolean) => ({ key: t, title: t, route: '/x', buildingId: null, done, type: '', label: '', minutes: null, points: 0, ref: null, cardId: null });
    const rows = scheduleRows({ session: session('2026-10-22'), event: event('2026-10-29T23:00:00Z', 'https://x'), stops: [stop('Lesson', false), stop('Quiz', true), stop('More', false)], now });
    expect(rows).toEqual([{ time: '18:30', title: 'Build Day', status: 'ON TIME' }, { time: 'OCT 29', title: 'Open House', status: 'RSVP' },
      { time: 'PLAN', title: 'Lesson', status: 'TO DO' }, { time: 'PLAN', title: 'Quiz', status: 'DONE' }]);
    expect(scheduleRows({ session: session('2026-10-24', 'live'), event: event('2026-10-01T00:00:00Z', null), now })).toEqual([{ time: 'OCT 24', title: 'Build Day', status: 'LIVE' }]);
    // a past session (stale data, seen in the local screenshots: "APR 2 ... ON TIME" on Oct 23) is left off
    expect(scheduleRows({ session: session('2026-04-02'), now })).toEqual([]);
    expect(classroomLine(session('2026-10-22'))).toBe('Session 5 · Build Day');
    expect([eventBanner(event('2026-10-29T23:00:00Z', null), now), eventBanner(event('2026-10-01T00:00:00Z', null), now)]).toEqual(['Open House · OCT 29', null]);
  });
  it('the sprint wall: tasks by status, YOU on the one in progress; nothing to show is null', () => {
    const tree = { name: 'PropertyPulse', lists: [{ tasks: [{ id: 't1', story_id: 'STORY-001', title: 'Login', status: 'complete' }, { id: 't2', story_id: 'STORY-002', title: 'Search', status: 'in_progress' },
      { id: 't3', story_id: null, title: 'Export', status: 'not_started' }] }] };
    const s = sprintOf(tree, true)!;
    expect(s.cols.map((c) => [c.title, c.tasks.map((t) => `${t.id}${t.you ? '*' : ''}`)])).toEqual([['BACKLOG', ['t3']], ['IN PROGRESS', ['STORY-002*']], ['BLOCKED', []], ['SHIPPED', ['STORY-001']]]);
    expect(sprintOf({ name: null, lists: [] }, true)).toBeNull();
    render(<svg><SprintWall sprint={s} /></svg>);
    expect(container.textContent).toContain('BUILD BOARD · PROPERTYPULSE');
    expect(container.textContent).toContain('YOU');
  });
  it('the arcade shows your best this week or a dash; the board shows its rows or says nothing else is on', () => {
    render(<svg><Arcade best={{ 'byte-chase': 1250 }} /></svg>);
    expect(q('[data-testid="cm-cab-best-byte-chase"]')!.textContent).toBe('BEST 1,250');
    expect(q('[data-testid="cm-cab-best-launch-lab"]')!.textContent).toBe('BEST —');
    expect(container.textContent).toContain('▶ TAP TO PLAY');
    render(<svg><ScheduleBoard day="THURSDAY" rows={[]} /></svg>);
    expect(container.textContent).toBe('TODAY · THURSDAYNOTHING ELSE ON TODAY');
  });
});
