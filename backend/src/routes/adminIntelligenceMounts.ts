import { Router } from 'express';
import campaignRoutes from './admin/campaignRoutes';
import insightRoutes from './admin/insightRoutes';
import settingsRoutes from './admin/settingsRoutes';
import acceleratorRoutes from './admin/acceleratorRoutes';
import flotationIntakeRoutes from './admin/flotationIntakeRoutes';
import enterpriseClientsRoutes from './admin/enterpriseClientsRoutes';
import kbRoutes from './admin/kbRoutes';
import orchestrationRoutes from './admin/orchestrationRoutes';
import timelineAdminRoutes from './admin/timelineAdminRoutes';
import componentRoutes from './admin/componentRoutes';
import presentationStudioRoutes from './admin/presentationStudioRoutes';
import composerRoutes from './admin/composerRoutes';
import feedControlRoutes from './admin/feedControlRoutes';
import intelRoutes from './admin/intelRoutes';
import opsCenterRoutes from './admin/opsCenterRoutes';
import workforceRoutes from './admin/workforceRoutes';
import agentEffectiveAccessRoutes from './admin/agentEffectiveAccessRoutes';
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
import platformOperationsRoutes from './admin/platformOperationsRoutes';
import coryRoutes from './admin/coryRoutes';
import departmentIntelligenceRoutes from './admin/departmentIntelligenceRoutes';
import websiteIntelligenceRoutes from './admin/websiteIntelligenceRoutes';

/**
 * 33 admin sub-routers moved verbatim, in their original order, out of routes/adminRoutes.ts (AO2.1, 2026-11-28) so
 * that file stays under the 500-line ceiling. adminRoutes.ts mounts this router at the exact position the block held,
 * below router.use(mgmtSectionGate), so every route here keeps its section scoping and its relative mount order.
 * Each router carries its own guard; this file declares no routes.
 */
const router = Router();
router.use(campaignRoutes);
router.use(insightRoutes);
router.use(settingsRoutes);
router.use(acceleratorRoutes);
router.use(flotationIntakeRoutes);
// W32: Enterprise clients, from Book a demo pilot to signed.
router.use(enterpriseClientsRoutes);
router.use(kbRoutes);
router.use(orchestrationRoutes);
router.use(timelineAdminRoutes);
router.use(componentRoutes);
// Presentation Studio instructor controls. Behind PRESENTATION_STUDIO_ENABLED, so with
// the flag off these 404 exactly as if they did not exist.
router.use(presentationStudioRoutes);
router.use(composerRoutes);
router.use(feedControlRoutes);
router.use(intelRoutes);
router.use(opsCenterRoutes);
router.use(workforceRoutes);
router.use(agentEffectiveAccessRoutes);
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
router.use(platformOperationsRoutes);
router.use(coryRoutes);
router.use(departmentIntelligenceRoutes);
router.use(websiteIntelligenceRoutes);

export default router;
