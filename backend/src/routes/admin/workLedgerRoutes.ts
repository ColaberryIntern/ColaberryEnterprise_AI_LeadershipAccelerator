import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getWorkLedgerHealthStats } from '../../controllers/workLedgerHealthController';

const router = Router();

router.get('/api/admin/dashboard/work-ledger-health', requireAdmin, getWorkLedgerHealthStats);

export default router;
