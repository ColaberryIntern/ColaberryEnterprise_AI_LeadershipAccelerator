import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetAdmissionsStats,
  handleGetAdmissionsConversations,
  handleGetKnowledge,
  handleCreateKnowledge,
  handleUpdateKnowledge,
  handleGetOperationsStats,
  handleGetCallbacks,
  handleGetCallLog,
  handleGetDocuments,
} from '../../controllers/admissionsController';

const router = Router();

router.get('/api/admin/admissions/stats', requireAdmin, handleGetAdmissionsStats);
router.get('/api/admin/admissions/conversations', requireAdmin, handleGetAdmissionsConversations);
router.get('/api/admin/admissions/knowledge', requireAdmin, handleGetKnowledge);
router.post('/api/admin/admissions/knowledge', requireAdmin, handleCreateKnowledge);
router.put('/api/admin/admissions/knowledge/:id', requireAdmin, handleUpdateKnowledge);
router.get('/api/admin/admissions/operations', requireAdmin, handleGetOperationsStats);
router.get('/api/admin/admissions/callbacks', requireAdmin, handleGetCallbacks);
router.get('/api/admin/admissions/call-log', requireAdmin, handleGetCallLog);
router.get('/api/admin/admissions/documents', requireAdmin, handleGetDocuments);

export default router;
