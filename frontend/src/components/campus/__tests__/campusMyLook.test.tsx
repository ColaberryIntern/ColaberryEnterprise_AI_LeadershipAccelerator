/**
 * C9 My look: earned items can be worn (one per slot; clicking what you wear takes it off), locked ones say their points; every
 * change saves the complete set; a failed save keeps the previous look and says why; the copy never says "free" or "buy". The
 * locker opens from the side column (or the list view) onto WP-1's one map, the campus home, and your avatar wears what you saved.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { CampusLook } from '../campusApi';

const catalog = [
  { id: 'cap', name: 'Cohort cap', slot: 'head', threshold: 150, unlocked: true },
  { id: 'jacket', name: 'Campus jacket', slot: 'body', threshold: 150, unlocked: true },
  { id: 'hoodie', name: 'Colaberry hoodie', slot: 'body', threshold: 400, unlocked: false },
] as CampusLook['catalog'];
let mockLook: CampusLook = { points: 200, rung_name: 'AI Aware II', catalog, equipped: {} };
let mockPut: (eq: Record<string, string | null>) => Promise<CampusLook> = async (eq) => ({ ...mockLook, equipped: Object.fromEntries(Object.entries(eq).filter(([, v]) => v)) as Record<string, string> });
const puts: Array<Record<string, string | null>> = [];
let mockFetchFails = false;
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  postTourComplete: () => Promise.resolve({ handoff: false, reason: 'disabled' }),
  fetchLook: () => (mockFetchFails ? Promise.reject(new Error('down')) : Promise.resolve(mockLook)),
  putLook: (eq: Record<string, string | null>) => { puts.push(eq); return mockPut(eq); },
}));
// WP-1: the campus home renders here too; its own services are mocked (no network). The suite's flag stays on.
jest.mock('../../../services/onboardingApi', () => {
  const m = require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi'));
  return { ...m, fetchPortalFlags: () => Promise.resolve({ today_redesign: true }) };
});
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import CampusNav from '../CampusNav';
// eslint-disable-next-line import/first
import CampusMeHost from '../home/CampusMeHost';
// eslint-disable-next-line import/first
import CampusLocationBar from '../CampusLocationBar';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, signIn, where, Where } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Capture(): null {
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = useCampus();
  return null;
}
function Gated(): React.ReactElement | null {
  const c = useCampus();
  return c.active ? <><CampusLocationBar /><CampusNav active="/portal/library" /><CampusLayers /><CampusMeHost /></> : null;
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

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
beforeEach(() => {
  mockLook = { points: 200, rung_name: 'AI Aware II', catalog, equipped: {} };
  mockPut = async (eq) => ({ ...mockLook, equipped: Object.fromEntries(Object.entries(eq).filter(([, v]) => v)) as Record<string, string> });
  puts.length = 0; mockFetchFails = false;
});
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); window.sessionStorage.clear(); document.body.innerHTML = ''; });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
const click = async (id: string) => { await act(async () => { q(id)!.click(); }); await flush(); };

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('the locker', () => {
  it('opens the Me panel where you are (WP-7): points, level, earned vs locked tiles', async () => {
    await mount();
    await click('cm-banner-me');
    expect(where.path).toBe('/portal/library');
    expect(q('cm-me')).not.toBeNull();
    expect(q('cm-me-level')?.textContent).toContain('AI Aware II · 200 pts');
    expect(q('cm-look-item-cap')?.disabled).toBe(false);
    expect(q('cm-look-item-hoodie')?.disabled).toBe(true);
    expect(q('cm-look-item-hoodie')?.textContent).toContain('🔒 400 pts');
    expect(document.activeElement?.id).toBe('cm-me-name');
  });

  it('wearing an item saves the complete set and your figure wears it; clicking it again takes it off', async () => {
    await mount();
    await click('cm-banner-me');
    await click('cm-look-item-cap');
    expect(puts).toEqual([{ head: 'cap' }]);
    expect(q('cm-look-item-cap')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="cm-me-figure"] [data-gear="cap"]')).not.toBeNull();
    await click('cm-look-item-cap');
    expect(puts[1]).toEqual({ head: null });
    expect(container.querySelector('[data-testid="cm-me-figure"] [data-gear="cap"]')).toBeNull();
  });

  it('a refused save keeps the previous look and shows the server\'s reason', async () => {
    mockPut = () => Promise.reject(new Error('Cohort cap is earned at 150 points'));
    await mount();
    await click('cm-banner-me');
    await click('cm-look-item-cap');
    expect(q('cm-look-error')?.textContent).toBe('Cohort cap is earned at 150 points');
    expect(q('cm-look-item-cap')?.getAttribute('aria-pressed')).toBe('false');
    expect(campus().look?.equipped).toEqual({});
  });

  it('a failed read: the locker says so, the map still works', async () => {
    mockFetchFails = true;
    await mount();
    await click('cm-banner-me');
    expect(q('cm-look-broken')?.textContent).toBe('We can’t load your locker right now.');
  });

  it('opens from the list view on the home too; Esc closes the panel and stays on the home', async () => {
    await mount();
    act(() => { campus().openMap(); });
    await flush();
    expect(where.path).toBe('/portal/campus');
    act(() => { campus().openList(); });
    await flush();
    await click('cm-list-look');
    expect(q('cm-me')).not.toBeNull();
    expect(q('cm-look')).not.toBeNull();
    await act(async () => { q('cm-me')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush();
    expect(q('cm-me')).toBeNull();
    expect(where.path).toBe('/portal/campus');
    expect(q('cm-home')).not.toBeNull();
  });

  it('copy never says "free" or "buy"', async () => {
    await mount();
    await click('cm-banner-me');
    expect(q('cm-look')?.textContent).not.toMatch(/\bfree\b|\bbuy\b/i);
  });
});
