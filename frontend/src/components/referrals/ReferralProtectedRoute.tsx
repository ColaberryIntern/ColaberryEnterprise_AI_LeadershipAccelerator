import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAlumniAuth } from '../../contexts/AlumniAuthContext';

function ReferralProtectedRoute() {
  const { isAuthenticated } = useAlumniAuth();

  if (!isAuthenticated) {
    return <Navigate to="/referrals/login" replace />;
  }

  return <Outlet />;
}

export default ReferralProtectedRoute;
