/**
 * Colaberry Campus C1 acceptance: with the campus OFF, the portal does not change.
 *
 * Two assertions, and the second is the one that matters:
 *  1. PortalShell's markup is pinned as a snapshot. C1 does not touch PortalShell; this is
 *     the baseline C2 (the first ticket that edits the shell) must keep identical when the
 *     flag is off.
 *  2. PortalShell wrapped in <CampusProvider> with the server answering {campus:false}
 *     renders BYTE-IDENTICAL HTML to PortalShell alone. The provider is what C3 mounts
 *     beside <Outlet/> for every learner, so this is the property that keeps the rollout
 *     invisible until Ali allowlists someone.
 * A sensitivity control proves the comparison can fail: one extra wrapper element breaks it.
 *
 * Harness: createRoot + act (no @testing-library in this repo). Every data API the shell calls
 * is mocked to fail, so the shell renders its own empty states and nothing clock-derived -
 * the snapshot is the same in any time zone. Implementations live in the mock factories as
 * plain functions because react-scripts sets resetMocks: true.
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
jest.mock('../../../services/communityApi', () => ({
  ...jest.requireActual('../../../services/communityApi'),
  pingPresence: () => Promise.resolve(),
}));
jest.mock('../../../services/dmApi', () => ({ ...jest.requireActual('../../../services/dmApi'), openDm: () => Promise.reject(new Error('offline in test')) }));
jest.mock('../../../pages/portal/today/useNextLiveSession', () => ({ useNextLiveSession: () => ({ session: null, loading: false }) }));
jest.mock('../../../pages/portal/useEntitlement', () => ({ useEntitlement: () => ({ isStaff: false, hasFullAccess: true, loading: false }) }));
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
// The campus flag request: the production default answer. A plain counter (not jest.fn) so
// react-scripts' resetMocks cannot wipe it; the byte-identical test asserts the fetch ran.
jest.mock('../campusApi', () => {
  let calls = 0;
  return {
    fetchCampusFlags: () => { calls += 1; return Promise.resolve({ campus: false }); },
    __flagCalls: () => calls,
    CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  };
});

// eslint-disable-next-line import/first
import PortalShell from '../../../pages/portal/today/PortalShell';
// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import * as campusApi from '../campusApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flagCalls = (): number => (campusApi as unknown as { __flagCalls: () => number }).__flagCalls();

async function renderHtml(wrap: (shell: React.ReactElement) => React.ReactElement, token?: string): Promise<string> {
  window.localStorage.clear();
  if (token) window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, token);
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  const shell = (
    <MemoryRouter initialEntries={['/portal/today']}>
      <PortalShell><div data-testid="page">Page body</div></PortalShell>
    </MemoryRouter>
  );
  await act(async () => { root = createRoot(container); root.render(wrap(shell)); });
  // Let every mocked request settle (rejections included) and the effects that follow them run.
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  const html = container.innerHTML;
  act(() => { root?.unmount(); });
  container.remove();
  return html;
}

describe('Campus C1: flag off changes nothing', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-16T15:00:00Z')); });
  afterEach(() => { jest.useRealTimers(); });

  it('pins PortalShell markup (the baseline C2 must preserve with the flag off)', async () => {
    const html = await renderHtml((s) => s);
    expect(html).toContain('Page body');
    expect(html).toMatchSnapshot();
  });

  it('renders byte-identical HTML with CampusProvider mounted and the campus off', async () => {
    // Signed in, so the provider really asks the server and gets {campus:false} - the production
    // state - rather than taking the signed-out short cut (Campus C2 gate).
    // Fake, unsigned test token: its only payload is {"email":"learner@example.com"}. Not a credential.
    const TOKEN = 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'; // gitleaks:allow
    const alone = await renderHtml((s) => <ParticipantAuthProvider>{s}</ParticipantAuthProvider>, TOKEN);
    const before = flagCalls();
    const withProvider = await renderHtml((s) => <ParticipantAuthProvider><CampusProvider>{s}</CampusProvider></ParticipantAuthProvider>, TOKEN);
    expect(flagCalls()).toBe(before + 1);
    expect(withProvider.length).toBeGreaterThan(1000);
    expect(withProvider).toBe(alone);
  });

  it('signed out, the provider makes no flags request and still changes nothing', async () => {
    const alone = await renderHtml((s) => <ParticipantAuthProvider>{s}</ParticipantAuthProvider>);
    const before = flagCalls();
    const withProvider = await renderHtml((s) => <ParticipantAuthProvider><CampusProvider>{s}</CampusProvider></ParticipantAuthProvider>);
    expect(flagCalls()).toBe(before);
    expect(withProvider).toBe(alone);
  });

  it('sensitivity control: one extra wrapper element is detected', async () => {
    const alone = await renderHtml((s) => s);
    const wrapped = await renderHtml((s) => <div>{s}</div>);
    expect(wrapped).not.toBe(alone);
  });
});
