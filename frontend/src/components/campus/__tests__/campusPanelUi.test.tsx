/**
 * WP-4 on screen: the Wayfinder (opens on "/" and Ctrl/Cmd+K, never while typing; arrows, Enter, Esc, backdrop; focus comes back;
 * the no-results line), the concierge's new sections (urgent card, Right now with its map hover, the directory, a partner's team,
 * "I'm running late", the help desk roles), the room a pick flashes, and the points feedback (unlock, welcome back, the streak
 * claimed at the gate, never in a view-as session).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockClaim: () => Promise<unknown> = () => Promise.resolve({ awarded: true, points: 5, streak: { count: 3, claimed_today: true, week: [], total_streak_points: 5, next_points: 0 } });
let mockClaims = 0;
jest.mock('../../../services/onboardingApi', () => ({
  ...jest.requireActual('../../../services/onboardingApi'),
  claimDailyStreak: () => { mockClaims += 1; return mockClaim(); },
}));

/* eslint-disable import/first */
import Wayfinder from '../home/Wayfinder';
import CampusConcierge from '../home/CampusConcierge';
import type { ConciergeProps } from '../home/CampusConcierge';
import BuildingCard from '../BuildingCard';
import CampusGate from '../home/CampusGate';
import CampusWorldMap from '../CampusWorldMap';
import { useUnlockCheer, useWelcomeBack, useGateStreak } from '../home/useHomeCheers';
import { openWayfinder } from '../wayfinderHost';
import { onCheer } from '../campusCheerBus';
import type { Cheer } from '../campusCheerBus';
import { onPointsEarned } from '../../../services/pointsFx';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { BuildingId } from '../campusMap';
import type { WfContext, WfItem } from '../wayfinderIndex';
import type { LookItem } from '../campusApi';
import type { StaffDesk } from '../campusPeopleApi';
import { VIEW_AS_TOKEN_KEY } from '../../../utils/participantToken';
/* eslint-enable import/first */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => undefined);

const B = [...CAMPUS_BUILDINGS];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); window.localStorage.clear(); window.sessionStorage.clear(); mockClaims = 0; });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
const render = (el: React.ReactElement) => act(() => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = window) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const desk = (id: 'reese' | 'dara', building: string): StaffDesk => ({ id, name: id === 'reese' ? 'Reese' : 'Dara', title: `${id} desk`, building, ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] });

