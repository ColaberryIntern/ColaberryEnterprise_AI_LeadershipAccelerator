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
import SystemBuildDemo from '../pages/project/SystemBuildDemo';
import VisualWorkspacePage from '../features/visualWorkspace/VisualWorkspacePage';
import WalkCapsPage from '../pages/portal/WalkCapsPage';
import WalkSummaryPage from '../pages/portal/WalkSummaryPage';
import PhantomCapsTriage from '../pages/project/PhantomCapsTriage';
import CoryHome from '../pages/portal/CoryHome';
import ArchitectDashboard from '../pages/portal/ArchitectDashboard';
import ProjectDnaWizard from '../pages/portal/ProjectDnaWizard';
import ProjectBuilderFlow from '../pages/portal/ProjectBuilderFlow';
import ExecutionLane from '../pages/project/ExecutionLane';
import SystemView from '../pages/project/SystemView';

const portalRoutes = (
  <Route element={<ParticipantAuthProvider><Outlet /></ParticipantAuthProvider>}>
    <Route path="/portal/login" element={<PortalLoginPage />} />
    <Route path="/portal/verify" element={<PortalVerifyPage />} />
    <Route element={<PortalProtectedRoute />}>
      <Route element={<PortalLayout />}>
        <Route path="/portal/home" element={<CoryHome />} />
        <Route path="/portal/architect-dashboard" element={<ArchitectDashboard />} />
        <Route path="/portal/project-builder" element={<ProjectDnaWizard />} />
        <Route path="/portal/project/builder" element={<ProjectBuilderFlow />} />
        {/* Legacy redirect — old `/portal/dashboard` now lands on Cory Home. */}
        <Route path="/portal/dashboard" element={<Navigate to="/portal/home" replace />} />
        <Route path="/portal/curriculum" element={<PortalCurriculumPage />} />
        <Route path="/portal/curriculum/lessons/:lessonId" element={<PortalLessonPage />} />
        <Route path="/portal/sessions" element={<PortalSessionsPage />} />
        <Route path="/portal/sessions/:id" element={<PortalSessionDetailPage />} />
        <Route path="/portal/assignments" element={<PortalAssignmentsPage />} />
        <Route path="/portal/progress" element={<PortalProgressPage />} />
        <Route path="/portal/project" element={<Navigate to="/portal/project/blueprint" replace />} />
        {/* Blueprint Simplification Sprint: /blueprint now serves the lean
            ExecutionLane (6-step flow). The legacy SystemBlueprint surface
            is preserved at /blueprint-legacy for rollback only. */}
        <Route path="/portal/project/blueprint" element={<ExecutionLane />} />
        <Route path="/portal/project/blueprint-legacy" element={<SystemBlueprint />} />
        {/* System Surface Maturity Sprint, 2026-05-12 — "v2" leakage purged.
            The lean 5-tab SystemView now serves the canonical `/system`
            URL. The old project dashboard is archived. The two `-v2`
            routes redirect to their non-v2 equivalents so any external
            link (Basecamp, email, etc.) still lands the operator on the
            right surface without exposing the legacy naming. */}
        <Route path="/portal/project/system" element={<SystemView />} />
        <Route path="/portal/project/system-legacy" element={<SystemViewV2 />} />
        <Route path="/portal/project/system-v2" element={<Navigate to="/portal/project/system" replace />} />
        <Route path="/portal/project/system-v2-legacy" element={<Navigate to="/portal/project/system-legacy" replace />} />
        <Route path="/portal/project/legacy-dashboard" element={<ProjectDashboard />} />
        <Route path="/portal/project/artifacts" element={<ProjectArtifacts />} />
        <Route path="/portal/project/portfolio" element={<ProjectPortfolio />} />
        <Route path="/portal/project/executive" element={<ExecutiveDeliverable />} />
        <Route path="/portal/project/cory" element={<CoryFullscreen />} />
        <Route path="/portal/project/requirements-builder" element={<RequirementsBuilder />} />
        <Route path="/portal/project/demo" element={<SystemBuildDemo />} />
        <Route path="/portal/visual-workspace" element={<VisualWorkspacePage />} />
        {/* Phase B (2026-05-20): walk through caps one at a time. */}
        <Route path="/portal/walk-caps" element={<WalkCapsPage />} />
        {/* Phase C (2026-05-20): walk summary + compile-prompt. */}
        <Route path="/portal/walk-caps/summary" element={<WalkSummaryPage />} />
        {/* 2026-05-21: phantom-cap triage. */}
        <Route path="/portal/project/phantoms" element={<PhantomCapsTriage />} />
      </Route>
    </Route>
  </Route>
);

export default portalRoutes;
