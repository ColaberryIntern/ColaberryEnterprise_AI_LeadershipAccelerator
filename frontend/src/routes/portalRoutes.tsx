import React from 'react';
import { Route, Outlet, Navigate } from 'react-router-dom';
import { ParticipantAuthProvider } from '../contexts/ParticipantAuthContext';
import PortalProtectedRoute from '../components/PortalProtectedRoute';
import PortalLayout from '../components/Layout/PortalLayout';
import PortalLoginPage from '../pages/portal/PortalLoginPage';
import PortalFreeSignupPage from '../pages/portal/PortalFreeSignupPage';
import PortalVerifyPage from '../pages/portal/PortalVerifyPage';
import PortalHandoffPage from '../pages/portal/PortalHandoffPage';
import PortalCurriculumPage from '../pages/portal/PortalCurriculumPage';
import ClassroomPage from '../pages/portal/ClassroomPage';
import RuntimeWorkspace from '../pages/portal/runtime/RuntimeWorkspace';
import PortalLessonPage from '../pages/portal/PortalLessonPage';
import PortalSessionsPage from '../pages/portal/PortalSessionsPage';
import PortalSessionDetailPage from '../pages/portal/PortalSessionDetailPage';
import PortalAssignmentsPage from '../pages/portal/PortalAssignmentsPage';
import PortalProgressPage from '../pages/portal/PortalProgressPage';
import TodayShell from '../pages/portal/today/TodayShell';
import SettingsPage from '../pages/portal/settings/SettingsPage';
import PathPage from '../pages/portal/path/PathPage';
import SchedulePage from '../pages/portal/schedule/SchedulePage';
import PointsPage from '../pages/portal/points/PointsPage';
import ProjectsPage from '../pages/portal/projects/ProjectsPage';
import CommunityPage from '../pages/portal/community/CommunityPage';
import CompanyPage from '../pages/portal/company/CompanyPage';
import ClassroomWeekPage from '../pages/portal/ClassroomWeekPage';

// The old AI Project Builder ("Cory") portal surfaces — CoryHome, Blueprint,
// System, Critique / visual-workspace, RequirementsBuilder, walk-caps, the DNA
// wizard, architect dashboard, etc. — were removed from the frontend on
// 2026-07-18 so students only ever see the Design E student platform.
// `/portal/home` and `/portal/dashboard` now redirect to the student home
// (Today); every other retired builder URL simply 404s.

const portalRoutes = (
  <Route element={<ParticipantAuthProvider><Outlet /></ParticipantAuthProvider>}>
    <Route path="/portal/login" element={<PortalLoginPage />} />
    <Route path="/portal/signup" element={<PortalFreeSignupPage />} />
    <Route path="/portal/verify" element={<PortalVerifyPage />} />
    {/* Phone handoff — public: exchanges a one-time QR code for a session, then lands on Today. */}
    <Route path="/portal/handoff" element={<PortalHandoffPage />} />
    <Route element={<PortalProtectedRoute />}>
      {/* Design E student surfaces — each renders its own PortalShell chrome,
          so they sit OUTSIDE PortalLayout. */}
      <Route path="/portal/today" element={<TodayShell />} />
      <Route path="/portal/settings" element={<SettingsPage />} />
      <Route path="/portal/path" element={<PathPage />} />
      <Route path="/portal/schedule" element={<SchedulePage />} />
      <Route path="/portal/points" element={<PointsPage />} />
      <Route path="/portal/projects" element={<ProjectsPage />} />
      <Route path="/portal/community" element={<CommunityPage />} />
      {/* Manager surface — renders its own PortalShell chrome; the shell adds the
          "Your company" nav group only for org managers, and the page itself
          shows a friendly error if a non-manager reaches it. */}
      <Route path="/portal/company" element={<CompanyPage />} />
      <Route path="/portal/classroom" element={<ClassroomPage />} />
      {/* Learning Runtime Intelligence — immersive per-card student workspace. */}
      <Route path="/portal/runtime/:cardId" element={<RuntimeWorkspace />} />
      {/* Retired AI Project Builder entry points → student home. */}
      <Route path="/portal/home" element={<Navigate to="/portal/today" replace />} />
      <Route path="/portal/dashboard" element={<Navigate to="/portal/today" replace />} />
      {/* Legacy student pages that still use the lean PortalLayout chrome. */}
      <Route element={<PortalLayout />}>
        <Route path="/portal/curriculum" element={<PortalCurriculumPage />} />
        <Route path="/portal/classroom/week/:weekNum" element={<ClassroomWeekPage />} />
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
