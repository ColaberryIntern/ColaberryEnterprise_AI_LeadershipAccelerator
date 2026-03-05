import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useParticipantAuth } from '../contexts/ParticipantAuthContext';

function PortalProtectedRoute() {
  const { isAuthenticated } = useParticipantAuth();

  if (!isAuthenticated) {
    return <Navigate to="/portal/login" replace />;
  }

  return <Outlet />;
}

export default PortalProtectedRoute;
