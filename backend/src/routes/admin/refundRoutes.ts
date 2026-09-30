import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleListRefunds, handleLookupPayment, handleCreateRefund } from '../../controllers/adminRefundController';

const router = Router();

router.get('/api/admin/refunds', requireAdmin, handleListRefunds);
router.get('/api/admin/refunds/lookup', requireAdmin, handleLookupPayment);
router.post('/api/admin/refunds', requireAdmin, handleCreateRefund);

export default router;
