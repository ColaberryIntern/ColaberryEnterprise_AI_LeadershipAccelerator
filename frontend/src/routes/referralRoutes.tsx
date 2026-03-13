import React from 'react';
import { Route, Outlet } from 'react-router-dom';
import { AlumniAuthProvider } from '../contexts/AlumniAuthContext';
import ReferralProtectedRoute from '../components/referrals/ReferralProtectedRoute';
import ReferralLoginPage from '../pages/referrals/ReferralLoginPage';
import ReferralDashboardPage from '../pages/referrals/ReferralDashboardPage';

const referralRoutes = (
  <Route element={<AlumniAuthProvider><Outlet /></AlumniAuthProvider>}>
    <Route path="/referrals/login" element={<ReferralLoginPage />} />
    <Route element={<ReferralProtectedRoute />}>
      <Route path="/referrals/dashboard" element={<ReferralDashboardPage />} />
    </Route>
  </Route>
);

export default referralRoutes;
