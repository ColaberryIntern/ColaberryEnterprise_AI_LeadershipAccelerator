/**
 * C3 persistence (D2b): walking between rooms, including across the two page chromes, keeps ONE
 * campus. The tree mirrors routes/portalRoutes.tsx (campusProviderMount.test proves the real layout
 * has this shape): a layout element with CampusProvider around <Outlet/>, a PortalShell-style child
 * that renders the banner itself, and the real PortalLayout block. Navigating across 3 routes must
 * not remount the provider (flags read once) nor start a second presence poll (one 30 s interval).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';

// A plain counter, not jest.fn: this suite runs with resetMocks:true, which would wipe the implementation.
let mockFlagReads = 0;
// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => { mockFlagReads += 1; return Promise.resolve({ campus: true }); }, CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
jest.mock('../../../contexts/MentorContext', () => ({ MentorContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusBanner from '../CampusBanner';
// eslint-disable-next-line import/first
import PortalLayout from '../../Layout/PortalLayout';
// eslint-disable-next-line import/first
import { PRESENCE_POLL_MS } from '../useCampusPresencePoll';
// eslint-disable-next-line import/first
import { DM_TOAST_POLL_MS } from '../useCampusDmToasts';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let go: (to: string) => void = () => undefined;
function Nav(): null { const n = useNavigate(); go = n; return null; }
/** Stands in for a PortalShell page: renders the banner at the top of its main, as PortalShell does. */
function ShellPage({ name }: { name: string }): React.ReactElement {
  const { active } = useCampus();
  return <main>{active && <CampusBanner />}<p>{name}</p></main>;
}
function Layout(): React.ReactElement { return <CampusProvider><Nav /><Outlet /></CampusProvider>; }

let container: HTMLDivElement;
let root: Root;
let intervalSpy: jest.SpyInstance;
const pollIntervals = () => intervalSpy.mock.calls.filter((c) => c[1] === PRESENCE_POLL_MS).length;
// C5: the new-message poll lives in the provider too, so walking between rooms must not start a second one.
const toastIntervals = () => intervalSpy.mock.calls.filter((c) => c[1] === DM_TOAST_POLL_MS).length;
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

beforeEach(async () => {
  mockFlagReads = 0;
  intervalSpy = jest.spyOn(window, 'setInterval');
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/portal/today']}>
        <ParticipantAuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/portal/today" element={<ShellPage name="Today page" />} />
              <Route path="/portal/library" element={<ShellPage name="Library page" />} />
              <Route element={<PortalLayout />}><Route path="/portal/sessions" element={<p>Sessions page</p>} /></Route>
            </Route>
          </Routes>
        </ParticipantAuthProvider>
      </MemoryRouter>,
    );
  });
  await flush();
});
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); intervalSpy.mockRestore(); });

const trailEnd = () => Array.from(container.querySelectorAll('[data-testid="cm-trail"] li')).map((li) => li.textContent).pop();

describe('one campus across rooms and chromes', () => {
  it('reads the flag once and runs one presence poll while walking Today -> Sessions (PortalLayout) -> Library', async () => {
    expect(trailEnd()).toBe('Today');
    expect(mockFlagReads).toBe(1);
    expect(pollIntervals()).toBe(1);

    await act(async () => { go('/portal/sessions'); }); await flush();
    expect(container.textContent).toContain('Sessions page');
    expect(trailEnd()).toBe('Live sessions');

    await act(async () => { go('/portal/library'); }); await flush();
    expect(container.textContent).toContain('Library page');
    expect(trailEnd()).toBe('Library');

    expect(mockFlagReads).toBe(1);
    expect(pollIntervals()).toBe(1);
    expect(toastIntervals()).toBe(1);
  });

  it('exactly one banner on a PortalShell page and on a PortalLayout page, never doubled', async () => {
    const before = container.querySelectorAll('[data-testid="cm-banner"]').length;
    expect(before).toBe(1);
    await act(async () => { go('/portal/sessions'); }); await flush();
    expect(container.querySelectorAll('[data-testid="cm-banner"]').length).toBe(1); // exactly one banner per page, never doubled
  });
});
