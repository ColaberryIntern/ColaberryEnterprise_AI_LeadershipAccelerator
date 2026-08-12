import React from 'react';
import { Route, Outlet, Navigate } from 'react-router-dom';
import { ParticipantAuthProvider } from '../contexts/ParticipantAuthContext';
import PortalProtectedRoute from '../components/PortalProtectedRoute';
import PortalLayout from '../components/Layout/PortalLayout';
import PortalLoginPage from '../pages/portal/PortalLoginPage';
import PortalFreeSignupPage from '../pages/portal/PortalFreeSignupPage';
import PortalVerifyPage from '../pages/portal/PortalVerifyPage';
import DevLoginPage from '../pages/portal/DevLoginPage';
import PortalViewAsPage from '../pages/portal/PortalViewAsPage';
import PortalMgmtEnterPage from '../pages/portal/PortalMgmtEnterPage';
import ReadOnlyBanner from '../components/portal/ReadOnlyBanner';
import PortalHandoffPage from '../pages/portal/PortalHandoffPage';
import ClassCheckinPage from '../pages/portal/ClassCheckinPage';
import ClassroomPage from '../pages/portal/ClassroomPage';
import PageGate from '../components/paywall/PageGate';
import RuntimeWorkspace from '../pages/portal/runtime/RuntimeWorkspace';
import PortalLessonPage from '../pages/portal/PortalLessonPage';
import PortalSessionsPage from '../pages/portal/PortalSessionsPage';
import PortalAssignmentsPage from '../pages/portal/PortalAssignmentsPage';
import PortalProgressPage from '../pages/portal/PortalProgressPage';
import TodayShell from '../pages/portal/today/TodayShell';
import SettingsPage from '../pages/portal/settings/SettingsPage';
import PathPage from '../pages/portal/path/PathPage';
import SchedulePage from '../pages/portal/schedule/SchedulePage';
import PointsPage from '../pages/portal/points/PointsPage';
import ProjectsPage from '../pages/portal/projects/ProjectsPage';
import CommunityPage from '../pages/portal/community/CommunityPage';
import PeopleDirectoryPage from '../pages/portal/community/PeopleDirectoryPage';
import RoomsPage from '../pages/portal/rooms/RoomsPage';
import GlobalLibraryPage from '../pages/portal/library/GlobalLibraryPage';
import CompanyPage from '../pages/portal/company/CompanyPage';
import ClassroomWeekPage from '../pages/portal/ClassroomWeekPage';
import ArchitectDashboard from '../pages/portal/ArchitectDashboard';
import ProjectBuilderFlow from '../pages/portal/ProjectBuilderFlow';

// Most of the old AI Project Builder ("Cory") portal surfaces — CoryHome,
// Blueprint, System, Critique / visual-workspace, RequirementsBuilder,
// walk-caps, the DNA wizard, etc. — were removed from the frontend on
// 2026-07-18 so students only ever see the Design E student platform.
// `/portal/home` and `/portal/dashboard` now redirect to the student home
// (Today); every other retired builder URL simply 404s. ArchitectDashboard
// and ProjectBuilderFlow are the exception: ongoing dev work on them
// (GitHub Activity widget, PR #720) survived the removal per explicit
// decision, so those two stayed live at /portal/architect-dashboard and
// /portal/project/builder.

