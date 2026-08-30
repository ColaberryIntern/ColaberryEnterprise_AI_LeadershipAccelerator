import { Router } from 'express';
import { auditMiddleware } from '../middlewares/auditMiddleware';
import { requireAdmin, requireSection } from '../middlewares/authMiddleware';
import { mgmtSectionGate } from '../middlewares/mgmtSectionGate';
import { caseStudySurfaceLabGate } from '../middlewares/caseStudySurfaceLabGate';
import authRoutes from './admin/authRoutes';
import cohortRoutes from './admin/cohortRoutes';
import leadRoutes from './admin/leadRoutes';
import organizationRoutes from './admin/organizationRoutes';
import caseStudyAdminRoutes from './admin/caseStudyAdminRoutes';
import caseStudyStudioRoutes from './admin/caseStudyStudioRoutes';
import campaignRoutes from './admin/campaignRoutes';
import insightRoutes from './admin/insightRoutes';
import settingsRoutes from './admin/settingsRoutes';
import acceleratorRoutes from './admin/acceleratorRoutes';
import kbRoutes from './admin/kbRoutes';
import orchestrationRoutes from './admin/orchestrationRoutes';
import timelineAdminRoutes from './admin/timelineAdminRoutes';
import componentRoutes from './admin/componentRoutes';
import composerRoutes from './admin/composerRoutes';
import feedControlRoutes from './admin/feedControlRoutes';
import intelRoutes from './admin/intelRoutes';
import opsCenterRoutes from './admin/opsCenterRoutes';
import workforceRoutes from './admin/workforceRoutes';
import enterpriseIntelligenceRoutes from './admin/enterpriseIntelligenceRoutes';
import aiOpsRoutes from './admin/aiOpsRoutes';
import intelligenceRoutes from './admin/intelligenceRoutes';
import campaignTestRoutes from './admin/campaignTestRoutes';
import campaignSimulationRoutes from './admin/campaignSimulationRoutes';
import marketingRoutes from './admin/marketingRoutes';
import governanceRoutes from './admin/governanceRoutes';
import campaignIntelligenceRoutes from './admin/campaignIntelligenceRoutes';
import alumniRoutes from './admin/alumniRoutes';
import autonomyRoutes from './admin/autonomyRoutes';
import companyRoutes from './admin/companyRoutes';
import automationRoutes from './admin/automationRoutes';
import coryRoutes from './admin/coryRoutes';
import departmentIntelligenceRoutes from './admin/departmentIntelligenceRoutes';
import websiteIntelligenceRoutes from './admin/websiteIntelligenceRoutes';
import admissionsRoutes from './admin/admissionsRoutes';
import ticketRoutes from './admin/ticketRoutes';
import previewRoutes from './admin/previewRoutes';
import alertRoutes from './admin/alertRoutes';
import careerReviewRoutes from './admin/careerReviewRoutes';
import openclawRoutes from './admin/openclawRoutes';
import reportingRoutes from './admin/reportingRoutes';
import governanceCenterRoutes from './admin/governanceCenterRoutes';
import executiveAwarenessRoutes from './admin/executiveAwarenessRoutes';
import strategicIntelligenceRoutes from './admin/strategicIntelligenceRoutes';
import securityRoutes from './admin/securityRoutes';
import deploymentRoutes from './admin/deploymentRoutes';
import schedulerControlRoutes from './admin/schedulerControlRoutes';
import agentGovernanceRoutes from './admin/agentGovernanceRoutes';
import agentOrphanRoutes from './admin/agentOrphanRoutes';
import projectOverviewRoutes from './admin/projectOverviewRoutes';
import previewStackRoutes from './admin/previewStackRoutes';
import testSetupRoutes from './admin/testSetupRoutes';
import productionCleanupRoutes from './admin/productionCleanupRoute';
import productionActivationRoutes from './admin/productionActivationRoute';
import campaignDiagnosticsRoutes from './admin/campaignDiagnosticsRoutes';
import visitorFlowRoutes from './admin/visitorFlowRoutes';
import marketingFunnelRoutes from './admin/marketingFunnelRoutes';
import artifactRelationshipRoutes from './admin/artifactRelationshipRoutes';
import dashboardRoutes from './admin/dashboardRoutes';
import communicationRoutes from './admin/communicationRoutes';
import businessProcessRoutes from './admin/businessProcessRoutes';
import capabilityAgentRoutes from './admin/capabilityAgentRoutes';
import userJourneyMapsRoutes from './admin/userJourneyMapsRoutes';
import roleRoutes from './admin/roleRoutes';
import implementationStrategyRoutes from './admin/implementationStrategyRoutes';
import visitorAnalyticsRoutes from './admin/visitorAnalyticsRoutes';
import inboxRoutes from './admin/inboxRoutes';
import inboxCaseRoutes from './admin/inboxCaseRoutes';
import missedOpportunitiesRoutes from './admin/missedOpportunitiesRoutes';
import contentQueueRoutes from './admin/contentQueueRoutes';
import sourceRoutes from './admin/sourceRoutes';
import refundRoutes from './admin/refundRoutes';
import formDefinitionRoutes from './admin/formDefinitionRoutes';
import routingRuleRoutes from './admin/routingRuleRoutes';
import ingestLogRoutes from './admin/ingestLogRoutes';
import workLedgerRoutes from './admin/workLedgerRoutes';
import agentDetailRoutes from './admin/agentDetailRoutes';
import agentRoleCharterRoutes from './admin/agentRoleCharterRoutes';
import managerDirectiveRoutes from './admin/managerDirectiveRoutes';
import managerInboxRoutes from './admin/managerInboxRoutes';
import agentManagerConversationRoutes from './admin/agentManagerConversationRoutes';
import agentGoalRoutes from './admin/agentGoalRoutes';
import generatorRoutes from './admin/generatorRoutes';
import autonomousIngestRoutes from './admin/autonomousRoutes';
import automatedReportsRoutes from './admin/automatedReportsRoutes';
import opsRoutes from './admin/opsRoutes';
import cbSystemRoutes from './admin/cbSystemRoutes';
import anthropicRoutes from './admin/anthropicRoutes';
import qrAnalyticsRoutes from './admin/qrAnalyticsRoutes';
import mentorReviewRoutes from './admin/mentorReviewRoutes';
import trustRoutes from './admin/trustRoutes';
import communityModerationRoutes from './admin/communityModerationRoutes';
import communityMemberRoutes from './admin/communityMemberRoutes';
import podcastRoutes from './admin/podcastRoutes';
import vaErpRoutes from './admin/vaErpRoutes';
import studentStoryRoutes from './admin/studentStoryRoutes';

