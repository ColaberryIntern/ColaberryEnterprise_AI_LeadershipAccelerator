/**
 * C11b panels: the Me panel (who you are, the locker, real campus settings only), the DM toast's Walk over (only when presence
 * places the sender somewhere), and the list view as the prototype's directory (today's plan first, a one-line description and
 * "Walk there on the map" per building).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 1252, rung_name: 'AI Enabled II', equipped: {}, catalog: [] }), putLook: () => Promise.resolve({}),
}));
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../services/onboardingApi'), fetchPortalFlags: () => Promise.resolve({ cape_today_plan: true }) }));
jest.mock('../../../services/capeApi', () => ({
  ...jest.requireActual('../../../services/capeApi'),
  fetchTodayPlan: () => Promise.resolve({ mode: 'plan', estimated_total_minutes: 30, items: [{ position: 0, kind: 'anchored', ref: 'r1', card_id: 'c1', title: 'Lesson 2', subtitle: null, description: null, status: 'open', slot: 'next', chips: [] }] }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusMePanel from '../home/CampusMePanel';
// eslint-disable-next-line import/first
import { ENTRANCE_KEY } from '../home/campusEntrance';
// eslint-disable-next-line import/first
import { DmToastView } from '../CampusDmToast';
// eslint-disable-next-line import/first
import CampusListView from '../CampusListView';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(15000);

let container: HTMLDivElement;
let root: Root;
let campus: ReturnType<typeof useCampus>;
function Grab(): null { campus = useCampus(); return null; }
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => container.querySelector(s);

async function mount(node: React.ReactNode): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Grab />{node}</CampusProvider></ParticipantAuthProvider></MemoryRouter>); });
  await flush();
}
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

describe('the Me panel', () => {
  it('shows who you are and your level, and changes only real settings', async () => {
    const closed: number[] = [];
    await mount(<CampusMePanel audience="member" fullName="Ali Muwwakkil" initials="AM" photo={null} onClose={() => closed.push(1)} />);
    expect(q('[data-testid="cm-me"]')!.textContent).toContain('Ali Muwwakkil');
    expect(q('[data-testid="cm-me-level"]')!.textContent).toContain('AI Enabled II · 1,252 pts');
    expect(q('[data-testid="cm-me"]')!.textContent).toMatch(/which building I/i); // WP-7 (Q14): a real switch now
    // no locked item in this catalog: no progress line (nothing invented)
    expect(q('[data-testid="cm-me-next"]')).toBeNull();
    act(() => { (q('[data-testid="cm-me-classic"]') as HTMLButtonElement).click(); });
    expect(campus.settings.nav).toBe('classic');
    act(() => { const s = q('[data-testid="cm-me-entrance"]') as HTMLSelectElement; s.value = 'never'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(window.localStorage.getItem(ENTRANCE_KEY)).toBe('never'); // WP-7: daily / every time / never
    act(() => { const s = q('[data-testid="cm-me-entrance"]') as HTMLSelectElement; s.value = 'always'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(window.localStorage.getItem(ENTRANCE_KEY)).toBe('always');
    act(() => { q('[data-testid="cm-me"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(closed).toEqual([1]);
  });
});

describe('the message toast', () => {
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  const toast = { key: 'k', peerId: 'e1', peerName: 'Avery Stone' };
  it('offers Walk over only when the sender is somewhere on campus', () => {
    const walked: number[] = [];
    act(() => { root.render(<MemoryRouter><DmToastView toast={toast} onDismiss={() => undefined} onWalkOver={() => walked.push(1)} /></MemoryRouter>); });
    act(() => { (q('[data-testid="cm-dm-toast-walk"]') as HTMLButtonElement).click(); });
    expect(walked).toEqual([1]);
    act(() => { root.render(<MemoryRouter><DmToastView toast={toast} onDismiss={() => undefined} /></MemoryRouter>); });
    expect(q('[data-testid="cm-dm-toast-walk"]')).toBeNull();
  });
});

describe('the list view as the campus directory', () => {
  it('today’s plan first, a description per building, and Walk there on the map', async () => {
    await mount(<CampusListView />);
    act(() => { campus.openList(); });
    await flush();
    expect(q('[data-testid="cm-list-plan"]')!.textContent).toContain('Lesson 2');
    expect(q('[data-building="library"] .cm-list-line')!.textContent).toBe('Curriculum, lessons & reference'); // WP-2: the prototype's short line for the building
    act(() => { (q('[data-testid="cm-list-walk-library"]') as HTMLButtonElement).click(); });
    expect(campus.layer).toBe('map');
    expect(campus.mapFocus).toBe('library');
  });
});
