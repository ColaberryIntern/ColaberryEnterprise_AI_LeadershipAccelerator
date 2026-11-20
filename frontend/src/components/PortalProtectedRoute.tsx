import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useParticipantAuth } from '../contexts/ParticipantAuthContext';
import { usePortalTracking } from '../hooks/usePortalTracking';
import { useCampusLanding } from './campus/useCampusLanding';
import PortalPhoneGate from './PortalPhoneGate';

function PortalProtectedRoute() {
  const { isAuthenticated, token } = useParticipantAuth();

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
    return <Navigate to="/portal/login" replace />;
  }

  // PH1: a signed-in learner with no phone on file adds one before any portal page renders.
  // Staff and an admin's read-only "View as" session are never asked (see PortalPhoneGate).
  // Keyed on the token so a different account signing in on this tab is checked afresh.
  return (
    <PortalPhoneGate key={token ?? 'none'}>
      <Outlet />
    </PortalPhoneGate>
  );
}

export default PortalProtectedRoute;
