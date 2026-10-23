/**
 * C13 (round 3 Part 1): the production fixes Ali saw on 2026-10-23. Names never all caps; the Up next title is never covered; the
 * tour never reads "Stop N of N" (a pause expires after 7 days and can be dismissed); a 6-minute step never reads "~96 min"; the
 * campus count includes the Quad; the campus is drawn from the server's audience; every signed-in learner's building is recorded.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockPost = jest.fn(() => Promise.resolve());
let mockReadOnly = false;
let mockAudience: Promise<string | null> = Promise.resolve('staff');
jest.mock('../campusApi', () => ({
  ...jest.requireActual('../campusApi'),
  postCampusHere: (...a: unknown[]) => mockPost(...(a as [])),
  isReadOnlySession: () => mockReadOnly,
  fetchCampusAudience: () => mockAudience,
}));
let mockToken: string | null = 'h.e.s';
jest.mock('../../../utils/participantToken', () => ({ ...jest.requireActual('../../../utils/participantToken'), getParticipantToken: () => mockToken }));

/* eslint-disable import/first */
import { displayName, displayFirstName, nameInitials } from '../../../utils/personName';
import { UpNext, TourOffer } from '../home/NextSteps';
import { readTour, tourKey, PAUSE_TTL_MS } from '../useCampusTour';
import { minutesLeft } from '../campusPlan';
import type { PlanStop } from '../campusPlan';
import { factsAt } from '../campusFacts';
import { rightNowRows } from '../home/rightNow';
import { pulseOf } from '../home/conciergeCopy';
import { CAMPUS_BUILDINGS } from '../campusMap';
const BUILDINGS = [...CAMPUS_BUILDINGS];
import { pingCampusBuilding } from '../campusPing';
import { CAMPUS_SETTINGS_KEY, DEFAULT_CAMPUS_SETTINGS } from '../campusSettings';
import { AudienceSwitchContext } from '../campusAudienceSwitch';
import { useCampusAudience, __resetServerAudienceForTests } from '../useCampusAudience';
/* eslint-enable import/first */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement;
const render = (el: React.ReactElement) => { act(() => { root = createRoot(host); root.render(<MemoryRouter>{el}</MemoryRouter>); }); };
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); window.localStorage.clear(); mockPost.mockReset(); mockPost.mockImplementation(() => Promise.resolve()); mockReadOnly = false; mockToken = 'h.e.s'; });
afterEach(() => { act(() => root?.unmount()); root = null; host.remove(); });

const stop = (o: Partial<PlanStop>): PlanStop => ({ key: 'x', title: 'Deep Dive', route: '/portal/runtime/c1', buildingId: 'lecture', done: false, type: 'deep_dive',
  label: 'Deep Dive', minutes: 6, points: 15, ref: null, cardId: 'c1', ...o } as PlanStop);

describe('names are never all caps ("Welcome, ALI.")', () => {
  it('title-cases a name stored all upper or all lower; keeps mixed case as typed', () => {
    expect(displayName('ALI MUWWAKKIL')).toBe('Ali Muwwakkil');
    expect(displayName('jane doe')).toBe('Jane Doe');
    expect(displayName("MARY-JANE O'BRIEN")).toBe("Mary-Jane O'Brien");
    expect(displayName('DeShawn McDonald')).toBe('DeShawn McDonald');
    expect(displayName('  ')).toBe('');
    expect(displayFirstName('ALI MUWWAKKIL')).toBe('Ali');
    expect(nameInitials('ali muwwakkil')).toBe('AM');
    expect(nameInitials('')).toBe('?');
  });
});

describe('Up next: the title is never covered', () => {
  it('renders the title and the buttons on separate rows, under its own class', () => {
    render(<UpNext stops={[stop({ title: 'Deep Dive - Understanding Modern Software Development' })]} buildings={BUILDINGS} workplaceNames={false} hereId={null} onWalk={jest.fn()} onOpen={jest.fn()} />);
    const sec = $('cm-up-next')!;
    expect(sec.className).toBe('cm-upnext');
    expect($('cm-up-next-title')!.textContent).toBe('Deep Dive - Understanding Modern Software Development');
    expect($('cm-up-next-go')!.closest('.cm-upnext-actions')).not.toBeNull();
    expect($('cm-up-next-title')!.closest('.cm-upnext-actions')).toBeNull();
  });
  it('the nowrap rule that clipped it is scoped to the banner button', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'campusLive.css'), 'utf8');
    expect(css).not.toMatch(/(^|[\s}])\.cm-next\s*\{/m);
    expect(css).toMatch(/\.cm-btn\.cm-next\s*\{/);
  });
});

