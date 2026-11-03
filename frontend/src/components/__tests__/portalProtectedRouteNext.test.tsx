/**
 * PortalProtectedRoute must carry the destination through sign-in.
 *
 * Until 2026-11-03 this was a bare `<Navigate to="/portal/login" replace />`, so
 * arriving at any portal URL while signed out threw the destination away and
 * sign-in landed on Today. Invisible for someone opening the portal cold, and
 * badly wrong for anyone who followed a link TO something: the "sent you a
 * message" email put people on a dashboard with no clue which conversation it
 * meant, which is half of what Ali reported that day.
 *
 * `loginHrefPreserving` has its own unit tests. What is proved HERE is the wiring
 * — that the route hands it the path actually being visited — because that is the
 * part a passing helper test cannot tell you anything about.
 *
 * Mocking convention follows campusShellSwap.test.tsx: createRoot + act, no
 * testing-library in this repo.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

let mockAuthenticated = false;
jest.mock('../../contexts/ParticipantAuthContext', () => ({
  useParticipantAuth: () => ({ isAuthenticated: mockAuthenticated }),
}));
// Both are analytics/landing side effects that reach the network. Neither has
// anything to do with the redirect, and both would make this a network test.
jest.mock('../../hooks/usePortalTracking', () => ({ usePortalTracking: () => {} }));
jest.mock('../campus/useCampusLanding', () => ({ useCampusLanding: () => {} }));

import PortalProtectedRoute from '../PortalProtectedRoute';

// Same declaration campusShellSwap.test.tsx makes: without it React warns on every
// act() call that the environment is not configured for it, burying real output.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders wherever we ended up, so the assertion reads the real router state. */
function LoginProbe(): React.ReactElement {
  const loc = useLocation();
  return <div data-testid="login">{`${loc.pathname}${loc.search}`}</div>;
}

let container: HTMLDivElement;
let root: Root;

function mountAt(path: string): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PortalProtectedRoute />}>
            <Route path="/portal/messages/:roomId" element={<div data-testid="thread">the conversation</div>} />
            <Route path="/portal/today" element={<div data-testid="today">today</div>} />
          </Route>
          <Route path="/portal/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const landed = (): string => container.querySelector('[data-testid="login"]')?.textContent ?? '';

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mockAuthenticated = false;
});

describe('PortalProtectedRoute, signed out', () => {
  it('carries the conversation URL through to the login page as ?next=', () => {
    mountAt('/portal/messages/room-1');

    expect(container.querySelector('[data-testid="thread"]')).toBeNull();
    expect(landed()).toBe(`/portal/login?next=${encodeURIComponent('/portal/messages/room-1')}`);
  });

  it('carries any other portal destination too, not just messages', () => {
    mountAt('/portal/today');

    expect(landed()).toBe(`/portal/login?next=${encodeURIComponent('/portal/today')}`);
  });

  it('REGRESSION: the destination is not silently dropped', () => {
    // The exact shape of the old bug. A bare /portal/login here means sign-in
    // lands on Today and the reader never sees the message they clicked for.
    mountAt('/portal/messages/room-1');

    expect(landed()).not.toBe('/portal/login');
    expect(landed()).toContain('next=');
  });
});

describe('PortalProtectedRoute, signed in', () => {
  it('renders the page and redirects nowhere', () => {
    mockAuthenticated = true;
    mountAt('/portal/messages/room-1');

    expect(container.querySelector('[data-testid="thread"]')?.textContent).toBe('the conversation');
    expect(container.querySelector('[data-testid="login"]')).toBeNull();
  });
});
