import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useParticipantAuth } from '../contexts/ParticipantAuthContext';
import { usePortalTracking } from '../hooks/usePortalTracking';
import { useCampusLanding } from './campus/useCampusLanding';
import { loginHrefPreserving } from '../utils/portalLoginHref';

function PortalProtectedRoute() {
  const { isAuthenticated } = useParticipantAuth();
  const location = useLocation();

  // Every authenticated portal page passes through here — both the Design E surfaces
  // (TodayShell and friends, which render their own chrome) and the legacy pages still
  // inside PortalLayout. Hanging this off PortalLayout instead would have instrumented
  // only the legacy half and looked finished.
  //
  // The hook is a no-op unless the SERVER says this person may be tracked; it never
  // decides that itself. It is called unconditionally rather than behind the
  // `isAuthenticated` branch below because hooks cannot be called conditionally, and it
  // exits on its own when there is no participant token.
  usePortalTracking();
  // C11b: a tab's first visit to Today goes to the campus home when the campus is on (no-op otherwise; see the hook).
  useCampusLanding();

  if (!isAuthenticated) {
    // CARRY THE DESTINATION. This used to be a bare `/portal/login`, so arriving
    // at any portal URL while signed out lost where you were going and sign-in
    // landed you on Today. That is invisible for someone opening the portal cold
    // and badly wrong for anyone who followed a link TO something: a message
    // notification's "Read and reply" put people on a dashboard with no clue
    // which conversation it meant (Ali, 2026-11-03).
    //
    // `loginHrefPreserving` is the same helper portalApi's 401 interceptor uses,
    // and it already refuses to point `next` back at /portal/login (a redirect
    // loop) or at /portal/verify (whose token is spent). Reused rather than
    // rebuilt so there is one answer to this question in the codebase.
    return <Navigate to={loginHrefPreserving(location.pathname)} replace />;
  }

  return <Outlet />;
}

export default PortalProtectedRoute;