const portalRoutes = (
  <Route element={<ParticipantAuthProvider><ReadOnlyBanner /><Outlet /></ParticipantAuthProvider>}>
    <Route path="/portal/login" element={<PortalLoginPage />} />
    <Route path="/portal/signup" element={<PortalFreeSignupPage />} />
    <Route path="/portal/verify" element={<PortalVerifyPage />} />
    <Route path="/portal/dev-login" element={<DevLoginPage />} />
    {/* Admin "View as member" — read-only impersonation landing (token in the URL hash). */}
    <Route path="/portal/view-as" element={<PortalViewAsPage />} />
    {/* Phone handoff — public: exchanges a one-time QR code for a session, then lands on Today. */}
    <Route path="/portal/handoff" element={<PortalHandoffPage />} />
    {/* Live-class check-in — PUBLIC: a student may scan the room QR before signing
        in. Records attendance if signed in, else routes them to log in. */}
    <Route path="/portal/class-checkin/:sessionId" element={<ClassCheckinPage />} />
    <Route element={<PortalProtectedRoute />}>
      {/* Design E student surfaces — each renders its own PortalShell chrome,
          so they sit OUTSIDE PortalLayout. */}
      <Route path="/portal/today" element={<TodayShell />} />
      {/* Employee → management portal: mints a scoped admin token, redirects to /admin. */}
      <Route path="/portal/mgmt-enter" element={<PortalMgmtEnterPage />} />
      <Route path="/portal/settings" element={<SettingsPage />} />
      <Route path="/portal/path" element={<PathPage />} />
      <Route path="/portal/schedule" element={<SchedulePage />} />
      <Route path="/portal/points" element={<PointsPage />} />
      <Route path="/portal/projects" element={<PageGate feature="projects"><ProjectsPage /></PageGate>} />
      <Route path="/portal/community" element={<CommunityPage />} />
      <Route path="/portal/community/people" element={<PeopleDirectoryPage />} />
      <Route path="/portal/rooms" element={<RoomsPage />} />
      <Route path="/portal/rooms/:roomId" element={<RoomsPage />} />
      <Route path="/portal/library" element={<GlobalLibraryPage />} />
      {/* Manager surface — renders its own PortalShell chrome; the shell adds the
          "Your company" nav group only for org managers, and the page itself
          shows a friendly error if a non-manager reaches it. */}
      <Route path="/portal/company" element={<CompanyPage />} />
      <Route path="/portal/classroom" element={<PageGate feature="classroom"><ClassroomPage /></PageGate>} />
      {/* Learning Runtime Intelligence — immersive per-card student workspace. */}
      <Route path="/portal/runtime/:cardId" element={<RuntimeWorkspace />} />
      {/* Retired AI Project Builder entry points → student home. */}
      <Route path="/portal/home" element={<Navigate to="/portal/today" replace />} />
      <Route path="/portal/dashboard" element={<Navigate to="/portal/today" replace />} />
      {/* Legacy student pages that still use the lean PortalLayout chrome. */}
      <Route element={<PortalLayout />}>
        {/* Retired: the legacy curriculum-modules browser had zero CurriculumModule
            rows linked to any current cohort and 500'd on every open (found
            2026-07-30 via a real student report). Redirect rather than delete the
            route outright, in case an old bookmark or email link still points here. */}
        <Route path="/portal/curriculum" element={<Navigate to="/portal/today" replace />} />
        <Route path="/portal/classroom/week/:weekNum" element={<ClassroomWeekPage />} />
        <Route path="/portal/curriculum/lessons/:lessonId" element={<PortalLessonPage />} />
        <Route path="/portal/sessions" element={<PortalSessionsPage />} />
        {/* Retired: the class waiting room is now the session's Colaberry
            Commons room (see NextLiveClassCard/ClassroomPage/etc, which all
            link to /portal/rooms/:room_id directly). Redirect rather than
            delete the route outright, in case an old bookmark or email link
            still points here — matches the /portal/curriculum precedent above. */}
        <Route path="/portal/sessions/:id" element={<Navigate to="/portal/sessions" replace />} />
        <Route path="/portal/assignments" element={<PortalAssignmentsPage />} />
        <Route path="/portal/progress" element={<PortalProgressPage />} />
        <Route path="/portal/architect-dashboard" element={<ArchitectDashboard />} />
        <Route path="/portal/project/builder" element={<ProjectBuilderFlow />} />
      </Route>
    </Route>
  </Route>
);

export default portalRoutes;
