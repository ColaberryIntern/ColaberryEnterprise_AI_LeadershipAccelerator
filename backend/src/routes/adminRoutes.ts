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

export default router;
