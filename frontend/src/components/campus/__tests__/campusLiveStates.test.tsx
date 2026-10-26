/**
 * WP-6, Colaberry Live on the campus: the states and their words (marquee, sub line, preview), the marquee over the live building,
 * the live bar (chip, ticking clock, Walk in that runs while on air, You're here, Watch / Watching on the real player, dismiss, the
 * launch cue once), the concierge's live card (Run to the hall, the Explorer and partner lines, the chime opt-in), the arrival
 * stage (reconnecting, watch, playing, an Explorer's preview and its end), the per-state happening rows, lead and gate line.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { DiscoveryBroadcast } from '../../../hooks/useBroadcastDiscovery';

let mockBroadcasts: DiscoveryBroadcast[] = [];
jest.mock('../../../contexts/BroadcastDiscoveryContext', () => ({
  ...jest.requireActual('../../../contexts/BroadcastDiscoveryContext'),
  useDiscoveryState: () => ({ broadcasts: mockBroadcasts, disabled: false, unavailable: false, states: ['live'] }),
}));
let mockPresence: Record<string, { count: number; people: unknown[] }> | null = null;
const mockDoor: string[] = [];
jest.mock('../CampusContext', () => ({
  ...jest.requireActual('../CampusContext'),
  useCampus: () => ({ presence: mockPresence, presenceError: false, enterThroughDoor: (r: string) => mockDoor.push(r), settings: { workplaceNames: false } }),
}));
jest.mock('../useCampusView', () => ({ ...jest.requireActual('../useCampusView'), useCampusView: () => ({ buildings: jest.requireActual('../campusMap').CAMPUS_BUILDINGS }) }));
let mockChime = 'played';
jest.mock('../../portal/broadcastLaunchCue', () => ({
  ...jest.requireActual('../../portal/broadcastLaunchCue'),
  playChime: () => Promise.resolve(mockChime),
}));

/* eslint-disable import/first */
import { BroadcastPlayerProvider, useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import { liveStateOf, clock, marqueeText, liveSub, previewLeft } from '../campusLiveState';
import CampusLive from '../CampusLive';
import LiveCard from '../home/LiveCard';
import LiveStage from '../LiveStage';
import CampusWorldMap from '../CampusWorldMap';
import CampusGate from '../home/CampusGate';
import { happeningAt } from '../campusArrival';
import { leadFor } from '../home/conciergeCopy';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { readSoundOptIn } from '../../portal/broadcastLaunchCue';
/* eslint-enable import/first */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T0 = 1_800_000_000_000;
const bc = (o: Partial<DiscoveryBroadcast> = {}): DiscoveryBroadcast => ({ id: 'occ-1', title: 'Agents in production', access_mode: 'paid', editorial_state: 'live', room_id: 'room-7',
  content_started_at: T0 - 252_000, scheduled_start_at: null, can_watch: true, reason: 'ok', offer_upgrade: false, preview_seconds_remaining: null, ...o });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); window.sessionStorage.clear(); window.localStorage.clear(); mockDoor.length = 0; mockPresence = null; });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); jest.restoreAllMocks(); });
