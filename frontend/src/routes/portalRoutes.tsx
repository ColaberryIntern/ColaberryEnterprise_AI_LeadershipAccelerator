import React from 'react';
import { Route, Outlet } from 'react-router-dom';
import { ParticipantAuthProvider } from '../contexts/ParticipantAuthContext';
import PortalProtectedRoute from '../components/PortalProtectedRoute';
import PortalLayout from '../components/Layout/PortalLayout';
import PortalLoginPage from '../pages/portal/PortalLoginPage';
import PortalVerifyPage from '../pages/portal/PortalVerifyPage';
import PortalDashboardPage from '../pages/portal/PortalDashboardPage';
import PortalCurriculumPage from '../pages/portal/PortalCurriculumPage';
import PortalLessonPage from '../pages/portal/PortalLessonPage';
import PortalSessionsPage from '../pages/portal/PortalSessionsPage';
import PortalSessionDetailPage from '../pages/portal/PortalSessionDetailPage';
import PortalAssignmentsPage from '../pages/portal/PortalAssignmentsPage';
import PortalProgressPage from '../pages/portal/PortalProgressPage';

const portalRoutes = (
  <Route element={<ParticipantAuthProvider><Outlet /></ParticipantAuthProvider>}>
    <Route path="/portal/login" element={<PortalLoginPage />} />
    <Route path="/portal/verify" element={<PortalVerifyPage />} />
    <Route element={<PortalProtectedRoute />}>
      <Route element={<PortalLayout />}>
        <Route path="/portal/dashboard" element={<PortalDashboardPage />} />
        <Route path="/portal/curriculum" element={<PortalCurriculumPage />} />
        <Route path="/portal/curriculum/lessons/:lessonId" element={<PortalLessonPage />} />
        <Route path="/portal/sessions" element={<PortalSessionsPage />} />
        <Route path="/portal/sessions/:id" element={<PortalSessionDetailPage />} />
        <Route path="/portal/assignments" element={<PortalAssignmentsPage />} />
        <Route path="/portal/progress" element={<PortalProgressPage />} />
      </Route>
    </Route>
  </Route>
);

export default portalRoutes;
