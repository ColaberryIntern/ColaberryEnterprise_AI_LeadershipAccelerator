import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import CampusHomePage from '../../../../pages/portal/campus/CampusHomePage';
import { GATE_SEEN_KEY } from '../../home/CampusGate';
import { PARTICIPANT_TOKEN_KEY } from '../../../../utils/participantToken';

/**
 * Test harness (WP-1, one map). A page's "open the map" now goes to /portal/campus, so suites that open the map from a page render
 * the real campus home at that route and their page everywhere else. Not a test (CI ignores testEnv/).
 *
 *   <MemoryRouter initialEntries={['/portal/library']}><ParticipantAuthProvider><CampusProvider>
 *     <Where /><WithCampusHome><Page /></WithCampusHome>
 *   </CampusProvider></ParticipantAuthProvider></MemoryRouter>
 *
 * The campus must be active for the redirect (signIn() before mounting; the suite's campusApi mock returns campus: true). The home
 * reads a few services of its own; mock them with ./homeServiceMocks (see campusLayers.test.tsx for the two jest.mock lines).
 */
export function WithCampusHome({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <Routes>
      <Route path="/portal/campus" element={<CampusHomePage />} />
      <Route path="*" element={<>{children}</>} />
    </Routes>
  );
}

/** The gate is a once-a-day welcome; suites about the map skip it. Call before mounting. */
export function skipGate(): void {
  window.localStorage.setItem(GATE_SEEN_KEY, 'always');
}

/** A fake, unsigned participant token, so the campus provider asks for (mocked) flags. Call before mounting. */
export function signIn(): void {
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
}

/** Records the current path for assertions (render it inside the router). */
export const where = { path: '' };
export function Where(): null {
  const l = useLocation();
  where.path = l.pathname + l.search;
  return null;
}
