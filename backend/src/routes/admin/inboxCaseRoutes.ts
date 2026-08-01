import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleDiscoverCase,
  handleListCases,
  handleGetCase,
  handleUpdateCaseItem,
  handleQuickResolveItem,
  handleAssessCase,
  handleGetCaseAudit,
  handleCaseStats,
} from '../../controllers/inboxCaseController';
import {
  handleAnswerQuestion,
  handleGeneratePlan,
  handleApproveAction,
  handleRejectAction,
  handleApproveLowRiskActions,
  handleOverrideActions,
  handleExecuteCase,
  handleVerifyCase,
  handleCloseCase,
  handleReopenCase,
  handleSyncNow,
} from '../../controllers/inboxCaseActionController';

// Mounted under the SAME /api/admin/inbox prefix as the existing Inbox COS
// routes (see routes/adminRoutes.ts), so it inherits the same two-layer
// admin gate: requireSection('inbox_content') at the router-mount level,
// then requireAdmin per-route here — no second RBAC gate is introduced.

const router = Router();

router.post('/api/admin/inbox/cases/discover', requireAdmin, handleDiscoverCase);
router.post('/api/admin/inbox/cases/sync-now', requireAdmin, handleSyncNow);
router.get('/api/admin/inbox/cases', requireAdmin, handleListCases);
router.get('/api/admin/inbox/case-stats', requireAdmin, handleCaseStats);
router.get('/api/admin/inbox/cases/:caseId', requireAdmin, handleGetCase);
router.post('/api/admin/inbox/cases/:caseId/assess', requireAdmin, handleAssessCase);
router.patch('/api/admin/inbox/cases/:caseId/items/:itemId', requireAdmin, handleUpdateCaseItem);
router.post('/api/admin/inbox/cases/:caseId/items/:itemId/quick-resolve', requireAdmin, handleQuickResolveItem);
router.get('/api/admin/inbox/cases/:caseId/audit', requireAdmin, handleGetCaseAudit);

router.post('/api/admin/inbox/cases/:caseId/questions/:questionId/answer', requireAdmin, handleAnswerQuestion);
router.post('/api/admin/inbox/cases/:caseId/plan', requireAdmin, handleGeneratePlan);
router.post('/api/admin/inbox/cases/:caseId/actions/:actionId/approve', requireAdmin, handleApproveAction);
router.post('/api/admin/inbox/cases/:caseId/actions/:actionId/reject', requireAdmin, handleRejectAction);
router.post('/api/admin/inbox/cases/:caseId/actions/approve-low-risk', requireAdmin, handleApproveLowRiskActions);
router.post('/api/admin/inbox/cases/:caseId/actions/override', requireAdmin, handleOverrideActions);
router.post('/api/admin/inbox/cases/:caseId/execute', requireAdmin, handleExecuteCase);
router.post('/api/admin/inbox/cases/:caseId/verify', requireAdmin, handleVerifyCase);
router.post('/api/admin/inbox/cases/:caseId/close', requireAdmin, handleCloseCase);
router.post('/api/admin/inbox/cases/:caseId/reopen', requireAdmin, handleReopenCase);

export default router;
