/**
 * Campus C2: PortalShell shows the campus in place of the classic rail and tab bar when the
 * campus is ACTIVE (server flag on for this learner AND they have not chosen the classic menu),
 * and the classic menu in every other case. "Use classic menu" switches back and is remembered.
 * Data APIs are mocked to fail, as in campusNoChange.test.tsx.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../../../services/onboardingApi', () => ({
  ...jest.requireActual('../../../services/onboardingApi'),
  fetchPoints: () => Promise.reject(new Error('offline in test')),
  fetchSchedule: () => Promise.reject(new Error('offline in test')),
}));
jest.mock('../../../services/portalSettingsApi', () => ({
  ...jest.requireActual('../../../services/portalSettingsApi'),
  fetchSettings: () => Promise.reject(new Error('offline in test')),
  readCachedAvatar: () => null,
}));
jest.mock('../../../services/cohortPresenceApi', () => ({
  ...jest.requireActual('../../../services/cohortPresenceApi'),
  fetchCohortPresence: () => Promise.reject(new Error('offline in test')),
  sendFriendRequest: () => Promise.reject(new Error('offline in test')),
  respondToFriendRequest: () => Promise.reject(new Error('offline in test')),
}));
jest.mock('../../../services/peoplePanelApi', () => ({
  ...jest.requireActual('../../../services/peoplePanelApi'),
  fetchPeoplePanel: () => Promise.reject(new Error('offline in test')),
}));
jest.mock('../../../services/communityApi', () => ({ ...jest.requireActual('../../../services/communityApi'), pingPresence: () => Promise.resolve() }));
jest.mock('../../../services/dmApi', () => ({ ...jest.requireActual('../../../services/dmApi'), openDm: () => Promise.reject(new Error('offline in test')) }));
jest.mock('../../../pages/portal/today/useNextLiveSession', () => ({ useNextLiveSession: () => ({ session: null, loading: false }) }));
jest.mock('../../../pages/portal/useEntitlement', () => ({ useEntitlement: () => ({ isStaff: false, hasFullAccess: true, loading: false }) }));
jest.mock('../../../pages/portal/useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../../../pages/portal/useIsOrgManager', () => ({
  ...jest.requireActual('../../../pages/portal/useIsOrgManager'),
  useOrgManager: () => ({ isManager: false, org: null, loading: false }),
}));
jest.mock('../../../pages/portal/useMgmtStatus', () => ({ useMgmtStatus: () => ({ is_mgmt: false, role: null, label: null }) }));
jest.mock('../../../pages/portal/useInternshipNav', () => ({ useInternshipNav: () => ({ isIntern: false }) }));
jest.mock('../../../hooks/useScrollCondense', () => ({ useScrollCondense: () => false }));
jest.mock('../../../pages/portal/community/NotificationBell', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../pages/portal/projects/BuildToast', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../pages/portal/today/PeoplePanelRail', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../pages/portal/today/ChatDock', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../pages/portal/today/MessagesButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../ConfettiCelebration', () => ({ __esModule: true, default: () => null }));
let mockCampusOn = true;
jest.mock('../campusApi', () => ({ fetchCampusFlags: () => Promise.resolve({ campus: mockCampusOn }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  // C4 presence: a quiet campus (no one in any building).
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false }));

// eslint-disable-next-line import/first
import PortalShell from '../../../pages/portal/today/PortalShell';
// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
async function mount(opts: { campus: boolean; nav?: 'campus' | 'classic' }): Promise<void> {
  mockCampusOn = opts.campus;
  window.localStorage.clear();
  // Fake, unsigned test token: its only payload is {"email":"learner@example.com"}. Not a credential.
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow
  if (opts.nav) window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: opts.nav, workplaceNames: false, reduceMotion: true }));
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/portal/library']}>
        <ParticipantAuthProvider><CampusProvider><PortalShell><div>Page body</div></PortalShell></CampusProvider></ParticipantAuthProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); });

const has = (sel: string) => !!container.querySelector(sel);

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('PortalShell nav swap', () => {
  it('campus active: the campus nav and tab bar replace the classic ones', async () => {
    await mount({ campus: true });
    expect(has('nav.cm-nav')).toBe(true);
    expect(has('nav.cm-tabbar')).toBe(true);
    expect(has('nav.te-nav')).toBe(false);
    expect(has('nav.te-tabbar')).toBe(false);
    expect(container.textContent).toContain('Page body');
    // You are in the Library: its building is marked as the current page.
    expect(container.querySelector('.cm-nav-item.active')!.getAttribute('href')).toBe('/portal/library');
    // C10 shipped the Game Room: the side nav links to it.
    expect(container.querySelector('nav.cm-nav a[href="/portal/game-room"]')).not.toBeNull();
    expect(container.querySelector('nav.cm-nav')!.textContent).toContain('Game Room');
  });

  it('campus active: the campus banner (C3) sits at the top of <main>, above the page', async () => {
    await mount({ campus: true });
    const main = container.querySelector('main.te-main')!;
    expect(main.firstElementChild?.getAttribute('data-testid')).toBe('cm-banner');
    expect(main.textContent).toContain('Page body');
  });

  it('campus on but the learner chose the classic menu: classic nav', async () => {
    await mount({ campus: true, nav: 'classic' });
    expect(has('nav.te-nav')).toBe(true);
    expect(has('nav.cm-nav')).toBe(false);
    expect(has('[data-testid="cm-banner"]')).toBe(false);
  });

  it('campus off: classic nav and tab bar', async () => {
    await mount({ campus: false });
    expect(has('nav.te-nav')).toBe(true);
    expect(has('nav.te-tabbar')).toBe(true);
    expect(has('nav.cm-nav')).toBe(false);
    expect(has('[data-testid="cm-banner"]')).toBe(false);
  });

  it('"Use classic menu" switches back at once and is remembered', async () => {
    await mount({ campus: true });
    act(() => { container.querySelector('[data-testid="cm-use-classic"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(has('nav.te-nav')).toBe(true);
    expect(has('nav.cm-nav')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(CAMPUS_SETTINGS_KEY)!).nav).toBe('classic');
  });

  it('the classic menu offers "Switch to campus map" when the campus is available, and it works', async () => {
    await mount({ campus: true, nav: 'classic' });
    const back = container.querySelector('nav.te-nav [data-testid="cm-use-campus"]');
    expect(back).not.toBeNull();
    act(() => { back!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(has('nav.cm-nav')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(CAMPUS_SETTINGS_KEY)!).nav).toBe('campus');
  });

  it('with the campus off there is no switch link (the classic menu is unchanged)', async () => {
    await mount({ campus: false });
    expect(has('[data-testid="cm-use-campus"]')).toBe(false);
  });

  it('the phone tab bar Map button opens the full campus map', async () => {
    await mount({ campus: true });
    act(() => { container.querySelector('nav.cm-tabbar button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(has('[data-testid="cm-overlay"]')).toBe(true);
  });
});
