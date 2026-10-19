/**
 * The full-screen campus layers (C2): the overlay's two-step Escape and focus return, and the
 * list view's completeness per audience.
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

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import { campusBuildingsFor } from '../useCampusView';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Openers(): React.ReactElement {
  const { openMap, openList } = useCampus();
  return <><button data-testid="open-map" onClick={() => openMap()}>map</button><button data-testid="open-list" onClick={openList}>list</button></>;
}

let container: HTMLDivElement;
let root: Root;
async function mount(): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><CampusProvider><Openers /><CampusLayers /></CampusProvider></MemoryRouter>);
  });
}
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const esc = (el: Element) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

describe('campus map overlay', () => {
  it('Esc closes the open card first, then the overlay, and focus returns to the opener', async () => {
    mockAudience = 'member';
    await mount();
    const opener = q('[data-testid="open-map"]')!;
    act(() => opener.focus());
    click(opener);
    expect(q('[data-testid="cm-overlay"]')).not.toBeNull();
    click(q('.cm-bld[data-building="library"]')!);
    expect(q('[data-testid="cm-card"]')).not.toBeNull();
    esc(q('[data-testid="cm-card"]')!);
    expect(q('[data-testid="cm-card"]')).toBeNull();
    expect(q('[data-testid="cm-overlay"]')).not.toBeNull();
    esc(q('.cm-bld[data-building="library"]')!);
    expect(q('[data-testid="cm-overlay"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('following a link out of a card closes the overlay', async () => {
    mockAudience = 'member';
    await mount();
    click(q('[data-testid="open-map"]')!);
    click(q('.cm-bld[data-building="library"]')!);
    click(q('[data-testid="cm-card"] a.cm-room')!);
    expect(q('[data-testid="cm-overlay"]')).toBeNull();
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
    expect(list.querySelector('[data-building="career"] h3')!.textContent).toContain(face);
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
