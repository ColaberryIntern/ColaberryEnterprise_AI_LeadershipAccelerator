/**
 * C3: the lean legacy PortalLayout (sessions, assignments, progress, week and lesson pages) gets the
 * campus banner and layers when the campus is active, and is unchanged when it is not. The snapshot
 * in this file was recorded BEFORE PortalLayout was edited, so "campus off = unchanged" is proven
 * against the true before state.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let mockCampusOn = false;
// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: mockCampusOn }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
jest.mock('../../../contexts/MentorContext', () => ({ MentorContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});
// WP-1: Step outside goes to the campus home (/portal/campus), rendered here too; its own services are mocked (no network).
jest.mock('../../../services/onboardingApi', () => require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi')));
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));

// eslint-disable-next-line import/first
import PortalLayout from '../../Layout/PortalLayout';
// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, where, Where } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
async function mount(campus: boolean, path = '/portal/sessions'): Promise<void> {
  mockCampusOn = campus;
  window.localStorage.clear();
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  // Reduce motion on, so the door transition of Step outside is immediate; the gate is skipped (the map is under test).
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  skipGate();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ParticipantAuthProvider><CampusProvider><Where />
          <WithCampusHome>
            <Routes><Route element={<PortalLayout />}><Route path="/portal/sessions" element={<div>Sessions page</div>} /></Route></Routes>
          </WithCampusHome>
        </CampusProvider></ParticipantAuthProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
afterEach(() => { act(() => root.unmount()); container.remove(); });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('PortalLayout with the campus off', () => {
  it('renders exactly as before C3 (snapshot recorded before the change)', async () => {
    await mount(false);
    expect(container.innerHTML).toContain('Sessions page');
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('PortalLayout with the campus on', () => {
  it('shows the banner inside .cm-scope, above the page, with the sessions trail', async () => {
    await mount(true);
    const scope = container.querySelector('main [data-testid="cm-scope"]');
    expect(scope).not.toBeNull();
    expect(scope!.querySelector('[data-testid="cm-banner"]')).not.toBeNull();
    const trail = Array.from(container.querySelectorAll('[data-testid="cm-trail"] li')).map((li) => li.textContent);
    expect(trail[0]).toBe('Campus');
    expect(trail[trail.length - 1]).toBe('Live sessions'); // the catalog's room label for /portal/sessions
    expect(container.innerHTML.indexOf('cm-banner')).toBeLessThan(container.innerHTML.indexOf('Sessions page'));
  });

  it('WP-1: lays the page out between the campus side nav and the rail (always a panel with your next steps)', async () => {
    await mount(true);
    const grid = container.querySelector('[data-testid="cm-scope"] .cm-scoped-grid')!;
    expect(grid).not.toBeNull();
    const side = grid.querySelector('[data-testid="cm-scoped-side"]')!;
    expect(side.querySelector('nav.cm-nav')).not.toBeNull();
    expect(grid.querySelector('[data-testid="cm-page-rail"]')).not.toBeNull();
    const html = grid.innerHTML;
    expect(html.indexOf('cm-scoped-side')).toBeLessThan(html.indexOf('Sessions page'));
    expect(html.indexOf('Sessions page')).toBeLessThan(html.indexOf('cm-page-rail'));
  });

  it('"Step outside" goes to the campus home (WP-1), standing at this building with its card open', async () => {
    await mount(true);
    expect(where.path).toBe('/portal/sessions');
    await act(async () => { (container.querySelector('[data-testid="cm-step-out"]') as HTMLButtonElement).click(); });
    await settle();
    expect(where.path).toBe('/portal/campus');
    expect(container.querySelector('[data-testid="cm-home"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cm-overlay"]')).toBeNull();
    // Live sessions is a room of the Classroom (lecture): you stand at its door with its card open, no walk.
    const card = container.querySelector('[data-testid="cm-card"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Classroom');
  });
});
