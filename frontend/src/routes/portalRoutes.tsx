import React from 'react';
import { Route, Outlet, Navigate } from 'react-router-dom';
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
import ProjectDashboard from '../pages/project/ProjectDashboard';
import SystemBlueprint from '../pages/project/SystemBlueprint';
import SystemViewV2 from '../pages/project/SystemViewV2';
import ProjectArtifacts from '../pages/project/ProjectArtifacts';
import ProjectPortfolio from '../pages/project/ProjectPortfolio';
import ExecutiveDeliverable from '../pages/project/ExecutiveDeliverable';
import CoryFullscreen from '../pages/project/CoryFullscreen';
import RequirementsBuilder from '../pages/project/RequirementsBuilder';

const portalRoutes = (
  <Route element={<ParticipantAuthProvider><Outlet /></ParticipantAuthProvider>}>
    <Route path="/portal/login" element={<PortalLoginPage />} />
    <Route path="/portal/verify" element={<PortalVerifyPage />} />
    <Route element={<PortalProtectedRoute />}>
      <Route element={<PortalLayout />}>
        <Route path="/portal/dashboard" element={<Navigate to="/portal/project" replace />} />
        <Route path="/portal/curriculum" element={<PortalCurriculumPage />} />
        <Route path="/portal/curriculum/lessons/:lessonId" element={<PortalLessonPage />} />
        <Route path="/portal/sessions" element={<PortalSessionsPage />} />
        <Route path="/portal/sessions/:id" element={<PortalSessionDetailPage />} />
        <Route path="/portal/assignments" element={<PortalAssignmentsPage />} />
        <Route path="/portal/progress" element={<PortalProgressPage />} />
        <Route path="/portal/project" element={<Navigate to="/portal/project/blueprint" replace />} />
        <Route path="/portal/project/blueprint" element={<SystemBlueprint />} />
        <Route path="/portal/project/system" element={<ProjectDashboard />} />
        <Route path="/portal/project/system-v2" element={<SystemViewV2 />} />
        <Route path="/portal/project/artifacts" element={<ProjectArtifacts />} />
        <Route path="/portal/project/portfolio" element={<ProjectPortfolio />} />
        <Route path="/portal/project/executive" element={<ExecutiveDeliverable />} />
        <Route path="/portal/project/cory" element={<CoryFullscreen />} />
        <Route path="/portal/project/requirements-builder" element={<RequirementsBuilder />} />
      </Route>
    </Route>
  </Route>
);

export default portalRoutes;