const router = Router();

router.use(auditMiddleware);
// RBAC: global section gate. Caps bridge-minted scoped mgmt roles (curriculum,
// revenue, admissions, support) to their allowed sections by request path.
// Legacy admins and owner pass untouched; runs before every admin sub-router.
router.use(mgmtSectionGate);
router.use(authRoutes);
router.use(cohortRoutes);
router.use(leadRoutes);
router.use(organizationRoutes);
// Case Study OS admin surface. Every path is fully qualified
// (/api/admin/case-studies/...) and carries requireAdmin per route, so its
// position among the sibling sub-routers is not load-bearing — but it MUST stay
// below router.use(mgmtSectionGate) above, or scoped management roles bypass the
// section check entirely. Its PATH_SECTION entry maps it to 'program', the same
// section /api/admin/projects uses: a Case Study is the publishable projection
// of a Project, so the roles that manage Projects manage these.
// Case Study four-lens surface lab — the ONLY code path in the system that
// renders a non-enterprise surface. Mounted PATH-SCOPED, above the sub-router it
// guards, and deliberately not as `router.use(gate)` inside
// caseStudyAdminRoutes: sub-routers here mount with no path prefix, so an
// unscoped guard inside one applies to every later router's paths as well. That
// has already caused a production outage in this repo.
//
// `requireAdmin` is repeated here rather than relied upon from the sub-router
// because middleware on this mount runs BEFORE the route's own guards, and the
// lab gate needs `req.admin.sub` to exist. It is scoped to this one path, so it
// cannot leak onto a sibling.
//
// It refuses a REQUEST, not a route: an `enterprise` preview, and every other
// Case Study admin call, passes through untouched.
router.use('/api/admin/case-studies/:id/preview', requireAdmin, caseStudySurfaceLabGate);
router.use(caseStudyAdminRoutes);
// Story Studio authoring routes. A SIBLING of the review-desk router rather than
// growth inside it: that file is what a reviewer can do, this one is what an
// author can do, and keeping the two route tables separately readable is worth
// more than one import. Mounted identically — no path prefix, `requireAdmin` on
// each route individually — and every path sits under `/api/admin/case-studies`,
// so `mgmtSectionGate`'s existing `program` row already covers them. A new
// prefix would be deny-by-default for every scoped management role while legacy
// admin passed, which is a surface that half-works and looks fine.
router.use(caseStudyStudioRoutes);
router.use(campaignRoutes);
router.use(insightRoutes);
router.use(settingsRoutes);
router.use(acceleratorRoutes);
router.use(kbRoutes);
router.use(orchestrationRoutes);
router.use(timelineAdminRoutes);
router.use(componentRoutes);
router.use(composerRoutes);
router.use(feedControlRoutes);
router.use(intelRoutes);
router.use(opsCenterRoutes);
router.use(workforceRoutes);
router.use(enterpriseIntelligenceRoutes);
router.use(aiOpsRoutes);
router.use(intelligenceRoutes);
router.use(campaignTestRoutes);
router.use(campaignSimulationRoutes);
router.use(marketingRoutes);
router.use(governanceRoutes);
router.use(campaignIntelligenceRoutes);
router.use(alumniRoutes);
router.use(autonomyRoutes);
router.use(companyRoutes);
router.use(automationRoutes);
router.use(coryRoutes);
router.use(departmentIntelligenceRoutes);
router.use(websiteIntelligenceRoutes);
router.use(admissionsRoutes);
router.use(ticketRoutes);
router.use(previewRoutes);
router.use(alertRoutes);
router.use(careerReviewRoutes);
router.use(openclawRoutes);
router.use(reportingRoutes);
router.use(governanceCenterRoutes);
router.use(executiveAwarenessRoutes);
router.use(strategicIntelligenceRoutes);
router.use(securityRoutes);
router.use(deploymentRoutes);
router.use(schedulerControlRoutes);
router.use(agentGovernanceRoutes);
router.use(agentOrphanRoutes);
router.use(projectOverviewRoutes);
router.use(previewStackRoutes);
router.use(testSetupRoutes);
router.use(productionCleanupRoutes);
router.use(productionActivationRoutes);
router.use(campaignDiagnosticsRoutes);
router.use(visitorFlowRoutes);
router.use(marketingFunnelRoutes);
router.use(artifactRelationshipRoutes);
router.use(dashboardRoutes);
router.use(communicationRoutes);
router.use(businessProcessRoutes);
router.use(capabilityAgentRoutes);
router.use(userJourneyMapsRoutes);
router.use(roleRoutes);
router.use(implementationStrategyRoutes);
router.use(visitorAnalyticsRoutes);
// RBAC: the Inbox & Content section is excluded for mgmt 'admin' (Kes) and every
// scoped role — enforced server-side (not just hidden in the nav). Path-scoped so
// it runs only for these prefixes, before each sub-router's own requireAdmin.
router.use('/api/admin/inbox', requireSection('inbox_content'));
router.use('/api/admin/content-queue', requireSection('inbox_content'));
router.use(inboxRoutes);
// Inbox Intel — Case Resolution Engine: mounted under the same /api/admin/inbox
// prefix, so it inherits the requireSection('inbox_content') gate above.
router.use(inboxCaseRoutes);
router.use(missedOpportunitiesRoutes);
router.use(contentQueueRoutes);
router.use(sourceRoutes);
router.use(refundRoutes);
router.use(podcastRoutes);
router.use(formDefinitionRoutes);
router.use(routingRuleRoutes);
router.use(ingestLogRoutes);
router.use(workLedgerRoutes);
router.use(agentDetailRoutes);
router.use(agentRoleCharterRoutes);
router.use(managerDirectiveRoutes);
router.use(managerInboxRoutes);
router.use(agentManagerConversationRoutes);
router.use(agentGoalRoutes);
router.use(generatorRoutes);
router.use(autonomousIngestRoutes);
router.use(automatedReportsRoutes);
router.use(opsRoutes);
router.use(cbSystemRoutes);
router.use(anthropicRoutes);
router.use(qrAnalyticsRoutes);
router.use(mentorReviewRoutes);
router.use(trustRoutes);
router.use(communityModerationRoutes);
router.use(vaErpRoutes);
router.use(communityMemberRoutes);
router.use(studentStoryRoutes);

export default router;
