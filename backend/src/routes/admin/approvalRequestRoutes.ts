import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListApprovalRequests,
  handleApproveApprovalRequest,
  handleRejectApprovalRequest,
  handleBulkApproveApprovalRequests,
} from '../../controllers/approvalRequestController';

// Real-enforcement scoping, Phase 1 slice 1 (2026-09-13) — the first real
// admin surface over ApprovalRequest (backend/src/models/ApprovalRequest.ts).
// Global, not agent-scoped (unlike managerInboxRoutes.ts) — one queue across
// every agent's held decisions, same requireAdmin gate as settingsRoutes.ts.
const router = Router();

router.get('/api/admin/approval-requests', requireAdmin, handleListApprovalRequests);
router.post('/api/admin/approval-requests/:id/approve', requireAdmin, handleApproveApprovalRequest);
router.post('/api/admin/approval-requests/:id/reject', requireAdmin, handleRejectApprovalRequest);
router.post('/api/admin/approval-requests/bulk-approve', requireAdmin, handleBulkApproveApprovalRequests);

export default router;
