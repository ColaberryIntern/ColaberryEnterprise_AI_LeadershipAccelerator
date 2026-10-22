/**
 * C11b campus home (/portal/campus) and the landing rule (D1):
 *  - the home renders the world, the top bar and the concierge from real data, per account;
 *  - "open the map" on the home becomes a walk on this map (the overlay never opens on top of it);
 *  - with the campus off it is not a campus page: it goes to Today with ?stay=1;
 *  - the landing rule sends a tab's FIRST visit to Today to the campus home, once, never with ?stay=1 or the campus off.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let mockAudience: 'member' | 'explorer' | 'business' | 'staff' = 'member';
let mockFlag = true;
const mockPresence = { commons: { count: 3, people: [] }, library: { count: 2, people: [] } };
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: mockFlag }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve(mockPresence), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 1257, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
}));
jest.mock('../campusPeopleApi', () => ({
  fetchStaffDesks: () => Promise.resolve([{ id: 'reese', name: 'Reese', title: 'Mentor', building: 'commons', ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] }]),
  fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }),
}));
jest.mock('../../../services/onboardingApi', () => ({
  ...jest.requireActual('../../../services/onboardingApi'),
  fetchOnboardingProfile: () => Promise.resolve({ profile: { full_name: 'Ali Muwwakkil' } }),
  fetchStreak: () => Promise.resolve({ count: 3, claimed_today: true, week: [], total_streak_points: 0, next_points: 0 }),
  fetchPortalFlags: () => Promise.resolve({}),
}));
jest.mock('../../../services/communityApi', () => ({ ...jest.requireActual('../../../services/communityApi'), fetchUnreadNotificationCount: () => Promise.resolve(0) }));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor(mockAudience, { isStaff: mockAudience === 'staff', hasFullAccess: mockAudience !== 'explorer', isExplorer: mockAudience === 'explorer' }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusHomePage from '../../../pages/portal/campus/CampusHomePage';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import { shouldLandOnCampus, useCampusLanding, CAMPUS_LANDED_KEY } from '../useCampusLanding';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(15000);

let container: HTMLDivElement;
let root: Root | null = null;
let where = '';
let campus: ReturnType<typeof useCampus>;
function Where(): null { where = useLocation().pathname + useLocation().search; return null; }
function Grab(): null { campus = useCampus(); return null; }
function Landing(): null { useCampusLanding(); return null; }
const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => container.querySelector(s);

async function mount(path: string, nav: 'campus' | 'classic' = 'campus'): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav, workplaceNames: false, motion: 'on' })); // 'on' = reduce motion: arrivals are instant
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root!.render(
      <MemoryRouter initialEntries={[path]}><ParticipantAuthProvider><CampusProvider>
        <Where /><Grab /><Landing />
        <Routes>
          <Route path="/portal/campus" element={<CampusHomePage />} />
          <Route path="/portal/today" element={<div data-testid="today" />} />
        </Routes>
      </CampusProvider></ParticipantAuthProvider></MemoryRouter>,
    );
  });
  await flush();
}

beforeEach(() => {
  mockAudience = 'member'; mockFlag = true;
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  window.sessionStorage.clear();
});
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); root = null; container.remove(); } window.localStorage.clear(); window.sessionStorage.clear(); });

describe('shouldLandOnCampus', () => {
  const base = { ready: true, active: true, pathname: '/portal/today', search: '', landed: false };
  it('lands only on a first visit to Today, with the campus ready and on, and no ?stay=1', () => {
    expect(shouldLandOnCampus(base)).toBe(true);
    expect(shouldLandOnCampus({ ...base, ready: false })).toBe(false);
    expect(shouldLandOnCampus({ ...base, active: false })).toBe(false);
    expect(shouldLandOnCampus({ ...base, landed: true })).toBe(false);
    expect(shouldLandOnCampus({ ...base, search: '?stay=1' })).toBe(false);
    expect(shouldLandOnCampus({ ...base, pathname: '/portal/library' })).toBe(false);
  });
});

describe('the landing rule in the app', () => {
  it('a first visit to Today goes to the campus home, once per tab', async () => {
    await mount('/portal/today');
    expect(where).toBe('/portal/campus');
    expect(window.sessionStorage.getItem(CAMPUS_LANDED_KEY)).toBe('1');
  });

  it('?stay=1 stays on Today (and counts as the tab entry)', async () => {
    await mount('/portal/today?stay=1');
    expect(where).toBe('/portal/today?stay=1');
    expect(q('[data-testid="today"]')).not.toBeNull();
    expect(window.sessionStorage.getItem(CAMPUS_LANDED_KEY)).toBe('1');
  });

  it('a later visit in the same tab stays on Today', async () => {
    window.sessionStorage.setItem(CAMPUS_LANDED_KEY, '1');
    await mount('/portal/today');
    expect(where).toBe('/portal/today');
  });

  it('the campus off (server flag) never redirects', async () => {
    mockFlag = false;
    await mount('/portal/today');
    expect(where).toBe('/portal/today');
  });

  it('the classic menu chosen never redirects', async () => {
    await mount('/portal/today', 'classic');
    expect(where).toBe('/portal/today');
  });
});

describe('the campus home', () => {
  it('a member sees the world, the top bar with level, points, classmates and streak, and the concierge greeting by name', async () => {
    await mount('/portal/campus');
    for (const id of ['cm-home', 'cm-world', 'cm-topbar', 'cm-concierge', 'cm-cc-where', 'cm-cc-greeting', 'cm-cc-pulse', 'cm-cc-helpdesk']) expect(q(`[data-testid="${id}"]`)).not.toBeNull();
    expect(q('[data-testid="cm-stats-level"]')!.textContent).toBe('Lv 1, AI Aware I'); // Q5: Lv N, the rung for screen readers
    expect(q('[data-testid="cm-stats-level"]')!.getAttribute('title')).toBe('AI Aware I');
    expect(q('[data-testid="cm-stats-points"]')!.textContent).toContain('1,257');
    expect(q('[data-testid="cm-stats-online"]')!.textContent).toContain('5');
    expect(q('[data-testid="cm-stats-streak"]')!.textContent).toContain('3');
    expect(q('[data-testid="cm-cc-greeting"]')!.textContent).toMatch(/, Ali\.$/);
    expect(q('[data-testid="cm-cc-pulse"]')!.textContent).toContain('5 classmates on campus');
    expect(q('[data-testid="cm-cc-pulse"]')!.textContent).toContain('busiest: Community Lounge (3)');
    expect(q('[data-testid="cm-cc-where"]')!.textContent).toBe('At the main gate');
    expect(q('[data-testid="cm-cc-pass"]')).toBeNull();
  });

  it('an Explorer sees the EXPLORER chip and the pass with its enroll link, and no streak or level', async () => {
    mockAudience = 'explorer';
    await mount('/portal/campus');
    expect(q('[data-testid="cm-stats-acct-explorer"]')).not.toBeNull();
    expect(q('[data-testid="cm-stats-streak"]')).toBeNull();
    expect(q('[data-testid="cm-stats-level"]')).toBeNull();
    expect(q('[data-testid="cm-cc-pass"]')).not.toBeNull();
    expect(q('[data-testid="cm-cc-enroll"]')!.getAttribute('href')).toBeTruthy();
    expect(q('[data-testid="cm-cc-pulse"]')!.textContent).toContain('people on campus');
    expect(container.textContent!.toLowerCase()).not.toMatch(/\bfree\b/);
    // the pass is a glance: at most five places a column, then a count (an Explorer here can use more than five buildings)
    const cols = Array.from(container.querySelectorAll('[data-testid="cm-cc-pass"] ul'));
    expect(cols.length).toBe(2);
    for (const ul of cols) expect(ul.querySelectorAll('li:not(.cm-pass-more)').length).toBeLessThanOrEqual(5);
    expect(container.querySelector('[data-testid="cm-cc-pass"] .cm-pass-more')).not.toBeNull();
  });

  it('staff get staff tools (no learner chips); a partner gets the partner tour card', async () => {
    mockAudience = 'staff';
    await mount('/portal/campus');
    expect(q('[data-testid="cm-cc-staff-tools"]')).not.toBeNull();
    expect(q('[data-testid="cm-cc-where"]')!.textContent).toBe('Staff view · every building');
    expect(q('[data-testid="cm-cc-chips"]')).toBeNull();
    { const r = root!; act(() => r.unmount()); root = null; container.remove(); }
    mockAudience = 'business';
    await mount('/portal/campus');
    expect(q('[data-testid="cm-cc-tour"]')!.textContent).toContain('Start the partner tour');
    expect(q('[data-testid="cm-cc-where"]')!.textContent).toBe('Partner visit');
    expect(q('[data-testid="cm-cc-staff-tools"]')).toBeNull();
  });

  it('business and staff see their account chip and no points', async () => {
    for (const a of ['business', 'staff'] as const) {
      mockAudience = a;
      await mount('/portal/campus');
      expect(q(`[data-testid="cm-stats-acct-${a}"]`)).not.toBeNull();
      expect(q('[data-testid="cm-stats-points"]')).toBeNull();
      { const r = root!; act(() => r.unmount()); root = null; container.remove(); }
    }
    await mount('/portal/campus'); // afterEach unmounts this one
  });

  it('"open the map" on the home walks here on this map (WP-1: the only map)', async () => {
    await mount('/portal/campus');
    act(() => { campus.openMap('library'); });
    await flush();
    expect(where).toBe('/portal/campus');
    expect(q('[data-testid="cm-home"]')).not.toBeNull();
    expect(q('[data-testid="cm-cc-where"]')!.textContent).toBe('At the Library');
  });

  it('arriving opens the arrival panel; the concierge stays visible and gets has-card; closing removes has-card', async () => {
    await mount('/portal/campus');
    act(() => { q('[data-testid="cm-bld-commons"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(q('[data-testid="cm-card"]')).not.toBeNull();
    const cc = () => q('[data-testid="cm-concierge"]') as HTMLElement;
    expect(cc().hidden).toBe(false);
    expect(cc().hasAttribute('hidden')).toBe(false);
    expect(cc().classList.contains('is-tucked')).toBe(false);
    expect(cc().classList.contains('has-card')).toBe(true);
    expect(q('[data-testid="cm-cc-where"]')!.textContent).toBe('At the Community Lounge');
    act(() => { (q('[data-testid="cm-arrive-back"]') as HTMLButtonElement).click(); });
    await flush();
    expect(q('[data-testid="cm-card"]')).toBeNull();
    expect(cc().hidden).toBe(false);
    expect(cc().classList.contains('has-card')).toBe(false);
  });

  it('a concierge chip walks to its building', async () => {
    await mount('/portal/campus');
    const chip = Array.from(container.querySelectorAll('[data-testid="cm-cc-chips"] button')).find((b) => b.textContent && b.textContent.length > 0) as HTMLButtonElement;
    act(() => { chip.click(); });
    await flush();
    expect(q('[data-testid="cm-cc-where"]')!.textContent).not.toBe('At the main gate');
  });

  it('with the campus off, the home sends you to Today (with ?stay=1)', async () => {
    mockFlag = false;
    await mount('/portal/campus');
    expect(where).toBe('/portal/today?stay=1');
  });
});
