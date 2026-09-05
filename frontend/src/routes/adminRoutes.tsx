import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminLayout from '../components/Layout/AdminLayout';
const AdminChangePasswordPage = lazy(() => import('../pages/admin/AdminChangePasswordPage'));
const CareerReviewPage = lazy(() => import('../pages/admin/CareerReviewPage'));
const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
const WarRoomPage = lazy(() => import('../pages/admin/WarRoomPage'));
const AdminCohortDetailPage = lazy(() => import('../pages/admin/AdminCohortDetailPage'));
const AdminLeadsPage = lazy(() => import('../pages/admin/AdminLeadsPage'));
const AdminBusinessAccountsPage = lazy(() => import('../pages/admin/AdminBusinessAccountsPage'));
const AdminBusinessAccountDetailPage = lazy(() => import('../pages/admin/AdminBusinessAccountDetailPage'));
const AdminLeadDetailPage = lazy(() => import('../pages/admin/AdminLeadDetailPage'));
const AdminPipelinePage = lazy(() => import('../pages/admin/AdminPipelinePage'));

const AdminImportPage = lazy(() => import('../pages/admin/AdminImportPage'));
const AdminRevenueDashboardPage = lazy(() => import('../pages/admin/AdminRevenueDashboardPage'));
const AdminRefundsPage = lazy(() => import('../pages/admin/AdminRefundsPage'));
const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage'));
const AdminCapeSettingsPage = lazy(() => import('../pages/admin/AdminCapeSettingsPage'));
const AdminFeedControlGovernancePage = lazy(() => import('../pages/admin/AdminFeedControlGovernancePage'));
const AdminCertPrepPage = lazy(() => import('../pages/admin/certprep/AdminCertPrepPage'));
const AdminEventLedgerPage = lazy(() => import('../pages/admin/AdminEventLedgerPage'));
const AdminCampaignsPage = lazy(() => import('../pages/admin/AdminCampaignsPage'));
const ExplorerGrowthPage = lazy(() => import('../pages/admin/ExplorerGrowthPage'));
const AdminCampaignDetailPage = lazy(() => import('../pages/admin/AdminCampaignDetailPage'));
const AdminApolloPage = lazy(() => import('../pages/admin/AdminApolloPage'));
const CampaignBuilderPage = lazy(() => import('../pages/admin/CampaignBuilderPage'));
const AdminICPInsightsPage = lazy(() => import('../pages/admin/AdminICPInsightsPage'));
const AdminVisitorsPage = lazy(() => import('../pages/admin/AdminVisitorsPage'));
const AdminTrackingEstatePage = lazy(() => import('../pages/admin/AdminTrackingEstatePage'));
const AdminOpportunitiesPage = lazy(() => import('../pages/admin/AdminOpportunitiesPage'));
const AdminAcceleratorPage = lazy(() => import('../pages/admin/AdminAcceleratorPage'));
const AdminAcceleratorSessionTimelinePage = lazy(() => import('../pages/admin/AdminAcceleratorSessionTimelinePage'));
const AdminStudentSuccessSnapshotPage = lazy(() => import('../pages/admin/studentSuccessSnapshot/AdminStudentSuccessSnapshotPage'));
const AdminCommunityRolesPage = lazy(() => import('../pages/admin/AdminCommunityRolesPage'));
const AdminStudentStoryPage = lazy(() => import('../pages/admin/AdminStudentStoryPage'));
const AdminKnowledgeOpsPage = lazy(() => import('../pages/admin/AdminKnowledgeOpsPage'));
const AdminOrchestrationPage = lazy(() => import('../pages/admin/AdminOrchestrationPage'));
const WorkforceOSPage = lazy(() => import('../pages/admin/workforce/WorkforceOSPage'));
const EnterpriseIntelligencePage = lazy(() => import('../pages/admin/intelligence/EnterpriseIntelligencePage'));
const IntelligenceOSPage = lazy(() => import('../pages/admin/intelligence/IntelligenceOSPage'));
const IntelligenceDiscoveryPage = lazy(() => import('../pages/admin/intelligence/IntelligenceDiscoveryPage'));
const IntelligenceSettingsPage = lazy(() => import('../pages/admin/intelligence/IntelligenceSettingsPage'));
const MissedOpportunitiesPage = lazy(() => import('../pages/admin/MissedOpportunitiesPage'));
const AgentOrphansPage = lazy(() => import('../pages/admin/AgentOrphansPage'));
const AdminMarketingDashboardPage = lazy(() => import('../pages/admin/marketing/AdminMarketingDashboardPage'));
const AdminCommunicationsPage = lazy(() => import('../pages/admin/AdminCommunicationsPage'));
const AdminTicketBoardPage = lazy(() => import('../pages/admin/AdminTicketBoardPage'));
const AgentDetailPage = lazy(() => import('../pages/admin/AgentDetailPage'));
const GovernanceCommandCenter = lazy(() => import('../pages/admin/GovernanceCommandCenter'));
const AdminGovernancePolicyPage = lazy(() => import('../pages/admin/AdminGovernancePolicyPage'));
const AdminProjectOverview = lazy(() => import('../pages/admin/AdminProjectOverview'));
const AdminCaseStudiesPage = lazy(() => import('../pages/admin/AdminCaseStudiesPage'));
const AdminCaseStudyDetailPage = lazy(() => import('../pages/admin/AdminCaseStudyDetailPage'));
const InboxCOSPage = lazy(() => import('../pages/admin/inbox/InboxCOSPage'));
const ContentQueuePage = lazy(() => import('../pages/admin/ContentQueuePage'));
const AdminSourcesPage = lazy(() => import('../pages/admin/AdminSourcesPage'));
const AdminGeneratorPage = lazy(() => import('../pages/admin/AdminGeneratorPage'));
const AdminIngestLogsPage = lazy(() => import('../pages/admin/AdminIngestLogsPage'));
const AdminWorkLedgerHealthPage = lazy(() => import('../pages/admin/AdminWorkLedgerHealthPage'));
const AdminExecutiveNarrativePage = lazy(() => import('../pages/admin/AdminExecutiveNarrativePage'));
const AdminRoutingRulesPage = lazy(() => import('../pages/admin/AdminRoutingRulesPage'));
const AdminAutonomousPage = lazy(() => import('../pages/admin/AdminAutonomousPage'));
const AdminAutomationPage = lazy(() => import('../pages/admin/AdminAutomationPage'));
const AdminReportsPage = lazy(() => import('../pages/admin/AdminReportsPage'));
const CEOCommandCenter = lazy(() => import('../pages/admin/CEOCommandCenter'));
const AdminFunnelPage = lazy(() => import('../pages/admin/AdminFunnelPage'));
const CbSystemCommand = lazy(() => import('../pages/admin/CbSystemCommand'));
const AdminTrustCenterPage = lazy(() => import('../pages/admin/AdminTrustCenterPage'));
const AdminPortalEnterPage = lazy(() => import('../pages/admin/AdminPortalEnterPage'));
// Refactored AI Delivery OS (Gates 10-11). Both surfaces sit under /admin for now because
// no authentication path resolves a PlatformIdentity yet, so a client reviewer cannot log
// in — see docs/architecture/refactored-delivery-os/CLIENT_IDENTITY_ANSWER.md. Serving the
// client room from a staff-authenticated route makes it reviewable by staff WITHOUT
// implying an external client can reach it.
const adminRoutes = (
  <>
    <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route element={<ProtectedRoute />}>
      {/* Staff → own student portal ("AI Training"): mints a full-access portal
          token, redirects to /portal/today. Sits outside AdminLayout, like the
          portal's mirror-image /portal/mgmt-enter sits outside PortalLayout. */}
      <Route path="/admin/ai-training-enter" element={<AdminPortalEnterPage />} />
      {/* The Client Review Room renders OUTSIDE AdminLayout, deliberately.
          Wrapping a client-facing surface in the operations sidebar (Revenue, Lead
          Ingestion, Campaigns, Intelligence) contradicts the one thing Gate 10 exists
          to guarantee: a client sees a different, narrower world than an operator.
          It is not a leak while the route is staff-only and no client can authenticate,
          but it makes the eventual mistake easy — the day someone shares this URL the
          projection layer would be doing its job while the chrome advertised the lead
          pipeline. Found by deploying to dev and LOOKING; CI cannot see this.
          Staff auth is retained via ProtectedRoute. */}
      <Route element={<AdminLayout />}>
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        {/* Portfolio review. INSIDE ProtectedRoute and AdminLayout: it first shipped
            beside /admin/login, outside the auth guard entirely, so the page was
            publicly loadable (the API still 401d, so no data leaked, but the surface
            was reachable). Found by Ali opening it and seeing no admin chrome — the
            missing sidebar was the visible symptom of the missing guard. */}
        <Route path="/admin/career-review" element={<CareerReviewPage />} />
        {/* Account self-service: reachable by every admin identity regardless
            of section scope (see UNIVERSAL_ADMIN_PATHS in adminNav.ts). */}
        <Route path="/admin/change-password" element={<AdminChangePasswordPage />} />
        <Route path="/admin/war-room" element={<WarRoomPage />} />
        <Route path="/admin/cohorts/:id" element={<AdminCohortDetailPage />} />
        <Route path="/admin/pipeline" element={<AdminPipelinePage />} />
        <Route path="/admin/leads" element={<AdminLeadsPage />} />
        {/* Business accounts: the staff-side view of `organizations`. Detail is
            declared after the list so "/admin/business-accounts" is not eaten
            by the ":id" segment. */}
        <Route path="/admin/business-accounts" element={<AdminBusinessAccountsPage />} />
        <Route path="/admin/business-accounts/:id" element={<AdminBusinessAccountDetailPage />} />
        <Route path="/admin/leads/:id" element={<AdminLeadDetailPage />} />
        <Route path="/admin/visitors" element={<AdminVisitorsPage />} />
        {/* Estate map: which sites report to which brand, read live. */}
        <Route path="/admin/tracking-estate" element={<AdminTrackingEstatePage />} />
        <Route path="/admin/funnel" element={<AdminFunnelPage />} />
        <Route path="/admin/opportunities" element={<AdminOpportunitiesPage />} />
        <Route path="/admin/campaigns" element={<AdminCampaignsPage />} />
        <Route path="/admin/explorer-growth" element={<ExplorerGrowthPage />} />
        <Route path="/admin/campaigns/build-cold" element={<CampaignBuilderPage />} />
        <Route path="/admin/campaigns/:id" element={<AdminCampaignDetailPage />} />
        <Route path="/admin/apollo" element={<AdminApolloPage />} />
        <Route path="/admin/sequences" element={<Navigate to="/admin/campaigns" replace />} />
        <Route path="/admin/import" element={<AdminImportPage />} />
        <Route path="/admin/revenue" element={<AdminRevenueDashboardPage />} />
        <Route path="/admin/refunds" element={<AdminRefundsPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/admin/cape-settings" element={<AdminCapeSettingsPage />} />
        <Route path="/admin/feed-control-governance" element={<AdminFeedControlGovernancePage />} />
        <Route path="/admin/cert-prep" element={<AdminCertPrepPage />} />
        <Route path="/admin/insights" element={<AdminICPInsightsPage />} />
        <Route path="/admin/events" element={<AdminEventLedgerPage />} />
        <Route path="/admin/accelerator" element={<AdminAcceleratorPage />} />
        <Route path="/admin/accelerator/sessions/:sessionId/timeline" element={<AdminAcceleratorSessionTimelinePage />} />
        <Route path="/admin/accelerator/enrollments/:id/success-snapshot" element={<AdminStudentSuccessSnapshotPage />} />
        <Route path="/admin/community-roles" element={<AdminCommunityRolesPage />} />
        <Route path="/admin/students" element={<AdminStudentStoryPage />} />
        <Route path="/admin/knowledge-ops" element={<AdminKnowledgeOpsPage />} />
        <Route path="/admin/orchestration" element={<AdminOrchestrationPage />} />
        {/* Operations Center is merged into AI Organization (Mission Control is its home). */}
        <Route path="/admin/ops-center" element={<Navigate to="/admin/workforce" replace />} />
        <Route path="/admin/workforce" element={<WorkforceOSPage />} />
        <Route path="/admin/brain" element={<EnterpriseIntelligencePage />} />
        <Route path="/admin/ai-settings" element={<Navigate to="/admin/intelligence" replace />} />
        <Route path="/admin/intelligence" element={<IntelligenceOSPage />} />
        <Route path="/admin/missed-opportunities" element={<MissedOpportunitiesPage />} />
        <Route path="/admin/intelligence/discovery" element={<IntelligenceDiscoveryPage />} />
        <Route path="/admin/intelligence/settings" element={<IntelligenceSettingsPage />} />
        <Route path="/admin/agent-orphans" element={<AgentOrphansPage />} />
        <Route path="/admin/communications" element={<AdminCommunicationsPage />} />
        <Route path="/admin/marketing" element={<AdminMarketingDashboardPage />} />
        <Route path="/admin/tickets" element={<AdminTicketBoardPage />} />
        <Route path="/admin/agents/:id" element={<AgentDetailPage />} />
        <Route path="/admin/governance" element={<GovernanceCommandCenter />} />
        <Route path="/admin/governance-policy" element={<AdminGovernancePolicyPage />} />
        <Route path="/admin/projects" element={<AdminProjectOverview />} />
        {/* Case Studies: the review desk for the publishable projection of a
            Project. The LIST is declared before the ":id" detail route.
            Under react-router v6 that ordering is a READABILITY convention, not
            a correctness requirement: v6 ranks by specificity, so a literal
            "/admin/case-studies/new" beats ":id" whichever order they appear in
            (probe-verified against 6.28.1). An earlier version of this comment
            claimed the literal would "resolve as an id" — that is v5 behaviour
            and is wrong here. Kept in this order anyway so the file reads the
            same way as the business-account pair above. */}
        <Route path="/admin/case-studies" element={<AdminCaseStudiesPage />} />
        <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
        <Route path="/admin/inbox" element={<InboxCOSPage />} />
        <Route path="/admin/content-queue" element={<ContentQueuePage />} />
        <Route path="/admin/sources" element={<AdminSourcesPage />} />
        <Route path="/admin/generator/:sourceSlug/:entrySlug" element={<AdminGeneratorPage />} />
        <Route path="/admin/ingest-logs" element={<AdminIngestLogsPage />} />
        <Route path="/admin/work-ledger-health" element={<AdminWorkLedgerHealthPage />} />
        <Route path="/admin/executive-narrative" element={<AdminExecutiveNarrativePage />} />
        <Route path="/admin/routing-rules" element={<AdminRoutingRulesPage />} />
        <Route path="/admin/autonomous" element={<AdminAutonomousPage />} />
        <Route path="/admin/automation" element={<AdminAutomationPage />} />
        <Route path="/admin/reports" element={<AdminReportsPage />} />
        <Route path="/admin/ceo" element={<CEOCommandCenter />} />
        <Route path="/admin/cb-system" element={<CbSystemCommand />} />
        {/* Old "Run My Day" port retired — it duplicated the advisor's /my-day.
            Redirect the old URL to the CB System Command dashboard. */}
        <Route path="/admin/ops" element={<Navigate to="/admin/cb-system" replace />} />
        <Route path="/admin/trust" element={<AdminTrustCenterPage />} />
      </Route>
    </Route>
  </>
);

export default adminRoutes;
