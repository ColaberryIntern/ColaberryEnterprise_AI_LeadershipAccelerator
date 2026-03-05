import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ToastProvider from './components/ui/ToastProvider';
import ScrollToTop from './components/ScrollToTop';
import PublicLayout from './components/Layout/PublicLayout';
import AdminLayout from './components/Layout/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import ProgramPage from './pages/ProgramPage';
import PricingPage from './pages/PricingPage';
import ContactPage from './pages/ContactPage';
import SponsorshipPage from './pages/SponsorshipPage';
import AdvisoryPage from './pages/AdvisoryPage';
import CaseStudiesPage from './pages/CaseStudiesPage';
import EnrollPage from './pages/EnrollPage';
import EnrollSuccessPage from './pages/EnrollSuccessPage';
import EnrollCancelPage from './pages/EnrollCancelPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminCohortDetailPage from './pages/admin/AdminCohortDetailPage';
import AdminLeadsPage from './pages/admin/AdminLeadsPage';
import AdminLeadDetailPage from './pages/admin/AdminLeadDetailPage';
import AdminPipelinePage from './pages/admin/AdminPipelinePage';
import AdminSequencesPage from './pages/admin/AdminSequencesPage';
import AdminImportPage from './pages/admin/AdminImportPage';
import AdminRevenueDashboardPage from './pages/admin/AdminRevenueDashboardPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminEventLedgerPage from './pages/admin/AdminEventLedgerPage';
import AdminCampaignsPage from './pages/admin/AdminCampaignsPage';
import AdminCampaignDetailPage from './pages/admin/AdminCampaignDetailPage';
import AdminApolloPage from './pages/admin/AdminApolloPage';
import CampaignBuilderPage from './pages/admin/CampaignBuilderPage';
import AdminICPInsightsPage from './pages/admin/AdminICPInsightsPage';
import AdminVisitorsPage from './pages/admin/AdminVisitorsPage';
import AdminOpportunitiesPage from './pages/admin/AdminOpportunitiesPage';
import AdminAcceleratorPage from './pages/admin/AdminAcceleratorPage';
import ExecOverviewThankYouPage from './pages/ExecOverviewThankYouPage';
import StrategyCallPrepPage from './pages/StrategyCallPrepPage';
import { ParticipantAuthProvider } from './contexts/ParticipantAuthContext';
import PortalProtectedRoute from './components/PortalProtectedRoute';
import PortalLayout from './components/Layout/PortalLayout';
import PortalLoginPage from './pages/portal/PortalLoginPage';
import PortalVerifyPage from './pages/portal/PortalVerifyPage';
import PortalDashboardPage from './pages/portal/PortalDashboardPage';
import PortalSessionsPage from './pages/portal/PortalSessionsPage';
import PortalSessionDetailPage from './pages/portal/PortalSessionDetailPage';
import PortalAssignmentsPage from './pages/portal/PortalAssignmentsPage';
import PortalProgressPage from './pages/portal/PortalProgressPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/program" element={<ProgramPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/sponsorship" element={<SponsorshipPage />} />
          <Route path="/advisory" element={<AdvisoryPage />} />
          <Route path="/case-studies" element={<CaseStudiesPage />} />
          <Route path="/enroll" element={<EnrollPage />} />
          <Route path="/enroll/success" element={<EnrollSuccessPage />} />
          <Route path="/enroll/cancel" element={<EnrollCancelPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/executive-overview/thank-you" element={<ExecOverviewThankYouPage />} />
          <Route path="/strategy-call-prep" element={<StrategyCallPrepPage />} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/cohorts/:id" element={<AdminCohortDetailPage />} />
            <Route path="/admin/pipeline" element={<AdminPipelinePage />} />
            <Route path="/admin/leads" element={<AdminLeadsPage />} />
            <Route path="/admin/leads/:id" element={<AdminLeadDetailPage />} />
            <Route path="/admin/visitors" element={<AdminVisitorsPage />} />
            <Route path="/admin/opportunities" element={<AdminOpportunitiesPage />} />
            <Route path="/admin/campaigns" element={<AdminCampaignsPage />} />
            <Route path="/admin/campaigns/build-cold" element={<CampaignBuilderPage />} />
            <Route path="/admin/campaigns/:id" element={<AdminCampaignDetailPage />} />
            <Route path="/admin/apollo" element={<AdminApolloPage />} />
            <Route path="/admin/sequences" element={<AdminSequencesPage />} />
            <Route path="/admin/import" element={<AdminImportPage />} />
            <Route path="/admin/revenue" element={<AdminRevenueDashboardPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/insights" element={<AdminICPInsightsPage />} />
            <Route path="/admin/events" element={<AdminEventLedgerPage />} />
            <Route path="/admin/accelerator" element={<AdminAcceleratorPage />} />
          </Route>
        </Route>
        <Route element={<ParticipantAuthProvider><Outlet /></ParticipantAuthProvider>}>
          <Route path="/portal/login" element={<PortalLoginPage />} />
          <Route path="/portal/verify" element={<PortalVerifyPage />} />
          <Route element={<PortalProtectedRoute />}>
            <Route element={<PortalLayout />}>
              <Route path="/portal/dashboard" element={<PortalDashboardPage />} />
              <Route path="/portal/sessions" element={<PortalSessionsPage />} />
              <Route path="/portal/sessions/:id" element={<PortalSessionDetailPage />} />
              <Route path="/portal/assignments" element={<PortalAssignmentsPage />} />
              <Route path="/portal/progress" element={<PortalProgressPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
