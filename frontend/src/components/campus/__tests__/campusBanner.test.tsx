/**
 * C3 campus banner: shown only while the campus is active; the trail names where you are; the
 * mini-map and "Step outside" open the map at this building; page-level Esc steps outside unless
 * something else owns the key press (D6 guard matrix).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockCampusOn = true;
// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: mockCampusOn }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => ({ audience: 'member', hasFullAccess: true, buildings: actual.campusBuildingsFor('member') }) };
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
import { shouldStepOutside } from '../campusEsc';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Gated(): React.ReactElement | null {
  const c = useCampus();
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = c;
  return c.active ? <><CampusBanner /><CampusLayers /></> : null; // every real page renders both
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

let container: HTMLDivElement;
let root: Root;
async function mount(path: string, on = true, nav: 'campus' | 'classic' = 'campus'): Promise<void> {
  mockCampusOn = on;
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav, workplaceNames: false, reduceMotion: true }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={[path]}><ParticipantAuthProvider><CampusProvider><Gated /><input data-testid="field" /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); document.body.innerHTML = ''; });

const banner = () => container.querySelector('[data-testid="cm-banner"]');
const trail = () => Array.from(container.querySelectorAll('[data-testid="cm-trail"] li')).map((li) => li.textContent);
const esc = (init: KeyboardEventInit = {}) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })); });

describe('banner visibility', () => {
  it('renders when the campus is active', async () => {
    await mount('/portal/today');
    expect(banner()).not.toBeNull();
  });
  it('is absent when the flag is off', async () => {
    await mount('/portal/today', false);
    expect(banner()).toBeNull();
  });
  it('is absent when the learner switched back to the classic nav', async () => {
    await mount('/portal/today', true, 'classic');
    expect(banner()).toBeNull();
  });
});

describe('trail and map buttons', () => {
  it('reads Campus > building > room, with the room as the current page', async () => {
    await mount('/portal/today');
    expect(trail()).toEqual(['Campus', 'Schedule', 'Today']);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Today');
  });
  it('a page under a building but not a room reads Campus > building', async () => {
    await mount('/portal/classroom/week/3');
    expect(trail()).toEqual(['Campus', 'Classroom']);
  });
  it('the mini-map opens the map focused on this building', async () => {
    await mount('/portal/library');
    await act(async () => { (container.querySelector('.cm-banner-mini') as HTMLButtonElement).click(); });
    expect(campus().layer).toBe('map');
    expect(campus().mapFocus).toBe('library');
  });
  it('"Step outside" opens the map at this building', async () => {
    await mount('/portal/schedule');
    await act(async () => { (container.querySelector('[data-testid="cm-step-out"]') as HTMLButtonElement).click(); });
    expect(campus().layer).toBe('map');
    expect(campus().mapFocus).toBe('tower');
  });
  it('the "Campus" crumb opens the whole map with no focus', async () => {
    await mount('/portal/library');
    await act(async () => { (container.querySelector('[data-testid="cm-trail"] button') as HTMLButtonElement).click(); });
    expect(campus().layer).toBe('map');
    expect(campus().mapFocus).toBeNull();
  });
});

describe('Esc steps outside (D6 guard)', () => {
  it('a plain Esc on the page steps outside to this building', async () => {
    await mount('/portal/library');
    esc();
    expect(campus().layer).toBe('map');
    expect(campus().mapFocus).toBe('library');
  });
  it('an open aria-modal dialog keeps the Esc', async () => {
    await mount('/portal/library');
    const d = document.createElement('div'); d.setAttribute('aria-modal', 'true'); document.body.appendChild(d);
    esc();
    expect(campus().layer).toBe('none');
  });
  it('a role="dialog" drawer keeps the Esc', async () => {
    await mount('/portal/library');
    const d = document.createElement('aside'); d.setAttribute('role', 'dialog'); document.body.appendChild(d);
    esc();
    expect(campus().layer).toBe('none');
  });
  it('an Esc another handler already claimed (defaultPrevented) is ignored', async () => {
    await mount('/portal/library');
    const claim = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', claim, { capture: true });
    esc();
    window.removeEventListener('keydown', claim, { capture: true });
    expect(campus().layer).toBe('none');
  });
  it('Esc while typing in a field is left to the field', async () => {
    await mount('/portal/library');
    (container.querySelector('[data-testid="field"]') as HTMLInputElement).focus();
    esc();
    expect(campus().layer).toBe('none');
  });
  it('Esc with a modifier is ignored', async () => {
    await mount('/portal/library');
    esc({ shiftKey: true });
    expect(campus().layer).toBe('none');
  });
  it('with a campus layer already open, Esc does not reopen or refocus it', async () => {
    await mount('/portal/library');
    await act(async () => { campus().openList(); });
    esc();
    expect(campus().layer).toBe('list');
  });
  it('fullscreen keeps the Esc (pure guard)', () => {
    const doc = { activeElement: null, fullscreenElement: {}, querySelector: () => null } as unknown as Document;
    const e = { key: 'Escape', defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(shouldStepOutside(e, false, doc)).toBe(false);
    expect(shouldStepOutside(e, false, { ...doc, fullscreenElement: null } as unknown as Document)).toBe(true);
  });
  it('the listener is removed when the banner unmounts', async () => {
    await mount('/portal/library');
    act(() => root.unmount());
    root = createRoot(container); // afterEach unmounts this empty root
    expect(() => esc()).not.toThrow();
  });
});
