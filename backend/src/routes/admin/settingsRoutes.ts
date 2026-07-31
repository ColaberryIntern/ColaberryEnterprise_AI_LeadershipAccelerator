import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetRevenueDashboard,
  handleGetRevenuePayments,
  handleGetSubscriptionAnalytics,
  handleGetExplorerRoster,
  handleGetTenureBucketRoster,
  handleReconcileAppPayments,
} from '../../controllers/adminRevenueController';
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
// Subscription analytics (MRR/ARR, plan mix, tenure funnel, needs-attention list)
router.get('/api/admin/revenue/subscriptions', requireAdmin, handleGetSubscriptionAnalytics);
// Explorer drill-down roster (behind the tenure funnel's "Explorer" bucket)
router.get('/api/admin/revenue/explorers', requireAdmin, handleGetExplorerRoster);
// Drill-down roster for one tenure bucket (1..5, 5 = "Month 5+")
router.get('/api/admin/revenue/tenure/:month', requireAdmin, handleGetTenureBucketRoster);
// Heal missed-webhook membership payments (app-scoped; our customers only). Idempotent.
router.post('/api/admin/revenue/reconcile', requireAdmin, handleReconcileAppPayments);

// Settings
router.get('/api/admin/settings', requireAdmin, handleGetSettings);
router.patch('/api/admin/settings', requireAdmin, handleUpdateSettings);
router.post('/api/admin/digest/test', requireAdmin, handleSendTestDigest);

export default router;
