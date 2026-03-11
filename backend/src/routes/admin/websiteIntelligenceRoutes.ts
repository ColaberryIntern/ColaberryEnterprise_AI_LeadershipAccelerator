import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetIssues,
  handleGetIssueDetail,
  handleUpdateIssue,
  handleGetSummary,
  handleTriggerScan,
} from '../../controllers/websiteIntelligenceController';

const router = Router();

router.get('/api/admin/website-intelligence/summary', requireAdmin, handleGetSummary);
router.get('/api/admin/website-intelligence/issues', requireAdmin, handleGetIssues);
router.get('/api/admin/website-intelligence/issues/:id', requireAdmin, handleGetIssueDetail);
router.patch('/api/admin/website-intelligence/issues/:id', requireAdmin, handleUpdateIssue);
router.post('/api/admin/website-intelligence/scan', requireAdmin, handleTriggerScan);

export default router;
