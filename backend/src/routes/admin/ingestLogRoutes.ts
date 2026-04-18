import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { listIngestLogs, getIngestLog } from '../../controllers/adminLeadSourceController';
import { getIngestStats } from '../../controllers/ingestStatsController';

const router = Router();

router.get('/api/admin/ingest-logs', requireAdmin, listIngestLogs);
router.get('/api/admin/ingest-logs/:id', requireAdmin, getIngestLog);
router.get('/api/admin/dashboard/ingest-stats', requireAdmin, getIngestStats);

export default router;
