import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleGetRevenueDashboard, handleGetRevenuePayments } from '../../controllers/adminRevenueController';
import {
  handleGetSettings,
  handleUpdateSettings,
  handleSendTestDigest,
} from '../../controllers/adminSettingsController';

const router = Router();

// Revenue Dashboard (legacy pipeline forecast — now served at /admin/pipeline)
router.get('/api/admin/revenue/dashboard', requireAdmin, handleGetRevenueDashboard);
// Unified payments feed for the rebuilt /admin/revenue page
router.get('/api/admin/revenue/payments', requireAdmin, handleGetRevenuePayments);

// Settings
router.get('/api/admin/settings', requireAdmin, handleGetSettings);
router.patch('/api/admin/settings', requireAdmin, handleUpdateSettings);
router.post('/api/admin/digest/test', requireAdmin, handleSendTestDigest);

export default router;
