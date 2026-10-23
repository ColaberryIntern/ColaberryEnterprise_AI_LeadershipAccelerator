/**
 * C8 live mode: the campus shows what the portal's own broadcast discovery says is on air. A room broadcast lights the commons on
 * the banner mini-map and the full map, and the banner strip offers Watch and "Go to the room" through the door. Disabled,
 * unavailable or empty discovery shows nothing. The crowd line is the commons presence count, hidden at 0 or unknown.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { DiscoveryBroadcast, DiscoveryResponse } from '../../../hooks/useBroadcastDiscovery';

let mockPresence: Record<string, { count: number }> = {};
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve(mockPresence), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
// WP-1: opening the map goes to the campus home, rendered here too; its own services are mocked (no network).
jest.mock('../../../services/onboardingApi', () => ({
  ...require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi')),
  fetchPortalFlags: () => Promise.resolve({ today_redesign: true }),
}));
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusBanner from '../CampusBanner';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { onAirBroadcasts, onAirBuildings, roomRoute, headlineBroadcast } from '../campusOnAir';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { BroadcastDiscoveryProvider } from '../../../contexts/BroadcastDiscoveryContext';
// eslint-disable-next-line import/first
import { BroadcastPlayerProvider } from '../../../contexts/BroadcastPlayerContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE: DiscoveryBroadcast = {
  id: 'occ-1', title: 'Agents in production, live', access_mode: 'free', editorial_state: 'live', room_id: 'room-7',
  content_started_at: 1, scheduled_start_at: 1, can_watch: true, reason: 'ok', offer_upgrade: false, preview_seconds_remaining: null,
};
const ROOMLESS: DiscoveryBroadcast = { ...LIVE, id: 'occ-2', title: 'Roomless special', room_id: null };

let discovery: () => Promise<DiscoveryResponse> = () => Promise.resolve({ states: ['live'], broadcasts: [], poll_after_ms: 45000 });
const deps = {
  fetchDiscovery: () => discovery(),
  setTimer: () => 0, clearTimer: () => undefined, isVisible: () => true, subscribeVisibility: () => () => undefined,
};
const respond = (broadcasts: DiscoveryBroadcast[]) => { discovery = () => Promise.resolve({ states: ['live', 'reconnecting'], broadcasts, poll_after_ms: 45000 }); };

function Where(): React.ReactElement { return <span data-testid="loc">{useLocation().pathname}</span>; }
function Gated(): React.ReactElement | null {
  const c = useCampus();
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = c;
  // WP-1: a page carries the banner and the layers; the campus home (/portal/campus) is its own page with the one map.
  return c.active ? <WithCampusHome><CampusBanner /><CampusLayers /></WithCampusHome> : null;
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
async function mount(pathname = '/portal/library'): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  skipGate();
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[pathname]}><ParticipantAuthProvider><BroadcastDiscoveryProvider deps={deps}><BroadcastPlayerProvider>
        <CampusProvider><Gated /><Where /></CampusProvider>
      </BroadcastPlayerProvider></BroadcastDiscoveryProvider></ParticipantAuthProvider></MemoryRouter>,
    );
  });
  await flush();
}
beforeEach(() => { mockPresence = {}; respond([]); });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); window.sessionStorage.clear(); document.body.innerHTML = ''; });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('on air, from discovery', () => {
  it('a room broadcast lights the commons on the home map, and shows the strip with Watch and Go to the room', async () => {
    respond([LIVE]);
    await mount();
    // WP-3: the page bar's tile is the prototype's schematic (grey blocks and your pin), with no badges; the strip carries the news
    expect(container.querySelector('.cm-banner [data-testid="cm-mini-tile"]')).not.toBeNull();
    expect(container.querySelector('.cm-banner [data-testid^="cm-onair-"]')).toBeNull();
    expect(q('cm-live')?.textContent).toContain('Agents in production, live');
    expect(Array.from(container.querySelectorAll('[data-testid="cm-live"] button')).map((b) => b.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/watch/i), 'Go to the room']),
    );
    act(() => { (q('cm-live-go') as HTMLButtonElement).click(); });
    await flush();
    expect(q('loc')?.textContent).toBe('/portal/rooms/room-7');
    act(() => { campus().openMap(); });
    await flush();
    // WP-1: the map is the campus home; the commons is lit there, and only the commons.
    expect(q('loc')?.textContent).toBe('/portal/campus');
    expect(container.querySelector('[data-testid="cm-home"] [data-testid="cm-onair-commons"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('[data-testid="cm-home"] [data-testid^="cm-onair-"]')).map((e) => e.getAttribute('data-testid'))).toEqual(['cm-onair-commons']);
  });
  it('a broadcast with no room: the strip names it, no building lights, no Go to the room', async () => {
    respond([ROOMLESS]);
    await mount();
    expect(q('cm-live')?.textContent).toContain('Roomless special');
    expect(q('cm-live-go')).toBeNull();
    expect(container.querySelector('[data-testid^="cm-onair-"]')).toBeNull();
  });
  it('nothing on air: no strip, no badge', async () => {
    await mount();
    expect(q('cm-live')).toBeNull();
    expect(container.querySelector('[data-testid^="cm-onair-"]')).toBeNull();
  });
  it('discovery failing: no strip, no badge', async () => {
    discovery = () => Promise.reject(Object.assign(new Error('down'), { response: { status: 503 } }));
    await mount();
    expect(q('cm-live')).toBeNull();
    expect(container.querySelector('[data-testid^="cm-onair-"]')).toBeNull();
  });
});

describe('the crowd line', () => {
  it('names the commons head count when someone is there', async () => {
    respond([LIVE]);
    mockPresence = { commons: { count: 3 } };
    await mount();
    expect(q('cm-live-crowd')?.textContent).toBe('3 in the Community Lounge now');
  });
  it('is hidden when the commons count is unknown (no entry)', async () => {
    respond([LIVE]);
    mockPresence = { library: { count: 4 } };
    await mount();
    expect(q('cm-live')).not.toBeNull();
    expect(q('cm-live-crowd')).toBeNull();
  });
  it('is hidden at zero', async () => {
    respond([LIVE]);
    mockPresence = { commons: { count: 0 } };
    await mount();
    expect(q('cm-live')).not.toBeNull();
    expect(q('cm-live-crowd')).toBeNull();
  });
});

describe('the pure rules', () => {
  it('disabled or unavailable discovery is never on air, even with a stale list', () => {
    expect(onAirBroadcasts({ broadcasts: [LIVE], disabled: true, unavailable: false })).toEqual([]);
    expect(onAirBroadcasts({ broadcasts: [LIVE], disabled: false, unavailable: true })).toEqual([]);
    expect(onAirBroadcasts({ broadcasts: [LIVE], disabled: false, unavailable: false })).toEqual([LIVE]);
  });
  it('only a room broadcast has a building and a route; the headline prefers one with a room', () => {
    expect(Array.from(onAirBuildings([ROOMLESS]))).toEqual([]);
    expect(Array.from(onAirBuildings([ROOMLESS, LIVE]))).toEqual(['commons']);
    expect(roomRoute(ROOMLESS)).toBeNull();
    expect(roomRoute({ room_id: 'a b' })).toBe('/portal/rooms/a%20b');
    expect(headlineBroadcast([ROOMLESS, LIVE])).toBe(LIVE);
    expect(headlineBroadcast([])).toBeNull();
  });
  it('adds no polling: no campus file in this change starts an interval', () => {
    const dir = path.join(__dirname, '..');
    for (const f of ['campusOnAir.ts', 'CampusLive.tsx', 'useCampusPlan.ts', 'campusPlan.ts', 'campusNotify.ts']) {
      expect({ f, interval: /setInterval/.test(fs.readFileSync(path.join(dir, f), 'utf8')) }).toEqual({ f, interval: false });
    }
  });
});
