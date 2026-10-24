/**
 * C8 today's plan on the campus: read only when the campus is active AND cape_today_plan is on; Next walks through the door to
 * the first unfinished step outside this building; the full map draws the numbered route; one read survives navigation and a
 * map opening refreshes it once. A 404 (null) or an error shows nothing.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { TodayPlanItem, TodayPlanResponse } from '../../../services/capeApi';

let mockCampusOn = true;
let mockPlanFlag = true;
let mockPlan: TodayPlanResponse | null | 'error' = null;
let flagCalls = 0;
let planCalls = 0;
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: mockCampusOn }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
// WP-1: the campus home renders here too; its own services are mocked (no network). The suite's counted flags read is kept.
jest.mock('../../../services/onboardingApi', () => ({
  ...require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi')),
  fetchPortalFlags: () => { flagCalls += 1; return Promise.resolve({ today_redesign: true, cape_today_plan: mockPlanFlag }); },
}));
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));
jest.mock('../../../services/capeApi', () => ({
  fetchTodayPlan: () => { planCalls += 1; return mockPlan === 'error' ? Promise.reject(new Error('boom')) : Promise.resolve(mockPlan); },
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusBanner from '../CampusBanner';
// eslint-disable-next-line import/first
import CampusLocationBar from '../CampusLocationBar';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import CampusRail from '../CampusRail';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, signIn } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Where(): React.ReactElement { return <span data-testid="loc">{useLocation().pathname}</span>; }
let go: (path: string) => void = () => undefined;
function Capture(): null {
  const c = useCampus();
  go = useNavigate();
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = c;
  return null;
}
function Gated(): React.ReactElement | null {
  const c = useCampus();
  return c.active ? <><CampusLocationBar /><CampusBanner /><CampusRail /><CampusLayers /></> : null; // C16: Up next lives in the rail
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

const item = (o: Partial<TodayPlanItem>): TodayPlanItem => ({
  position: 0, kind: 'anchored', ref: 'card:x', surface: 'today', type: 'lesson', render_band: 'full', card_id: 'x', title: 'Step',
  status: 'available', chips: { why_this: '', level: '', proof: '' }, ...o,
} as unknown as TodayPlanItem);
const plan = (items: TodayPlanItem[]): TodayPlanResponse => ({ mode: 'active', items, estimated_total_minutes: 30 } as unknown as TodayPlanResponse);
const LESSON = item({ ref: 'card:l1', card_id: 'l1', title: 'Watch the agents lesson' });
const PROJECT = item({ ref: 'project:1', title: 'Finish the data pipeline task', project_id: 'p1', project_task_id: 't1' });

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
async function mount(path: string, nav: 'campus' | 'classic' = 'campus'): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav, workplaceNames: false, reduceMotion: true }));
  skipGate();
  signIn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={[path]}><ParticipantAuthProvider><CampusProvider><Capture /><WithCampusHome><Gated /></WithCampusHome><Where /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
beforeEach(() => { mockCampusOn = true; mockPlanFlag = true; mockPlan = plan([LESSON, PROJECT]); flagCalls = 0; planCalls = 0; });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); window.sessionStorage.clear(); document.body.innerHTML = ''; });

const loc = () => container.querySelector('[data-testid="loc"]')?.textContent;
const next = () => container.querySelector('[data-testid="cm-next"]') as HTMLButtonElement | null;

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('when the plan is read', () => {
  it('flag off: no plan request at all, no Next', async () => {
    mockPlanFlag = false;
    await mount('/portal/library');
    expect(planCalls).toBe(0);
    expect(next()).toBeNull();
  });
  it('campus off (classic nav): neither the flags nor the plan are requested', async () => {
    await mount('/portal/library', 'classic');
    expect(flagCalls).toBe(0);
    expect(planCalls).toBe(0);
  });
  it.each([['a 404 (null plan)', null], ['an error', 'error']])('%s: no Next and nothing broken', async (_n, p) => {
    mockPlan = p as null | 'error';
    await mount('/portal/library');
    expect(planCalls).toBe(1);
    expect(next()).toBeNull();
    expect(container.querySelector('[data-testid="cm-banner"]')).not.toBeNull();
  });
});

describe('Next (C16: no Next button in the bar; the rail\'s Up next carries the step)', () => {
  const upNext = (id: string) => container.querySelector(`[data-testid="cm-page-rail"] [data-testid="${id}"]`) as HTMLButtonElement | null;
  it('outside the Classroom, Up next names the first unfinished step and Open now goes through the door to the card\'s own page (WP-2)', async () => {
    await mount('/portal/library');
    expect(next()).toBeNull();
    expect(container.querySelector('[data-testid="cm-page-rail"] [data-testid="cm-up-next-title"]')?.textContent).toBe('Watch the agents lesson');
    act(() => { upNext('cm-up-next-now')!.click(); });
    await flush();
    expect(loc()).toBe('/portal/runtime/l1');
  });
  it('in the Classroom, Up next opens this building\'s own step with Open the card', async () => {
    await mount('/portal/classroom');
    act(() => { upNext('cm-up-next-open')!.click(); });
    await flush();
    expect(loc()).toBe('/portal/runtime/l1');
  });
  it('no Next once every step is done', async () => {
    mockPlan = plan([item({ ...LESSON, status: 'completed' }), item({ ...PROJECT, status: 'completed' })]);
    await mount('/portal/library');
    expect(next()).toBeNull();
  });
});

describe('the route on the full map', () => {
  it('numbers the unfinished stops in plan order (on the campus home, the one map)', async () => {
    await mount('/portal/library');
    act(() => { campus().openMap(); });
    await flush();
    expect(loc()).toBe('/portal/campus');
    expect(container.querySelector('[data-testid="cm-home"]')).not.toBeNull();
    // WP-2: numbered pins at each stop's building (the next one filled), and ONE teal route from the avatar (prototype renderPlanMap)
    const pins = Array.from(container.querySelectorAll('[data-testid^="cm-plan-pin-"]')).map((g) => [g.getAttribute('data-testid'), g.textContent]);
    expect(pins).toEqual([['cm-plan-pin-lecture', '1'], ['cm-plan-pin-studio', '2']]);
    expect(container.querySelector('[data-testid="cm-plan-pin-lecture"]')!.getAttribute('class')).toContain('is-next');
    expect(container.querySelector('[data-testid="cm-plan-pin-studio"]')!.getAttribute('class')).not.toContain('is-next');
    expect(container.querySelectorAll('[data-testid="cm-plan-path"]').length).toBe(1);
    expect(container.querySelector('[data-testid^="cm-route-stop-"]')).toBeNull();
  });
  it('a tour hides the plan (route and pins) and shows its STOP badges instead, as the prototype does (WP-2)', async () => {
    await mount('/portal/library');
    act(() => { campus().openMap(); });
    await flush();
    expect(container.querySelectorAll('[data-testid="cm-plan-path"]').length).toBe(1);
    act(() => { campus().startTour(); });
    await flush();
    expect(container.querySelector('[data-testid="cm-plan-path"]')).toBeNull();
    expect(container.querySelector('[data-testid^="cm-plan-pin-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="cm-tour-stop-"]')).not.toBeNull();
  });
  it('the mini-map in the banner draws no route', async () => {
    await mount('/portal/library');
    expect(container.querySelector('.cm-banner [data-testid^="cm-plan"]')).toBeNull();
  });
});

describe('one read per campus session', () => {
  it('navigation does not re-read; opening the map refreshes once', async () => {
    await mount('/portal/library');
    expect([flagCalls, planCalls]).toEqual([1, 1]);
    await act(async () => { go('/portal/today'); });
    await act(async () => { go('/portal/community'); });
    await flush();
    expect([flagCalls, planCalls]).toEqual([1, 1]);
    act(() => { campus().openMap(); });
    await flush();
    expect(loc()).toBe('/portal/campus');
    expect([flagCalls, planCalls]).toEqual([1, 2]);
  });
});
