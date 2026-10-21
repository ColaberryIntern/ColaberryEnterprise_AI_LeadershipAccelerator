/**
 * C11 Workplace names: with the setting on, NO campus-only name appears on any surface, for any of the four audiences.
 *
 * "Campus-only" = a building name that differs from its Workplace name (Game Room vs Break Room), a room label that has a
 * Workplace label, and the phone tab "Lounge". The map (labels and aria), the cards, the list, search, the trail, the tour
 * and the tab bar are all checked, with the setting off as the control (the same names DO appear there).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockAudience: 'member' | 'explorer' | 'business' | 'staff' = 'member';
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 0, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, { isStaff: mockAudience === 'staff', hasFullAccess: true, isExplorer: mockAudience === 'explorer' }) };
});

jest.mock('../../../pages/portal/today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
jest.mock('../games/gameRoomApi', () => {
  const actual = jest.requireActual('../games/gameRoomApi');
  return { ...actual, fetchGameTime: () => Promise.reject(new actual.GameApiError('CampusNotEnabled', 403, 'CampusNotEnabled')), fetchGameBoard: () => Promise.resolve({ week_start: '2026-10-19', rows: [] }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import GameRoomPage from '../../../pages/portal/campus/GameRoomPage';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import CampusTabBar from '../CampusTabBar';
// eslint-disable-next-line import/first
import { campusViewFor } from '../useCampusView';
// eslint-disable-next-line import/first
import { buildingName, careerBuildingFor, roomLabel } from '../campusMap';
// eslint-disable-next-line import/first
import type { CampusBuilding } from '../campusMap';
// eslint-disable-next-line import/first
import { searchCampus } from '../campusSearch';
// eslint-disable-next-line import/first
import { trailFor } from '../campusTrail';
// eslint-disable-next-line import/first
import { tourFor } from '../tourSteps';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AUDIENCES = ['member', 'explorer', 'business', 'staff'] as const;
const viewFor = (a: typeof AUDIENCES[number]) => campusViewFor(a, { isStaff: a === 'staff', hasFullAccess: true, isExplorer: a === 'explorer' });

/** Names that must NOT be seen with Workplace names on, for this audience's buildings. */
function campusOnlyNames(buildings: CampusBuilding[]): string[] {
  const out = new Set<string>(['Lounge']);
  for (const b of buildings) {
    if (b.name !== b.workplaceName) out.add(b.name);
    for (const r of b.rooms) if (r.workplaceLabel && r.workplaceLabel !== r.label) out.add(r.label);
  }
  // A campus word that is also part of a workplace name (none today) would make this check meaningless; guard it.
  for (const b of buildings) for (const n of Array.from(out)) if (b.workplaceName.includes(n)) out.delete(n);
  return Array.from(out);
}
const wordIn = (text: string, name: string) => new RegExp(`(^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`).test(text);

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('catalog', () => {
  it('each career face has its own Workplace name', () => {
    expect(careerBuildingFor('member').workplaceName).toBe('Engagements');
    expect(careerBuildingFor('business').workplaceName).toBe('Client Office');
    expect(careerBuildingFor('staff').workplaceName).toBe('Operations Office');
  });
  it('roomLabel uses the Workplace label only when the setting is on and one exists', () => {
    expect(roomLabel({ label: 'Game Room', workplaceLabel: 'Games' }, true)).toBe('Games');
    expect(roomLabel({ label: 'Game Room', workplaceLabel: 'Games' }, false)).toBe('Game Room');
    expect(roomLabel({ label: 'Rooms' }, true)).toBe('Rooms');
  });
});