describe('the tour never reads "Stop N of N"', () => {
  const tour = (o: { paused: number | null; running?: number | null; toured?: boolean; onDismiss?: () => void }) => (
    <TourOffer audience="member" stops={Array.from({ length: 6 }, () => ({ buildingId: 'lecture' as const }))} buildings={BUILDINGS} workplaceNames={false}
      running={o.running ?? null} paused={o.paused} toured={o.toured ?? false} onStart={jest.fn()} onDismiss={o.onDismiss} />
  );
  it('left on the last stop counts as finished', () => {
    render(tour({ paused: 5 }));
    expect($('cm-cc-tour')!.getAttribute('data-state')).toBe('done');
    expect(host.textContent).not.toMatch(/Stop 6 of 6/);
  });
  it('a mid-tour pause offers Resume and ×, which dismisses it', () => {
    const dismiss = jest.fn();
    render(tour({ paused: 1, onDismiss: dismiss }));
    expect($('cm-cc-tour')!.textContent).toContain('Stop 2 of 6');
    act(() => { $('cm-cc-tour-dismiss')!.click(); });
    expect(dismiss).toHaveBeenCalled();
  });
  it('a pause expires after 7 days, and one stored without a time has expired', () => {
    const now = Date.now();
    window.localStorage.setItem(tourKey(), JSON.stringify({ paused: 2, toured: false, pausedAt: now - PAUSE_TTL_MS + 60_000 }));
    expect(readTour(now).paused).toBe(2);
    window.localStorage.setItem(tourKey(), JSON.stringify({ paused: 2, toured: false, pausedAt: now - PAUSE_TTL_MS - 1 }));
    expect(readTour(now).paused).toBeNull();
    window.localStorage.setItem(tourKey(), JSON.stringify({ paused: 2, toured: true }));
    expect(readTour(now)).toEqual({ paused: null, toured: true });
  });
});

describe('a 6-minute step never reads "~96 min"', () => {
  const stops = [stop({ key: 'a', done: true, minutes: 30 }), stop({ key: 'b', minutes: 6, buildingId: 'lecture' }), stop({ key: 'c', minutes: 20, buildingId: 'studio' })];
  const look = { points: null, rung: null, planMinutes: 96, stops };
  it('minutes left = the undone steps only', () => {
    expect(minutesLeft(stops)).toBe(26);
    expect(minutesLeft([stop({ done: true })])).toBeNull();
    expect(minutesLeft(null)).toBeNull();
  });
  it('the Classroom shows ITS step; only Schedule shows what is left of the day', () => {
    const lecture = factsAt('lecture', {}, look, Date.now()).map((h) => `${h.title} | ${h.detail}`).join('\n');
    expect(lecture).toContain('step 2 of 3');
    expect(lecture).toContain('6 min');
    expect(lecture).not.toContain('96');
    const tower = factsAt('tower', {}, look, Date.now()).map((h) => h.detail).join('\n');
    expect(tower).toContain('~26 min left');
  });
  it('Right now quotes the step\'s own minutes', () => {
    const rows = rightNowRows({ audience: 'member', workplace: false, buildings: BUILDINGS, stops, planMinutes: 96, agenda: null, presence: null, presenceError: false, live: false, urgent: null });
    expect(rows[0].detail).toBe('6 min · Deep Dive');
  });
});

describe('the campus count', () => {
  it('includes the people online at the Quad (no building), never as the busiest building', () => {
    const presence = { library: { count: 2, people: [] }, quad: { count: 11, people: [{ enrollment_id: 'p1', display_name: 'A', avatar_url: null, can_message: false }] } };
    const p = pulseOf(presence as never, BUILDINGS);
    expect(p.total).toBe(13);
    expect(p.busiest?.id).toBe('library');
  });
});

describe('every signed-in learner\'s building is recorded (C13)', () => {
  it('records the page\'s building with the share choice; nothing without a token, a building, or in a read-only session', () => {
    pingCampusBuilding('/portal/library');
    expect(mockPost).toHaveBeenLastCalledWith('library', true);
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_CAMPUS_SETTINGS, shareBuilding: false }));
    pingCampusBuilding('/portal/library');
    expect(mockPost).toHaveBeenLastCalledWith('library', false);
    mockPost.mockClear();
    pingCampusBuilding('/portal/settings');
    mockReadOnly = true; pingCampusBuilding('/portal/library');
    mockReadOnly = false; mockToken = null; pingCampusBuilding('/portal/library');
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('the campus is drawn from the server\'s audience (Ali was getting business)', () => {
  const Probe = () => { const a = useCampusAudience(); return <span data-testid="aud" data-ready={String(a.ready)}>{a.audience}</span>; };
  const mount = (active: boolean) => render(
    <AudienceSwitchContext.Provider value={{ audienceSwitch: false, viewAs: null, setViewAs: () => undefined, active }}><Probe /></AudienceSwitchContext.Provider>);
  beforeEach(() => __resetServerAudienceForTests());
  it('not ready until the server answers, then its word wins over the local signals', async () => {
    let answer: (a: string | null) => void = () => undefined;
    mockAudience = new Promise((r) => { answer = r; });
    mount(true);
    expect($('aud')!.getAttribute('data-ready')).toBe('false');
    await act(async () => { answer('staff'); await Promise.resolve(); });
    expect($('aud')!.getAttribute('data-ready')).toBe('true');
    expect($('aud')!.textContent).toBe('staff');
  });
  it('a failed read falls back to the local signals, so the campus never waits forever', async () => {
    mockAudience = Promise.resolve(null);
    mount(true);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect($('aud')!.getAttribute('data-ready')).toBe('true');
    expect($('aud')!.textContent).toBe('member');
  });
  it('with the campus off it asks nothing and is ready', () => {
    mockAudience = new Promise(() => undefined);
    mount(false);
    expect($('aud')!.getAttribute('data-ready')).toBe('true');
  });
});