// CRA's Jest has legacy fake timers (they do not move Date.now): the clock is driven here, and advanced with the timers
let fakeNow = T0;
const atT0 = () => { fakeNow = T0; jest.useFakeTimers(); jest.spyOn(Date, 'now').mockImplementation(() => fakeNow); };
const tick = (ms: number) => act(() => { fakeNow += ms; jest.advanceTimersByTime(ms); });
let player: ReturnType<typeof useBroadcastPlayer> | null = null;
function Spy(): null { player = useBroadcastPlayer(); return null; }
const render = (el: React.ReactElement) => act(() => { root.render(<MemoryRouter><BroadcastPlayerProvider><Spy />{el}</BroadcastPlayerProvider></MemoryRouter>); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const click = (s: string) => act(() => { q(s)!.click(); });

describe('the states and their words (LSTATES, marqueeText, liveSub)', () => {
  it('maps the server\'s states; the clock is the prototype\'s m:ss', () => {
    expect(['live', 'reconnecting', 'backstage', 'replay_ready', 'anything'].map((s) => liveStateOf({ editorial_state: s }))).toEqual(['live', 'reconnecting', 'backstage', 'replay', 'live']);
    expect([clock(252_000), clock(3_665_000), clock(-5)]).toEqual(['4:12', '61:05', '0:00']);
  });
  it('marquee and sub line per state, from the real start time', () => {
    expect(marqueeText(bc(), T0)).toBe('● ON AIR · 4:12');
    expect(liveSub(bc(), T0)).toBe('on air for 4:12');
    expect(marqueeText(bc({ editorial_state: 'reconnecting' }), T0)).toBe('RECONNECTING…');
    expect(liveSub(bc({ editorial_state: 'reconnecting' }), T0)).toBe('reconnecting, hang tight');
    expect(marqueeText(bc({ editorial_state: 'backstage', scheduled_start_at: T0 + 14_000 }), T0)).toBe('DOORS OPEN · 0:14');
    expect(marqueeText(bc({ editorial_state: 'replay_ready' }), T0)).toBe('▶ REPLAY READY');
    expect(marqueeText(bc({ content_started_at: null }), T0)).toBe('● ON AIR');
  });
  it('an Explorer\'s preview counts down locally from the polled value; expired is 0; not a preview is null', () => {
    expect(previewLeft(bc({ preview_seconds_remaining: 60 }), T0, T0 + 15_000)).toBe(45);
    expect(previewLeft(bc({ preview_seconds_remaining: 10 }), T0, T0 + 30_000)).toBe(0);
    expect(previewLeft(bc({ reason: 'preview_expired', preview_seconds_remaining: 0 }), T0, T0)).toBe(0);
    expect(previewLeft(bc(), T0, T0)).toBeNull();
  });
});

describe('the marquee over the live building', () => {
  const map = (mark: { state: string; text: string } | null) => render(<CampusWorldMap buildings={[...CAMPUS_BUILDINGS]} accessOf={() => 'open'} workplaceNames={false} reduceMotion
    onArrive={() => undefined} onAir={new Set(['commons'])} liveMark={mark} />);
  it('a pill in the state\'s colour with the ticking words; the map takes the state\'s class (beams only while on air)', () => {
    map({ state: 'live', text: '● ON AIR · 4:12' });
    expect(q('[data-testid="cm-marquee-text"]')!.textContent).toBe('● ON AIR · 4:12');
    expect(q('svg.cm-map')!.getAttribute('class')).toContain('ls-live');
    map({ state: 'reconnecting', text: 'RECONNECTING…' });
    expect(q('[data-testid="cm-marquee"]')!.getAttribute('class')).toContain('is-reconnecting');
    expect(q('svg.cm-map')!.getAttribute('class')).toContain('ls-reconnecting');
  });
});

describe('the live bar', () => {
  it('chip, title, the clock ticking every second; Walk in runs while on air; You\'re here once there', () => {
    atT0();
    mockBroadcasts = [bc()];
    const walks: [string, boolean][] = [];
    render(<CampusLive onWalk={(id, run) => walks.push([id, run])} />);
    expect(q('[data-testid="cm-live-chip"]')!.textContent).toBe('● ON AIR');
    expect(q('[data-testid="cm-live-sub"]')!.textContent).toBe('· on air for 4:12');
    tick(2000);
    expect(q('[data-testid="cm-live-sub"]')!.textContent).toBe('· on air for 4:14');
    click('[data-testid="cm-live-walk"]');
    expect(walks).toEqual([['amphi', true]]); // C28: the Events Hall
    render(<CampusLive onWalk={() => undefined} hereId="amphi" />);
    expect(q('[data-testid="cm-live-here"]')!.textContent).toBe('You’re here');
  });
  it('on a page: Go to the room through the door; reconnecting: no run', () => {
    mockBroadcasts = [bc({ editorial_state: 'reconnecting' })];
    const walks: boolean[] = [];
    render(<CampusLive />);
    expect(q('[data-testid="cm-live-chip"]')!.textContent).toBe('RECONNECTING');
    click('[data-testid="cm-live-go"]');
    expect(mockDoor).toEqual(['/portal/rooms/room-7']);
    render(<CampusLive onWalk={(_id, run) => walks.push(run)} />);
    click('[data-testid="cm-live-walk"]');
    expect(walks).toEqual([false]);
  });
  it('Watch here opens the real player, then reads ⏸ Watching and stops it; no watch button when the server says no', () => {
    mockBroadcasts = [bc()];
    render(<CampusLive />);
    click('[data-testid="broadcast-watch"]');
    expect(player!.session?.occurrenceId).toBe('occ-1');
    click('[data-testid="cm-live-stop"]');
    expect(player!.session).toBeNull();
    mockBroadcasts = [bc({ can_watch: false })];
    render(<CampusLive />);
    expect(q('[data-testid="broadcast-watch"]')).toBeNull();
  });
  it('× puts it away for this broadcast only; the launch cue pulses once per broadcast', () => {
    mockBroadcasts = [bc()];
    render(<CampusLive />);
    expect(q('[data-testid="cm-live"]')!.getAttribute('class')).toContain('is-cue');
    click('[data-testid="cm-live-x"]');
    expect(q('[data-testid="cm-live"]')).toBeNull();
    mockBroadcasts = [bc({ id: 'occ-2' })];
    render(<CampusLive />);
    expect(q('[data-testid="cm-live"]')).not.toBeNull();
    act(() => root.unmount()); root = createRoot(container);
    render(<CampusLive />);
    expect(q('[data-testid="cm-live"]')!.getAttribute('class')).not.toContain('is-cue'); // already cued this session
  });
});

describe('the concierge\'s live card', () => {
  it('Run to the hall runs; the place and clock; an Explorer\'s preview line; a partner\'s team line', () => {
    atT0();
    mockBroadcasts = [bc()];
    const walks: [string, boolean | undefined][] = [];
    render(<LiveCard title="Agents in production" buildingId="commons" place="Community Lounge" onWalk={(id, run) => walks.push([id, run])} />);
    expect(q('[data-testid="cm-cc-live-sub"]')!.textContent).toBe('Community Lounge · on air for 4:12');
    click('[data-testid="cm-cc-live-walk"]');
    expect(walks).toEqual([['commons', true]]);
    mockBroadcasts = [bc({ access_mode: 'preview' })];
    render(<LiveCard title="x" buildingId="commons" audience="explorer" onWalk={() => undefined} />);
    expect(q('[data-testid="cm-cc-live-sub"]')!.textContent).toContain('preview for Explorers');
    render(<LiveCard title="x" buildingId="commons" audience="business" teamHere={2} onWalk={() => undefined} />);
    expect(q('[data-testid="cm-cc-live-sub"]')!.textContent).toContain('2 of your team here');
  });
  it('the chime opt-in is the portal\'s own setting; switching on plays it, and a refusal says so', async () => {
    mockBroadcasts = [bc()];
    render(<LiveCard title="x" buildingId="commons" onWalk={() => undefined} />);
    expect(q('[data-testid="cm-cc-live-chime"]')!.textContent).toContain('Off');
    mockChime = 'refused';
    await act(async () => { q('[data-testid="cm-cc-live-chime"]')!.click(); });
    expect(readSoundOptIn()).toBe(true);
    expect(q('[data-testid="cm-cc-live-chime"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Your browser blocked the sound.');
  });
});

describe('the arrival stage', () => {
  const live = (o: Partial<DiscoveryBroadcast>, polledAt = T0, now = T0) => ({ b: bc(o), state: liveStateOf(bc(o)), now, polledAt, building: 'commons' as const });
  it('watch, then playing in the mini player with Stop; reconnecting says it resumes on its own', () => {
    render(<LiveStage live={live({})} audience="member" enrollTo="/enroll" />);
    click('[data-testid="cm-stage-watch"]');
    expect(player!.session?.occurrenceId).toBe('occ-1');
    expect(q('[data-testid="cm-stage-stop"]')).not.toBeNull();
    render(<LiveStage live={live({ editorial_state: 'reconnecting' })} audience="member" enrollTo="/enroll" />);
    expect(q('[data-testid="cm-stage"]')!.textContent).toContain('It resumes on its own');
  });
  it('an Explorer\'s preview counts down; at 0 the preview has ended, with Enroll', () => {
    render(<LiveStage live={live({ preview_seconds_remaining: 60 }, T0, T0 + 15_000)} audience="explorer" enrollTo="/enroll" />);
    expect(q('[data-testid="cm-stage-preview"]')!.textContent).toBe('PREVIEW · 0:45');
    render(<LiveStage live={live({ preview_seconds_remaining: 0, reason: 'preview_expired', can_watch: false })} audience="explorer" enrollTo="/enroll" />);
    expect(q('[data-testid="cm-stage"]')!.textContent).toContain('Your preview has ended.');
    expect(q('[data-testid="cm-stage-enroll"]')!.getAttribute('href')).toBe('/enroll');
  });
});

describe('the words around it', () => {
  it('happening rows per state; the reconnecting lead; the gate\'s live line (members and Explorers only)', () => {
    expect(happeningAt('commons', { onAir: true, count: null, presenceError: false, live: { state: 'live', title: 'Agents', sub: 'on air for 4:12' } })[0])
      .toEqual({ title: 'On air · Agents', detail: 'on air for 4:12', tone: 'hot' });
    expect(happeningAt('commons', { onAir: true, count: null, presenceError: false, live: { state: 'reconnecting', title: 'Agents', sub: '' } })[0].title).toBe('Reconnecting to the stream');
    const base = { audience: 'member' as const, moment: 'live' as const, firstName: '', workplace: false, buildings: [...CAMPUS_BUILDINGS], liveAt: 'Community Lounge', next: null, dutyNames: [], tourStops: null, onCampus: null };
    expect(leadFor({ ...base, liveState: 'reconnecting' })).toBe('The broadcast hit a snag and is reconnecting on its own. Stay put, there is nothing to refresh.');
    const gate = (audience: 'member' | 'explorer' | 'staff', live: { place: string; preview: boolean } | null, workplace = false) => render(<CampusGate audience={audience} firstName="Ali" fullName="Ali M"
      initials="AM" rung={null} points={null} streak={null} online={null} workplace={workplace} hasTour reduceMotion now={new Date()} onEnter={() => undefined} live={live} />);
    gate('member', { place: 'Community Lounge', preview: false });
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('Colaberry Live is on air. Your cohort is heading to the Community Lounge.');
    gate('member', { place: 'Collab Café', preview: false }, true);
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('Colaberry Live is on air. Your team is heading to the Collab Café.');
    gate('explorer', { place: 'Community Lounge', preview: true });
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('Colaberry Live is on: you can watch a preview. Come on in.');
    gate('staff', { place: 'Community Lounge', preview: false });
    expect(q('[data-testid="cm-gate-sub"]')!.textContent).toBe('The campus is open.');
  });
});
