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

// eslint-disable-next-line import/first
import PortalLayout from '../../Layout/PortalLayout';
// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
async function mount(campus: boolean, path = '/portal/sessions'): Promise<void> {
  mockCampusOn = campus;
  window.localStorage.clear();
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ParticipantAuthProvider><CampusProvider>
          <Routes><Route element={<PortalLayout />}><Route path="/portal/sessions" element={<div>Sessions page</div>} /></Route></Routes>
        </CampusProvider></ParticipantAuthProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); });

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

  it('"Step outside" opens the campus map overlay on this layout too', async () => {
    await mount(true);
    expect(container.querySelector('[data-testid="cm-overlay"]')).toBeNull();
    await act(async () => { (container.querySelector('[data-testid="cm-step-out"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-testid="cm-scope"] [data-testid="cm-overlay"]')).not.toBeNull();
  });
});