describe.each(AUDIENCES)('pure surfaces: %s', (audience) => {
  const { buildings, accessOf } = viewFor(audience);
  const banned = campusOnlyNames(buildings);

  it('the banned list is real (control)', () => { expect(banned.length).toBeGreaterThan(3); });

  it('search: no campus-only label in any result for any banned word, nor for "room" / "office"', () => {
    for (const q of [...banned, 'room', 'office', 'center']) {
      for (const r of searchCampus(q, buildings, null, true)) {
        if (r.kind !== 'person') for (const n of banned) expect({ q, label: r.label, n, hit: wordIn(r.label, n) }).toEqual({ q, label: r.label, n, hit: false });
      }
    }
  });

  it('trail: every building and room route reads in Workplace names', () => {
    for (const b of buildings) for (const r of b.rooms) {
      if (r.admin || r.planned) continue;
      const labels = trailFor(r.route, buildings, true).map((c) => c.label).join(' > ');
      for (const n of banned) expect({ route: r.route, labels, n, hit: wordIn(labels, n) }).toEqual({ route: r.route, labels, n, hit: false });
    }
  });

  it('tour: stop names and copy that name a building', () => {
    const tour = tourFor(audience, buildings, accessOf, true);
    if (!tour) { expect(audience).toBe('staff'); return; }
    const text = tour.stops.map((s) => `${s.name} ${s.tip}`).join(' | ');
    for (const n of banned) expect({ n, hit: wordIn(text, n) }).toEqual({ n, hit: false });
    expect(text).not.toContain('{gate}');
  });

  it('control: with the setting OFF the campus names do appear', () => {
    const names = buildings.map((b) => buildingName(b, false));
    expect(banned.some((n) => names.includes(n))).toBe(true);
  });
});

/* ---------------- rendered surfaces ---------------- */

let campus: ReturnType<typeof useCampus>;
function Controls(): null { campus = useCampus(); return null; }
let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
async function mount(workplaceNames: boolean): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames, motion: 'on' }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Controls /><CampusTabBar active="/portal/today" /><CampusLayers /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); window.localStorage.clear(); });

/** Everything a learner can read or hear: each text node (kept apart, so words never run together) plus aria-labels. */
const readable = (el: Element) => {
  const parts: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.textContent ?? '');
  el.querySelectorAll('[aria-label]').forEach((x) => parts.push(x.getAttribute('aria-label') ?? ''));
  return parts.join(' | ');
};

describe.each(AUDIENCES)('rendered surfaces with Workplace names on: %s', (audience) => {
  beforeEach(() => { mockAudience = audience; });
  const banned = campusOnlyNames(viewFor(audience).buildings);

  it('map (labels and aria), every building card, the list view and the tab bar', async () => {
    await mount(true);
    await act(async () => { campus.openMap(); });
    await flush();
    let seen = readable(document.body);
    for (const b of viewFor(audience).buildings) {
      await act(async () => { campus.openMap(b.id); }); // instant arrival: reduce motion on
      await flush();
      seen += ' ' + readable(document.body);
      await act(async () => { campus.closeLayer(); });
    }
    await act(async () => { campus.openList(); });
    await flush();
    seen += ' ' + readable(document.body);
    for (const n of banned) expect({ n, hit: wordIn(seen, n) }).toEqual({ n, hit: false });
    expect(seen).toContain('Cafe');
  }, 30_000); // opens every building's card in turn

  it('control: with the setting OFF the same surfaces show the campus names', async () => {
    await mount(false);
    await act(async () => { campus.openList(); });
    await flush();
    const seen = readable(document.body);
    expect(banned.filter((n) => wordIn(seen, n)).length).toBeGreaterThan(2);
  }, 30_000);
});

describe('the Game Room page and the person card', () => {
  beforeEach(() => { mockAudience = 'member'; });
  async function mountPage(workplaceNames: boolean): Promise<void> {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames, motion: 'on' }));
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Controls /><GameRoomPage /><CampusLayers /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
    });
    await flush();
  }

  it('Workplace names on: the page heading and its copy say Break Room, never Game Room', async () => {
    await mountPage(true);
    expect(container.querySelector('h1')!.textContent).toBe('Break Room');
    const seen = readable(container);
    expect(container.querySelector('[data-testid="gr-pilot-off"]')!.textContent).toBe('The Break Room opens with the campus.');
    expect(wordIn(seen, 'Game Room')).toBe(false);
  }, 30_000);

  it('control, off: the page says Game Room', async () => {
    await mountPage(false);
    expect(container.querySelector('h1')!.textContent).toBe('Game Room');
  }, 30_000);

  it('the person card says where they are in Workplace names', async () => {
    await mountPage(true);
    await act(async () => { campus.openMap(); });
    await act(async () => { campus.openPersonCard({ person: { enrollment_id: 'p1', display_name: 'Avery Stone', avatar_url: null }, buildingId: 'arcade' }); });
    await flush();
    const card = document.querySelector('[data-testid="cm-person-card"]')!;
    expect(card.textContent).toContain('In Break Room');
    expect(wordIn(readable(card), 'Game Room')).toBe(false);
  }, 30_000);
});
