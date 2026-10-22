/**
 * C7 guided tour UI, on WP-1's one map: "Take the tour" (the page's side column, or the home's side panel) lands on the campus
 * home on stop 1; Next / Back / Finish / Done / End; the avatar walks to each stop; the tour card replaces the building card; End
 * tour and Esc pause the tour (Resume picks it up), Done finishes it; leaving the home pauses it; staff get no tour; member and
 * business tours never call the server.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useNavigate } from 'react-router-dom';

let mockAudience: 'member' | 'explorer' | 'business' | 'staff' = 'member';
let tourPosts = 0;
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve(mockAudience === 'explorer' ? [{ id: 'maya', name: 'Maya', title: 'Welcome desk', building: 'gate', ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] }] : []), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  postTourComplete: () => { tourPosts += 1; return Promise.resolve({ handoff: true, reason: 'created' }); },
}));
// WP-1: the campus home renders here too; its own services are mocked (no network). The suite's flag stays on.
jest.mock('../../../services/onboardingApi', () => {
  const m = require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi'));
  return { ...m, fetchPortalFlags: () => Promise.resolve({ today_redesign: true }) };
});
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, { isStaff: mockAudience === 'staff', hasFullAccess: true, isExplorer: mockAudience === 'explorer' }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus, tourKey } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import CampusNav from '../CampusNav';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';
// eslint-disable-next-line import/first
import { doorOf } from '../CampusWorldMap';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, signIn, where, Where } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => undefined);

type Go = (to: string) => void;
function Capture(): null {
  const c = useCampus();
  const navigate = useNavigate();
  (window as unknown as { __campus: ReturnType<typeof useCampus>; __go: Go }).__campus = c;
  (window as unknown as { __go: Go }).__go = navigate;
  return null;
}
function Gated(): React.ReactElement | null {
  const c = useCampus();
  return c.active ? <><CampusNav active="/portal/library" /><CampusLayers /></> : null;
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;
const go = (to: string) => (window as unknown as { __go: Go }).__go(to);

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
async function mount(): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  skipGate();
  signIn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={['/portal/library']}><ParticipantAuthProvider><CampusProvider><Where /><Capture /><WithCampusHome><Gated /></WithCampusHome></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
beforeEach(() => { mockAudience = 'member'; tourPosts = 0; });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); window.sessionStorage.clear(); document.body.innerHTML = ''; });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (id: string) => { await act(async () => { q(id)!.click(); }); await flush(); };
const avatarAt = () => container.querySelector('[data-testid="cm-avatar"]')?.getAttribute('transform') ?? '';
const doorFor = (id: string) => { const d = doorOf(CAMPUS_BUILDINGS.find((b) => b.id === id)!); return `translate(${d.x} ${d.y})`; };
const saved = () => JSON.parse(window.localStorage.getItem(tourKey()) || 'null') as { paused: number | null; toured: boolean } | null;

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('starting the tour', () => {
  it('the side column button lands on the campus home on stop 1 of 9: the tour inside the arrival panel, the room behind it (WP-2)', async () => {
    await mount();
    await click('cm-tour-start');
    expect(where.path).toBe('/portal/campus');
    expect(q('cm-home')).not.toBeNull();
    expect(q('cm-card')?.getAttribute('data-building')).toBe('lecture');
    expect(container.querySelector('[data-testid="cm-card"] [data-testid="cm-tour"]')).not.toBeNull();
    expect(q('cm-arrive-kicker')?.textContent).toBe('What’s in your seat · stop 1 of 9');
    expect(q('cm-tour-title')?.textContent).toBe('Your classroom');
    expect(q('cm-tour-tip')?.textContent).toContain('replays');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 1 of 9');
    expect(document.activeElement?.id).toBe('cm-card-lecture'); // the panel's heading takes focus at each stop
    expect(q('cm-inside')).not.toBeNull(); // the room shows during the tour, as the prototype's flyIn
    expect(avatarAt()).toContain(doorFor('lecture'));
    expect(q('cm-tour-stop-lecture')?.getAttribute('class')).toContain('is-live'); // STOP badges on the map, the current one green
    expect(q('cm-tour-stop-arcade')?.textContent).toBe('STOP 9');
  });

  it('the home side panel offers it too, and shows it running (no Start) while touring', async () => {
    await mount();
    act(() => { campus().openMap(); });
    await flush();
    expect(where.path).toBe('/portal/campus');
    expect(q('cm-cc-tour')?.getAttribute('data-state')).toBe('idle');
    await click('cm-cc-tour-start');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 1 of 9');
    expect(q('cm-cc-tour')?.getAttribute('data-state')).toBe('running');
    expect(q('cm-cc-tour-start')).toBeNull();
  });

  it('staff: no tour button anywhere, and starting one shows nothing', async () => {
    mockAudience = 'staff';
    await mount();
    expect(q('cm-tour-start')).toBeNull();
    act(() => { campus().openMap(); });
    await flush();
    expect(q('cm-home')).not.toBeNull();
    expect(q('cm-cc-tour')).toBeNull();
    act(() => { campus().startTour(); });
    await flush();
    expect(q('cm-tour')).toBeNull();
  });
});

describe('moving through it', () => {
  it('"Next: <building> →" walks to the next stop; there is no Back (the prototype has none)', async () => {
    await mount();
    await click('cm-tour-start');
    expect(q('cm-tour-back')).toBeNull();
    expect(q('cm-tour-next')?.textContent).toBe('Next: Library →');
    await click('cm-tour-next');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 2 of 9');
    expect(q('cm-card')?.getAttribute('data-building')).toBe('library');
    expect(q('cm-arrive-kicker')?.textContent).toBe('What’s in your seat · stop 2 of 9');
    expect(avatarAt()).toContain(doorFor('library'));
    expect(document.activeElement?.id).toBe('cm-card-library');
  });

  it('member: the last stop says "Finish tour ✓"; finishing closes the panel, marks it taken, and the lead says so (no server call)', async () => {
    await mount();
    await click('cm-tour-start');
    for (let i = 0; i < 8; i++) await click('cm-tour-next');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 9 of 9');
    expect(q('cm-tour-next')?.textContent).toBe('Finish tour ✓');
    await click('cm-tour-next');
    expect(q('cm-card')).toBeNull();
    expect(q('cm-tour-optin')).toBeNull();
    expect(q('cm-cc-lead')?.textContent).toContain('That’s everything in your seat');
    expect(campus().tourIndex).toBeNull();
    expect(campus().tourProgress).toEqual({ paused: null, toured: true });
    expect(saved()).toEqual({ paused: null, toured: true });
    expect(q('cm-cc-tour')?.getAttribute('data-state')).toBe('done');
    expect(where.path).toBe('/portal/campus');
    expect(tourPosts).toBe(0);
  });

  it('business: six stops ending at the Partner Office, no server call', async () => {
    mockAudience = 'business';
    await mount();
    await click('cm-tour-start');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 1 of 6');
    for (let i = 0; i < 5; i++) await click('cm-tour-next');
    expect(container.querySelector('#cm-card-career')?.textContent).toBe('Partner Office');
    expect(q('cm-tour-title')?.textContent).toBe('Your partner office');
    await click('cm-tour-next');
    expect(campus().tourProgress.toured).toBe(true);
    expect(q('cm-tour-optin')).toBeNull();
    expect(tourPosts).toBe(0);
  });

  it('Explorer: seven stops; "Finish · see what you\'d unlock" opens the unlock sheet with the opt-in (Q10)', async () => {
    mockAudience = 'explorer';
    await mount();
    await click('cm-tour-start');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 1 of 7');
    for (let i = 0; i < 6; i++) await click('cm-tour-next');
    expect(q('cm-tour-next')?.textContent).toBe('Finish · see what you’d unlock →');
    await click('cm-tour-next');
    expect(q('cm-unlock')).not.toBeNull();
    expect(q('cm-tour-optin')).not.toBeNull();
    expect(tourPosts).toBe(0); // nothing is sent until the learner clicks
    await click('cm-tour-signup');
    expect(q('cm-explorer-path')).not.toBeNull();
    expect(q('cm-path-maya')).toBeNull(); // Maya is on duty, but the tour card has no desk below it
  });
});

describe('ending it', () => {
  it('End tour pauses the tour on its stop, stays on the home, and Resume picks it up there', async () => {
    await mount();
    await click('cm-tour-start');
    await click('cm-tour-next');
    await click('cm-tour-stop');
    expect(q('cm-tour')).toBeNull();
    expect(where.path).toBe('/portal/campus');
    expect(campus().tourProgress.paused).toBe(1);
    expect(saved()).toEqual({ paused: 1, toured: false });
    expect(q('cm-cc-tour')?.getAttribute('data-state')).toBe('paused');
    await click('cm-cc-tour-resume');
    expect(q('cm-tour-count')?.getAttribute('aria-label')).toBe('Stop 2 of 9');
  });

  it('the side panel End tour pauses it too', async () => {
    await mount();
    await click('cm-tour-start');
    await click('cm-cc-tour-end');
    expect(q('cm-tour')).toBeNull();
    expect(campus().tourProgress.paused).toBe(0);
  });

  it('Esc ends (pauses) the tour and stays on the home', async () => {
    await mount();
    await click('cm-tour-start');
    await act(async () => { q('cm-tour')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush();
    expect(q('cm-tour')).toBeNull();
    expect(campus().tourProgress.paused).toBe(0);
    expect(where.path).toBe('/portal/campus');
    expect(q('cm-home')).not.toBeNull();
  });

  it('leaving the home pauses the tour', async () => {
    await mount();
    await click('cm-tour-start');
    await click('cm-tour-next');
    await act(async () => { go('/portal/library'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); // the home pauses one tick after it unmounts
    await flush();
    expect(where.path).toBe('/portal/library');
    expect(campus().tourIndex).toBeNull();
    expect(campus().tourProgress.paused).toBe(1);
  });
});
