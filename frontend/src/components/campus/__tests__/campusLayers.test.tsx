/**
 * The campus layers (C2) and WP-1's one map: opening the map from a page goes to the campus home (/portal/campus), where Esc
 * closes an open card; and the list view's completeness per audience.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { CampusAudience } from '../campusMap';

// The view hook reads entitlement and audience from the network; here the audience is set per test.
let mockAudience: CampusAudience = 'member';
// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, { isStaff: false, hasFullAccess: false, isExplorer: mockAudience === 'explorer' }) };
});
jest.mock('../campusApi', () => ({ fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  // C4 presence: a quiet campus (no one in any building).
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false }));

// WP-1: the campus home renders here too; its own services are mocked (no network).
jest.mock('../../../services/onboardingApi', () => require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi')));
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import { campusBuildingsFor } from '../useCampusView';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, signIn, where, Where } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Openers(): React.ReactElement {
  const { openMap, openList } = useCampus();
  return <><button data-testid="open-map" onClick={() => openMap()}>map</button><button data-testid="open-list" onClick={openList}>list</button></>;
}

let container: HTMLDivElement;
let root: Root;
async function mount(): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  skipGate();
  signIn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={['/portal/library']}><ParticipantAuthProvider><CampusProvider><Where /><WithCampusHome><Openers /><CampusLayers /></WithCampusHome></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
}
const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const esc = (el: Element) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('one map (WP-1)', () => {
  it('opening the map from a page goes to the campus home; Esc closes the open card and the side panel stays', async () => {
    mockAudience = 'member';
    await mount();
    click(q('[data-testid="open-map"]')!);
    await settle();
    expect(where.path).toBe('/portal/campus');
    expect(q('[data-testid="cm-home"]')).not.toBeNull();
    expect(q('[data-testid="cm-overlay"]')).toBeNull();
    click(q('.cm-bld[data-building="library"]')!);
    await settle();
    expect(q('[data-testid="cm-card"]')).not.toBeNull();
    expect(q('[data-testid="cm-concierge"]')).not.toBeNull();
    esc(q('[data-testid="cm-card"]')!);
    await settle();
    expect(q('[data-testid="cm-card"]')).toBeNull();
    expect(q('[data-testid="cm-concierge"]')!.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement?.getAttribute('data-building')).toBe('library');
  });

  it('following a room link out of a card on the home opens that page', async () => {
    mockAudience = 'member';
    await mount();
    click(q('[data-testid="open-map"]')!);
    await settle();
    click(q('.cm-bld[data-building="library"]')!);
    await settle();
    const room = q('[data-testid="cm-card"] a.cm-room')!;
    const href = room.getAttribute('href');
    click(room);
    await settle();
    expect(where.path).toBe(href);
  });
});

describe('campus list view', () => {
  it.each(['member', 'explorer', 'business', 'staff'] as CampusAudience[])('lists every building and room the %s sees', async (aud) => {
    mockAudience = aud;
    await mount();
    click(q('[data-testid="open-list"]')!);
    const list = q('[data-testid="cm-list"]')!;
    for (const b of campusBuildingsFor(aud).filter((x) => x.id !== 'gate')) {
      expect(list.querySelector(`[data-building="${b.id}"]`)).not.toBeNull();
      for (const r of b.rooms) expect(list.textContent).toContain(r.label);
    }
    // C10 shipped the Game Room: it is a real link now.
    expect(list.querySelector('a[href="/portal/game-room"]')).not.toBeNull();
    // The career building shows the audience face.
    const face = { member: 'Career Center', explorer: 'Career Center', business: 'Partner Office', staff: 'Staff Office' }[aud];
    expect(list.querySelector('[data-building="career"] h2')!.textContent).toContain(face); // C11: buildings are h2 in the list dialog
  });

  it('the filter narrows to matching buildings and rooms, and Esc closes', async () => {
    mockAudience = 'member';
    await mount();
    click(q('[data-testid="open-list"]')!);
    const input = q('.cm-filter') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'portfolio');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const shown = Array.from(container.querySelectorAll('[data-testid="cm-list"] [data-building]')).map((e) => e.getAttribute('data-building'));
    expect(shown).toEqual(['gallery']);
    esc(input);
    expect(q('[data-testid="cm-list"]')).toBeNull();
  });
});
