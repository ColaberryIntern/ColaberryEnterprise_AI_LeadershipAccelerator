import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminLayout from '../components/Layout/AdminLayout';
import AdminLoginPage from '../pages/admin/AdminLoginPage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminCohortDetailPage from '../pages/admin/AdminCohortDetailPage';
import AdminLeadsPage from '../pages/admin/AdminLeadsPage';
import AdminLeadDetailPage from '../pages/admin/AdminLeadDetailPage';
import AdminPipelinePage from '../pages/admin/AdminPipelinePage';
import AdminSequencesPage from '../pages/admin/AdminSequencesPage';
import AdminImportPage from '../pages/admin/AdminImportPage';
import AdminRevenueDashboardPage from '../pages/admin/AdminRevenueDashboardPage';
import AdminSettingsPage from '../pages/admin/AdminSettingsPage';
import AdminEventLedgerPage from '../pages/admin/AdminEventLedgerPage';
import AdminCampaignsPage from '../pages/admin/AdminCampaignsPage';
import AdminCampaignDetailPage from '../pages/admin/AdminCampaignDetailPage';
import AdminApolloPage from '../pages/admin/AdminApolloPage';
import CampaignBuilderPage from '../pages/admin/CampaignBuilderPage';
import AdminICPInsightsPage from '../pages/admin/AdminICPInsightsPage';
import AdminVisitorsPage from '../pages/admin/AdminVisitorsPage';
import AdminOpportunitiesPage from '../pages/admin/AdminOpportunitiesPage';
import AdminAcceleratorPage from '../pages/admin/AdminAcceleratorPage';
import AdminOrchestrationPage from '../pages/admin/AdminOrchestrationPage';
import AdminAISettingsPage from '../pages/admin/AdminAISettingsPage';
import IntelligenceOSPage from '../pages/admin/intelligence/IntelligenceOSPage';
import IntelligenceDiscoveryPage from '../pages/admin/intelligence/IntelligenceDiscoveryPage';
import IntelligenceSettingsPage from '../pages/admin/intelligence/IntelligenceSettingsPage';
import AdminMarketingDashboardPage from '../pages/admin/marketing/AdminMarketingDashboardPage';
const adminRoutes = (
  <>
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
        <Route path="/admin/orchestration" element={<AdminOrchestrationPage />} />
        <Route path="/admin/ai-settings" element={<AdminAISettingsPage />} />
        <Route path="/admin/intelligence" element={<IntelligenceOSPage />} />
        <Route path="/admin/intelligence/discovery" element={<IntelligenceDiscoveryPage />} />
        <Route path="/admin/intelligence/settings" element={<IntelligenceSettingsPage />} />
        <Route path="/admin/marketing" element={<AdminMarketingDashboardPage />} />
      </Route>
    </Route>
  </>
);

export default adminRoutes;
