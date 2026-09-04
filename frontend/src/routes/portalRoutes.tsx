import React, { lazy } from 'react';
import { Route, Outlet, Navigate } from 'react-router-dom';
import { ParticipantAuthProvider } from '../contexts/ParticipantAuthContext';
import PortalProtectedRoute from '../components/PortalProtectedRoute';
import PortalLayout from '../components/Layout/PortalLayout';
const PortalLoginPage = lazy(() => import('../pages/portal/PortalLoginPage'));
const PortalFreeSignupPage = lazy(() => import('../pages/portal/PortalFreeSignupPage'));
const PortalVerifyPage = lazy(() => import('../pages/portal/PortalVerifyPage'));
const PortalViewAsPage = lazy(() => import('../pages/portal/PortalViewAsPage'));
const PortalMgmtEnterPage = lazy(() => import('../pages/portal/PortalMgmtEnterPage'));
import ReadOnlyBanner from '../components/portal/ReadOnlyBanner';
const PortalHandoffPage = lazy(() => import('../pages/portal/PortalHandoffPage'));
const ClassCheckinPage = lazy(() => import('../pages/portal/ClassCheckinPage'));
const ClassroomPage = lazy(() => import('../pages/portal/ClassroomPage'));
import PageGate from '../components/paywall/PageGate';
const RuntimeWorkspace = lazy(() => import('../pages/portal/runtime/RuntimeWorkspace'));
const ProjectWorkspacePage = lazy(() => import('../pages/portal/projects/ProjectWorkspacePage'));
const PortalLessonPage = lazy(() => import('../pages/portal/PortalLessonPage'));
const PortalSessionsPage = lazy(() => import('../pages/portal/PortalSessionsPage'));
const PortalAssignmentsPage = lazy(() => import('../pages/portal/PortalAssignmentsPage'));
const PortalProgressPage = lazy(() => import('../pages/portal/PortalProgressPage'));
const TodayShell = lazy(() => import('../pages/portal/today/TodayShell'));
const SettingsPage = lazy(() => import('../pages/portal/settings/SettingsPage'));
const PathPage = lazy(() => import('../pages/portal/path/PathPage'));
const SchedulePage = lazy(() => import('../pages/portal/schedule/SchedulePage'));
const EventsPage = lazy(() => import('../pages/portal/events/EventsPage'));
const PointsPage = lazy(() => import('../pages/portal/points/PointsPage'));
const ProjectsPage = lazy(() => import('../pages/portal/projects/ProjectsPage'));
const PortfolioPage = lazy(() => import('../pages/portal/portfolio/PortfolioPage'));
const PortfolioPreviewPage = lazy(() => import('../pages/portal/portfolio/PortfolioPreviewPage'));
const CertPrepPage = lazy(() => import('../pages/portal/certprep/CertPrepPage'));
const CommunityPage = lazy(() => import('../pages/portal/community/CommunityPage'));
const PeopleDirectoryPage = lazy(() => import('../pages/portal/community/PeopleDirectoryPage'));
const RoomsPage = lazy(() => import('../pages/portal/rooms/RoomsPage'));
const GlobalLibraryPage = lazy(() => import('../pages/portal/library/GlobalLibraryPage'));
const CompanyPage = lazy(() => import('../pages/portal/company/CompanyPage'));
const ClassroomWeekPage = lazy(() => import('../pages/portal/ClassroomWeekPage'));

// The old AI Project Builder ("Cory") portal surfaces — CoryHome, Blueprint,
// System, Critique / visual-workspace, RequirementsBuilder, walk-caps, the DNA
// wizard, architect dashboard, etc. — were removed from the frontend on
// 2026-07-18 so students only ever see the Design E student platform.
// `/portal/home` and `/portal/dashboard` now redirect to the student home
// (Today); every other retired builder URL simply 404s.

const portalRoutes = (
  <Route element={<ParticipantAuthProvider><ReadOnlyBanner /><Outlet /></ParticipantAuthProvider>}>
    <Route path="/portal/login" element={<PortalLoginPage />} />
    <Route path="/portal/signup" element={<PortalFreeSignupPage />} />
    <Route path="/portal/verify" element={<PortalVerifyPage />} />
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
      {/* Public event list (CCPP Registration-labelled events). Ungated like
          Schedule — these are open-to-the-community events, not paid content. */}
      <Route path="/portal/events" element={<EventsPage />} />
      <Route path="/portal/points" element={<PointsPage />} />
      <Route path="/portal/projects" element={<PageGate feature="projects"><ProjectsPage /></PageGate>} />
      {/* Living Career Portfolio — the private Career Studio. Gated like its
          siblings; the resume prerequisite inside it is enforced server-side. */}
      <Route path="/portal/portfolio" element={<PageGate feature="portfolio"><PortfolioPage /></PageGate>} />
      {/* The learner's own page as a PAGE, opened in a new tab from Publishing. `preview`
          is a static segment and /portal/portfolio has no dynamic child, so it shadows
          nothing. Same entitlement gate as the Studio it is reached from. */}
      <Route
        path="/portal/portfolio/preview"
        element={(
          // `chromeless`: this opens in its own tab as a standalone render of the
          // learner's public page, so the gate must not flash a portal sidebar around
          // it while entitlement resolves. Same check, no chrome.
          <PageGate feature="portfolio" chromeless>
            <PortfolioPreviewPage />
          </PageGate>
        )}
      />
      {/* Cert Prep — Claude Certified Architect readiness. Paywalled like its
          siblings; the Week 7 fence is enforced SERVER-side and the page renders
          whatever the API says, so a client reaching this route early still sees
          the locked state rather than an empty dashboard. */}
      <Route path="/portal/cert-prep" element={<PageGate feature="cert-prep"><CertPrepPage /></PageGate>} />
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
      {/* The build-side twin of the runtime: same page shape, a story instead
          of a card. Keyed on the STORY id, which is what a student sees. */}
      <Route path="/portal/projects/workspace/:projectId/:taskId" element={<ProjectWorkspacePage />} />
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
      </Route>
    </Route>
  </Route>
);

export default portalRoutes;
