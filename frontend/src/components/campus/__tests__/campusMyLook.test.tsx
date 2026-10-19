/**
 * C9 My look: earned items can be worn (one per slot; clicking what you wear takes it off), locked ones say their points; every
 * change saves the complete set; a failed save keeps the previous look and says why; the copy never says "free" or "buy". The
 * locker opens from the side column and the map bar, and your avatar wears what you saved.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { CampusLook } from '../campusApi';

const catalog = [
  { id: 'cap', name: 'Cohort cap', slot: 'head', threshold: 150, unlocked: true },
  { id: 'board', name: 'Skateboard', slot: 'ride', threshold: 150, unlocked: true },
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
jest.mock('../../../services/onboardingApi', () => ({ fetchPortalFlags: () => Promise.resolve({ today_redesign: true }) }));
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
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Gated(): React.ReactElement | null {
  const c = useCampus();
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = c;
  return c.active ? <><CampusNav active="/portal/library" /><CampusLayers /></> : null;
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
async function mount(): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={['/portal/library']}><ParticipantAuthProvider><CampusProvider><Gated /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
beforeEach(() => {
  mockLook = { points: 200, rung_name: 'AI Aware II', catalog, equipped: {} };
  mockPut = async (eq) => ({ ...mockLook, equipped: Object.fromEntries(Object.entries(eq).filter(([, v]) => v)) as Record<string, string> });
  puts.length = 0; mockFetchFails = false;
});
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); document.body.innerHTML = ''; });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
const click = async (id: string) => { await act(async () => { q(id)!.click(); }); await flush(); };

describe('the locker', () => {
  it('opens from the side column on the map: points, level, earned vs locked', async () => {
    await mount();
    await click('cm-look-open');
    expect(q('cm-overlay')).not.toBeNull();
    expect(q('cm-look-points')?.textContent).toBe('AI Aware II · 200 points. Gear is earned with points, never bought.');
    expect(q('cm-look-item-cap')?.disabled).toBe(false);
    expect(q('cm-look-item-hoodie')?.disabled).toBe(true);
    expect(q('cm-look-item-hoodie')?.textContent).toContain('Earned at 400 points');
    expect(document.activeElement?.id).toBe('cm-look-h');
  });

  it('wearing an item saves the complete set and your avatar wears it; clicking it again takes it off', async () => {
    await mount();
    await click('cm-look-open');
    await click('cm-look-item-cap');
    expect(puts).toEqual([{ head: 'cap' }]);
    expect(q('cm-look-item-cap')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="cm-avatar"] [data-gear="cap"]')).not.toBeNull();
    await click('cm-look-item-cap');
    expect(puts[1]).toEqual({ head: null });
    expect(container.querySelector('[data-testid="cm-avatar"] [data-gear="cap"]')).toBeNull();
  });

  it('a refused save keeps the previous look and shows the server\'s reason', async () => {
    mockPut = () => Promise.reject(new Error('Cohort cap is earned at 150 points'));
    await mount();
    await click('cm-look-open');
    await click('cm-look-item-cap');
    expect(q('cm-look-error')?.textContent).toBe('Cohort cap is earned at 150 points');
    expect(q('cm-look-item-cap')?.getAttribute('aria-pressed')).toBe('false');
    expect(campus().look?.equipped).toEqual({});
  });

  it('a failed read: the locker says so, the map still works', async () => {
    mockFetchFails = true;
    await mount();
    await click('cm-look-open');
    expect(q('cm-look-broken')?.textContent).toBe("We can't load your look right now.");
  });

  it('opens from the map bar too; Esc closes the locker, not the map', async () => {
    await mount();
    act(() => { campus().openMap(); });
    await flush();
    await click('cm-look-open-bar');
    expect(q('cm-look')).not.toBeNull();
    await act(async () => { q('cm-look')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush();
    expect(q('cm-look')).toBeNull();
    expect(q('cm-overlay')).not.toBeNull();
  });

  it('copy never says "free" or "buy"', async () => {
    await mount();
    await click('cm-look-open');
    expect(q('cm-look')?.textContent).not.toMatch(/\bfree\b|\bbuy\b/i);
  });
});
