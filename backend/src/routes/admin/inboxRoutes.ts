import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetDecisions,
  handleGetDecisionDetail,
  handleReclassify,
  handleBatchReclassify,
  handleGetDrafts,
  handleApproveDraft,
  handleRejectDraft,
  handleGetRules,
  handleCreateRule,
  handleUpdateRule,
  handleDeleteRule,
  handleGetVips,
  handleCreateVip,
  handleUpdateVip,
  handleDeleteVip,
  handleGetLearningInsights,
  handleGetAuditLogs,
  handleGetStats,
  handleDigestAction,
} from '../../controllers/inboxController';

const router = Router();

// Dashboard stats
router.get('/api/admin/inbox/stats', requireAdmin, handleGetStats);

// Decisions queue (Silent Hold + all classifications)
router.get('/api/admin/inbox/decisions', requireAdmin, handleGetDecisions);
router.get('/api/admin/inbox/decisions/:emailId', requireAdmin, handleGetDecisionDetail);
router.patch('/api/admin/inbox/decisions/:emailId/reclassify', requireAdmin, handleReclassify);
router.post('/api/admin/inbox/decisions/batch', requireAdmin, handleBatchReclassify);

// Draft approval queue
router.get('/api/admin/inbox/drafts', requireAdmin, handleGetDrafts);
router.post('/api/admin/inbox/drafts/:draftId/approve', requireAdmin, handleApproveDraft);
router.post('/api/admin/inbox/drafts/:draftId/reject', requireAdmin, handleRejectDraft);

// Rule builder
router.get('/api/admin/inbox/rules', requireAdmin, handleGetRules);
router.post('/api/admin/inbox/rules', requireAdmin, handleCreateRule);
router.patch('/api/admin/inbox/rules/:ruleId', requireAdmin, handleUpdateRule);
router.delete('/api/admin/inbox/rules/:ruleId', requireAdmin, handleDeleteRule);

// VIP manager
router.get('/api/admin/inbox/vips', requireAdmin, handleGetVips);
router.post('/api/admin/inbox/vips', requireAdmin, handleCreateVip);
router.patch('/api/admin/inbox/vips/:vipId', requireAdmin, handleUpdateVip);
router.delete('/api/admin/inbox/vips/:vipId', requireAdmin, handleDeleteVip);

// Learning insights
router.get('/api/admin/inbox/learning', requireAdmin, handleGetLearningInsights);

// Audit log
router.get('/api/admin/inbox/audit', requireAdmin, handleGetAuditLogs);

// Digest action (stateless JWT — no admin auth required)
router.get('/api/admin/inbox/digest-action', handleDigestAction);

export default router;