describe('the Wayfinder', () => {
  const ctx: WfContext = { audience: 'member', workplace: false, buildings: B, accessOf: () => 'open', presence: null, desks: [], urgent: null, suggested: [] };
  let picked: WfItem[] = [];
  const mount = () => { picked = []; render(<><button type="button" data-testid="opener">x</button><input data-testid="other" /><Wayfinder ctx={ctx} onPick={(it) => picked.push(it)} /></>); };

  it('"/" opens it (not while typing elsewhere), Ctrl+K too; Esc closes it and gives focus back', () => {
    jest.useFakeTimers();
    mount();
    let opened = false;
    act(() => { opened = openWayfinder(); }); // a Wayfinder is mounted
    expect(opened).toBe(true);
    act(() => { jest.runAllTimers(); });
    key('Escape', {}, q('[data-testid="cm-wf-input"]')!);
    expect(q('[data-testid="cm-wayfinder"]')).toBeNull();
    key('/', {}, q('[data-testid="other"]')!); // typing in a box: "/" is just a slash
    expect(q('[data-testid="cm-wayfinder"]')).toBeNull();
    q('[data-testid="opener"]')!.focus();
    key('k', { ctrlKey: true });
    act(() => { jest.runAllTimers(); });
    expect(document.activeElement).toBe(q('[data-testid="cm-wf-input"]'));
    key('Escape', {}, q('[data-testid="cm-wf-input"]')!);
    act(() => { jest.runAllTimers(); });
    expect(document.activeElement).toBe(q('[data-testid="opener"]'));
    key('/');
    expect(q('[data-testid="cm-wayfinder"]')).not.toBeNull();
  });

  it('empty: every building, grouped; typing filters; arrows move, Enter picks; a miss says so', () => {
    mount();
    key('/');
    expect(q('[role="group"][aria-label="All buildings"]')).not.toBeNull();
    // the box is new each time the Wayfinder opens, so it is looked up on every keystroke
    const type = (v: string) => act(() => {
      const box = q('[data-testid="cm-wf-input"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, v);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    type('standup');
    expect(q('.cm-wf-item.is-sel b')!.textContent).toBe('Career Center');
    const input = q('[data-testid="cm-wf-input"]') as HTMLInputElement;
    expect(input.getAttribute('aria-activedescendant')).toBe(q('.cm-wf-item.is-sel')!.id);
    key('ArrowDown', {}, input);
    key('Enter', {}, input);
    expect(picked).toHaveLength(1);
    expect(q('[data-testid="cm-wayfinder"]')).toBeNull();
    key('/');
    type('zzzz');
    expect(q('[data-testid="cm-wf-none"]')!.textContent).toBe('No building for “zzzz”. Try “class”, “projects”, “points” or “standup”.');
  });

  it('a press on the backdrop closes; none mounted = openWayfinder says false', () => {
    mount();
    key('/');
    act(() => { q('[data-testid="cm-wayfinder"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(q('[data-testid="cm-wayfinder"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    expect(openWayfinder()).toBe(false);
  });
});

describe('the concierge\'s new sections', () => {
  const base: ConciergeProps = { audience: 'member', firstName: 'Ali', buildings: B, accessOf: () => 'open', workplaceNames: false, presence: { commons: { count: 2, people: [] } },
    presenceError: false, desks: [desk('reese', 'commons'), desk('dara', 'library')], stops: null, live: null, tourStops: null, touring: null,
    tourProgress: { paused: null, toured: false }, now: new Date('2026-10-22T15:00:00Z'), onWalk: () => undefined, onTour: () => undefined, onOpen: () => undefined };
  const log: string[] = [];
  const cb = { onWalk: (id: BuildingId) => log.push(`walk:${id}`), onRun: (id: BuildingId) => log.push(`run:${id}`), onHover: (id: BuildingId | null) => log.push(`hover:${id}`), onOpen: (r: string) => log.push(`open:${r}`) };
  const click = (s: string) => act(() => { q(s)!.click(); });
  beforeEach(() => { log.length = 0; });

  it('the urgent card: Run there runs, Skip the walk opens the page; "I\'m running late" runs there too', () => {
    render(<CampusConcierge {...base} {...cb} urgent={{ buildingId: 'lecture', title: 'Live class starts in 4 min', detail: 'Build Day · Classroom', route: '/portal/sessions' }} />);
    expect(q('[data-testid="cm-cc-urgent"]')!.textContent).toContain('Live class starts in 4 min');
    expect(q('[data-testid="cm-cc-lead"]')!.textContent).toBe('Live class starts in a few minutes.');
    click('[data-testid="cm-cc-urgent-run"]');
    click('[data-testid="cm-cc-urgent-skip"]');
    act(() => { Array.from(document.querySelectorAll('[data-testid="cm-cc-chips"] button')).find((b) => b.textContent === 'I’m running late')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(log).toEqual(['run:lecture', 'open:/portal/sessions', 'run:lecture']);
  });

  it('Right now: a row walks, hovering it lifts the building; the directory lists every building; late with nothing urgent walks to the Schedule', () => {
    render(<CampusConcierge {...base} {...cb} />);
    const row = q('[data-testid="cm-cc-now"] .cm-sg')!;
    expect(row.textContent).toContain('Drop into the Community Lounge');
    act(() => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    act(() => { row.click(); });
    act(() => { row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(log).toEqual(['hover:commons', 'walk:commons', 'hover:null']);
    click('[data-testid="cm-cc-dir-toggle"]');
    expect(document.querySelectorAll('[data-testid="cm-cc-dir"] button')).toHaveLength(B.filter((b) => b.kind !== 'gate').length);
    expect(q('[data-testid="cm-cc-dir-toggle"]')!.textContent).toBe(`Campus directory · all ${B.filter((b) => b.kind !== 'gate').length} buildings`);
    log.length = 0;
    act(() => { Array.from(document.querySelectorAll('[data-testid="cm-cc-chips"] button')).find((b) => b.textContent === 'I’m running late')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(log).toEqual(['walk:tower']);
    expect(q('[data-testid="cm-cc-desk-reese"]')!.textContent).toContain('Mentor');
  });

  it('a partner: welcomed, no help desk, their team on campus (or a plain note), "See where your team…"', () => {
    render(<CampusConcierge {...base} {...cb} audience="business" />);
    expect(q('[data-testid="cm-cc-greeting"]')!.textContent).toBe('Welcome, Ali.');
    expect(q('[data-testid="cm-cc-helpdesk"]')).toBeNull();
    expect(q('[data-testid="cm-cc-team"]')!.textContent).toBe('None of your team is on campus right now.');
    expect(container.textContent).toContain('See where your team…');
    expect(q('[data-testid="cm-cc-pulse"]')!.getAttribute('data-tone')).toBe('team');
  });
});

describe('the gate\'s streak line (Q9)', () => {
  const gate = (streak: number, streakPoints: number | null) => render(<CampusGate audience="member" firstName="Ali" fullName="Ali M" initials="AM" rung={null} points={null}
    streak={streak} streakPoints={streakPoints} online={null} workplace={false} hasTour reduceMotion now={new Date()} onEnter={() => undefined} />);
  it('unclaimed: what walking in claims, the server\'s points; a first day says so; claimed: the streak only', () => {
    gate(2, 5);
    expect(q('[data-testid="cm-gate-streak"]')!.textContent).toBe('🔥2-day streak — tap in to keep it going (+5 pts)');
    gate(0, 5);
    expect(q('[data-testid="cm-gate-streak"]')!.textContent).toBe('🔥Tap in to start a streak (+5 pts)');
    gate(0, null);
    expect(q('[data-testid="cm-gate-streak"]')).toBeNull();
  });
});

describe('the map and the card', () => {
  it('a hovered Right now row lifts its building; a Wayfinder room pick flashes in the card', () => {
    render(<CampusWorldMap buildings={B} accessOf={() => 'open'} workplaceNames={false} reduceMotion onArrive={() => undefined} hover="library" />);
    expect(q('[data-testid="cm-bld-library"]')!.getAttribute('class')).toContain('is-hl');
    expect(q('[data-testid="cm-bld-commons"]')!.getAttribute('class')).not.toContain('is-hl');
    const lib = B.find((b) => b.id === 'library')!;
    const route = lib.rooms.find((r) => !r.admin && !r.planned)!.route;
    render(<BuildingCard building={lib} access="open" workplaceNames={false} onClose={() => undefined} onNavigate={() => undefined} flashRoute={route} />);
    expect(document.querySelectorAll('.cm-room.is-flash')).toHaveLength(1);
    expect(q('.cm-room.is-flash')!.getAttribute('href')).toBe(route);
  });
});

describe('points feedback', () => {
  let cheers: Cheer[] = [];
  let off: () => void = () => undefined;
  beforeEach(() => { cheers = []; off = onCheer((c) => cheers.push(c)); });
  afterEach(() => off());
  const item = (id: string, unlocked: boolean): LookItem => ({ id, name: id === 'cap' ? 'Cohort cap' : 'Shades', slot: 'head', threshold: 150, unlocked });

  it('an unlock since the last look cheers, with a Locker button; the first look never does', () => {
    let lockers = 0;
    function U({ c }: { c: LookItem[] }): null { useUnlockCheer(c, () => { lockers += 1; }); return null; }
    render(<U c={[item('cap', true), item('shades', false)]} />);
    expect(cheers).toEqual([]);
    render(<U c={[item('cap', true), item('shades', true)]} />);
    expect(cheers).toHaveLength(1);
    expect(cheers[0]).toMatchObject({ big: '🕶️', title: 'Unlocked: Shades', detail: 'Earned at 150 pts · wear it from your locker' });
    act(() => { cheers[0].action!.run(); });
    expect(lockers).toBe(1);
  });

  it('welcome back: past the gate, to where you were last time; Go back in walks there; never when you are already somewhere', () => {
    jest.useFakeTimers();
    window.localStorage.setItem('colaberry.campus.lastB.member', 'library');
    const went: string[] = [];
    function W({ here, skipped }: { here: BuildingId | null; skipped: boolean }): null { useWelcomeBack({ audience: 'member', buildings: B, workplace: false, skippedGate: skipped, here, goTo: (id) => went.push(id) }); return null; }
    render(<W here={null} skipped />);
    act(() => { jest.advanceTimersByTime(400); });
    expect(cheers[0]).toMatchObject({ big: '👋', title: 'Welcome back', detail: 'You were last at Library' });
    act(() => { cheers[0].action!.run(); });
    expect(went).toEqual(['library']);
    render(<W here="commons" skipped />);
    expect(window.localStorage.getItem('colaberry.campus.lastB.member')).toBe('commons');
    act(() => root.unmount()); root = createRoot(container); cheers = [];
    render(<W here="studio" skipped />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(cheers).toEqual([]);
  });

  it('the gate claims today\'s streak once (+n pts, the burst); never claimed already, never in a view-as session; a failure stays quiet', async () => {
    const earned: number[] = [];
    const offPts = onPointsEarned(({ delta }) => earned.push(delta));
    let claim: () => Promise<void> = async () => undefined;
    const streaks: number[] = [];
    function G({ claimed }: { claimed: boolean | null }): null { claim = useGateStreak({ audience: 'member', claimedToday: claimed, onStreak: (s) => streaks.push(s.count), onPoints: () => undefined }); return null; }
    render(<G claimed={false} />);
    await act(async () => { await claim(); });
    expect([mockClaims, streaks, earned]).toEqual([1, [3], [5]]);
    expect(cheers[0]).toMatchObject({ title: '+5 pts', detail: '🔥 Day 3 streak claimed' });
    render(<G claimed />);
    await act(async () => { await claim(); });
    window.sessionStorage.setItem(VIEW_AS_TOKEN_KEY, 'x');
    render(<G claimed={false} />);
    await act(async () => { await claim(); });
    expect(mockClaims).toBe(1);
    window.sessionStorage.clear();
    mockClaim = () => Promise.reject(Object.assign(new Error('down'), { name: 'NetworkError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await act(async () => { await claim(); });
    expect(warn.mock.calls[0][0]).toContain('campus_gate_streak_claim_failed');
    warn.mockRestore(); offPts();
    await flush();
  });
});
