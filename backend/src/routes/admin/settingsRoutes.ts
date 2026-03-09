import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleGetRevenueDashboard } from '../../controllers/adminRevenueController';
import {
  handleGetSettings,
  handleUpdateSettings,
  handleSendTestDigest,
} from '../../controllers/adminSettingsController';

const router = Router();

// Revenue Dashboard
router.get('/api/admin/revenue/dashboard', requireAdmin, handleGetRevenueDashboard);

// Settings
router.get('/api/admin/settings', requireAdmin, handleGetSettings);
router.patch('/api/admin/settings', requireAdmin, handleUpdateSettings);
router.post('/api/admin/digest/test', requireAdmin, handleSendTestDigest);

export default router;
