import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useParticipantAuth } from '../contexts/ParticipantAuthContext';
import { usePortalTracking } from '../hooks/usePortalTracking';

function PortalProtectedRoute() {
  const { isAuthenticated } = useParticipantAuth();

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

  if (!isAuthenticated) {
    return <Navigate to="/portal/login" replace />;
  }

  return <Outlet />;
}

export default PortalProtectedRoute;
