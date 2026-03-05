import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { strategyPrepUpload } from '../config/upload';
import {
  handleRequestMagicLink, handleVerifyMagicLink, handleGetProfile,
  handleGetDashboard, handleGetSessions, handleGetSessionDetail,
  handleGetSubmissions, handleCreateSubmission, handleUploadSubmission,
  handleGetProgress,
} from '../controllers/participantController';

const router = Router();

// Public auth endpoints
router.post('/api/portal/request-link', handleRequestMagicLink);
router.get('/api/portal/verify', handleVerifyMagicLink);

// Authenticated participant endpoints
router.get('/api/portal/profile', requireParticipant, handleGetProfile);
router.get('/api/portal/dashboard', requireParticipant, handleGetDashboard);
router.get('/api/portal/sessions', requireParticipant, handleGetSessions);
router.get('/api/portal/sessions/:id', requireParticipant, handleGetSessionDetail);
router.get('/api/portal/submissions', requireParticipant, handleGetSubmissions);
router.post('/api/portal/submissions', requireParticipant, handleCreateSubmission);
router.post('/api/portal/submissions/:id/upload', requireParticipant, strategyPrepUpload.single('file'), handleUploadSubmission);
router.get('/api/portal/progress', requireParticipant, handleGetProgress);

export default router;
