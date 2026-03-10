import { Router } from 'express';
import { auditMiddleware } from '../middlewares/auditMiddleware';
import authRoutes from './admin/authRoutes';
import cohortRoutes from './admin/cohortRoutes';
import leadRoutes from './admin/leadRoutes';
import campaignRoutes from './admin/campaignRoutes';
import insightRoutes from './admin/insightRoutes';
import settingsRoutes from './admin/settingsRoutes';
import acceleratorRoutes from './admin/acceleratorRoutes';
import orchestrationRoutes from './admin/orchestrationRoutes';
import aiOpsRoutes from './admin/aiOpsRoutes';
import intelligenceRoutes from './admin/intelligenceRoutes';
import campaignTestRoutes from './admin/campaignTestRoutes';
import campaignSimulationRoutes from './admin/campaignSimulationRoutes';
import marketingRoutes from './admin/marketingRoutes';
import governanceRoutes from './admin/governanceRoutes';

const router = Router();

router.use(auditMiddleware);
router.use(authRoutes);
router.use(cohortRoutes);
router.use(leadRoutes);
router.use(campaignRoutes);
router.use(insightRoutes);
router.use(settingsRoutes);
router.use(acceleratorRoutes);
router.use(orchestrationRoutes);
router.use(aiOpsRoutes);
router.use(intelligenceRoutes);
router.use(campaignTestRoutes);
router.use(campaignSimulationRoutes);
router.use(marketingRoutes);
router.use(governanceRoutes);

export default router;
