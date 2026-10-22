/**
 * C11 list parity: the list view states every fact the map shows about a building, for each audience. Fed the SAME data the
 * map gets (presence with named people, staff desks, today's plan, on air), it must show, per building: on air, the plan stop
 * number, the head count and named people, the desks for that audience, the rooms, admin rooms by the card's rule, and the
 * Main Gate with the Explorer's path; plus the tour, My look and Settings in its bar.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockAudience: 'member' | 'explorer' | 'business' | 'staff' = 'member';
let mockMgmt = false;
const DESKS = [
  { id: 'reese', name: 'Reese', title: 'Mentor desk', building: 'commons', ai: true, on_duty: true, enrollment_id: 'r-1', opens: null, prompts: [] },
  { id: 'dara', name: 'Dara', title: 'Curriculum desk', building: 'library', ai: true, on_duty: true, enrollment_id: 'd-1', opens: null, prompts: [] },
  { id: 'maya', name: 'Maya', title: 'Welcome desk', building: 'gate', ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] },
];
const PRESENCE = {
  commons: { count: 3, people: [{ enrollment_id: 'p1', display_name: 'Avery Stone', avatar_url: null }, { anonymous: true }, { anonymous: true }] },
  library: { count: 1, people: [{ anonymous: true }] },
};
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve(DESKS), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve(PRESENCE), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 0, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, { isStaff: mockAudience === 'staff', hasFullAccess: mockAudience !== 'explorer', isExplorer: mockAudience === 'explorer' }) };
});
jest.mock('../useCampusPlan', () => ({
  useCampusPlan: () => ({ minutes: null, complete: () => Promise.resolve({ ok: true, points: 0 }), stops: [
    { key: 'a', title: 'Lesson', route: '/portal/classroom', buildingId: 'lecture', done: false, type: 'deep_dive', label: 'Deep Dive', minutes: null, points: 0, ref: null, cardId: null },
    { key: 'b', title: 'Task', route: '/portal/projects', buildingId: 'studio', done: false, type: 'project_task', label: 'Project Task', minutes: null, points: 0, ref: null, cardId: null },
  ] }),
}));
jest.mock('../campusOnAir', () => {
  const actual = jest.requireActual('../campusOnAir');
  return { ...actual, useCampusOnAir: () => ({ broadcasts: [], buildings: new Set(['commons']) }) };
});
jest.mock('../campusMgmt', () => ({ useIsMgmt: () => mockMgmt, fetchIsMgmt: () => Promise.resolve(mockMgmt), __resetMgmtCacheForTests: () => undefined }));

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import CampusNav from '../CampusNav';
// eslint-disable-next-line import/first
import { campusViewFor } from '../useCampusView';
// eslint-disable-next-line import/first
import { desksForBuilding } from '../campusPeople';
// eslint-disable-next-line import/first
import type { StaffDesk } from '../campusPeopleApi';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let campus: ReturnType<typeof useCampus>;
function Controls(): null { campus = useCampus(); return null; }
let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
async function openList(): Promise<HTMLElement> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Controls /><CampusLayers /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
  await act(async () => { campus.openList(); });
  await flush();
  return document.querySelector('[data-testid="cm-list"]') as HTMLElement;
}
const section = (list: HTMLElement, id: string) => list.querySelector(`section[data-building="${id}"]`) as HTMLElement | null;
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); mockMgmt = false; });

describe.each(['member', 'explorer', 'business', 'staff'] as const)('list view parity: %s', (audience) => {
  beforeEach(() => { mockAudience = audience; });
  const { buildings } = campusViewFor(audience, { isStaff: audience === 'staff', hasFullAccess: true, isExplorer: audience === 'explorer' });

  it('lists every building this audience sees, the Main Gate included where it exists, each with an h2', async () => {
    const list = await openList();
    for (const b of buildings) expect({ id: b.id, listed: !!section(list, b.id)?.querySelector('h2') }).toEqual({ id: b.id, listed: true });
    expect(list.querySelectorAll('section[data-building]')).toHaveLength(buildings.length);
  });

  it('on air, the plan stop numbers, the head count and named people', async () => {
    const list = await openList();
    expect(section(list, 'commons')!.querySelector('[data-testid="cm-list-onair-commons"]')).not.toBeNull();
    expect(section(list, 'library')!.querySelector('[data-testid="cm-list-onair-library"]')).toBeNull();
    expect(section(list, 'lecture')!.textContent).toContain("Today's plan: stop 1");
    expect(section(list, 'studio')!.textContent).toContain("Today's plan: stop 2");
    expect(section(list, 'commons')!.textContent).toContain('Avery Stone');
    expect(section(list, 'commons')!.textContent).toMatch(/3/);
  });

  it('the staff desks this audience may see, in their buildings', async () => {
    const list = await openList();
    for (const b of buildings) {
      const expected = desksForBuilding(DESKS as unknown as StaffDesk[], b.id, audience).map((d) => d.id).sort();
      const shown = Array.from(section(list, b.id)!.querySelectorAll('[data-testid^="cm-desk-"]'))
        .map((el) => el.getAttribute('data-testid')!).filter((t) => /^cm-desk-(reese|dara|maya)$/.test(t)).map((t) => t.slice(8)).sort();
      expect({ id: b.id, shown }).toEqual({ id: b.id, shown: expected });
    }
  });

  it('the bar offers the tour (not to staff), My look and Settings', async () => {
    const list = await openList();
    expect(!!list.querySelector('[data-testid="cm-list-tour"]')).toBe(audience !== 'staff');
    expect(list.querySelector('[data-testid="cm-list-look"]')).not.toBeNull();
    expect(list.querySelector('[data-testid="cm-settings-bar"]')).not.toBeNull();
  });
});

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('the Main Gate and admin rooms', () => {
  it('an Explorer gets the path to enrolling in the Main Gate entry', async () => {
    mockAudience = 'explorer';
    const list = await openList();
    expect(section(list, 'gate')!.querySelector('[data-testid="cm-path-cta"]')).not.toBeNull();
  });

  it('staff admin rooms are disabled without management access, new-tab links with it (the card\'s rule)', async () => {
    mockAudience = 'staff';
    let list = await openList();
    const disabled = section(list, 'career')!.querySelectorAll('[data-admin="true"]');
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach((el) => { expect(el.tagName).toBe('SPAN'); expect(el.getAttribute('aria-disabled')).toBe('true'); });
    act(() => root.unmount()); container.remove();
    mockMgmt = true;
    list = await openList();
    section(list, 'career')!.querySelectorAll('[data-admin="true"]').forEach((el) => {
      expect(el.tagName).toBe('A');
      expect(el.getAttribute('target')).toBe('_blank');
    });
  });

  it('filtering announces the count', async () => {
    mockAudience = 'member';
    const list = await openList();
    const input = list.querySelector('input.cm-filter') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'library');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(list.querySelector('[data-testid="cm-list-count"]')!.textContent).toBe('1 building match');
  });
});

describe('the side nav follows the same admin rule (C11)', () => {
  async function mountNav(): Promise<HTMLElement> {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Controls /><CampusNav active="/portal/today" /></CampusProvider></ParticipantAuthProvider></MemoryRouter>); });
    await flush();
    return document.querySelector('nav.cm-nav') as HTMLElement;
  }
  it('staff with management access: the Staff Office is a new-tab link, never an in-app route', async () => {
    mockAudience = 'staff'; mockMgmt = true;
    const nav = await mountNav();
    const admin = nav.querySelectorAll('[data-admin="true"]');
    expect(admin).toHaveLength(1);
    expect(admin[0].tagName).toBe('A');
    expect(admin[0].getAttribute('target')).toBe('_blank');
    expect(admin[0].textContent).toContain('Staff Office');
  });
  it('staff without management access: the Staff Office is disabled', async () => {
    mockAudience = 'staff'; mockMgmt = false;
    const nav = await mountNav();
    const admin = nav.querySelector('[data-admin="true"]')!;
    expect(admin.tagName).toBe('SPAN');
    expect(admin.getAttribute('aria-disabled')).toBe('true');
  });
});
