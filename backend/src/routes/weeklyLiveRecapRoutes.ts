import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireFullAdmin } from '../middlewares/authMiddleware';
import {
  handleGetRecap, handlePutRecap, handleDraftRecap, handleSendRecap, handlePublicRecap, handleRecapOptOut,
} from '../controllers/weeklyLiveRecapController';

/**
 * Weekly Live recap (Basecamp WL1). Admin: read, edit, AI draft, send (dry, test, send).
 * Public: the personal recap page data and the one-click opt-out, both rate limited per IP.
 */
const router = Router();

const publicLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.get('/api/admin/live/sessions/:id/recap', requireFullAdmin, handleGetRecap);
router.put('/api/admin/live/sessions/:id/recap', requireFullAdmin, handlePutRecap);
router.post('/api/admin/live/sessions/:id/recap/draft', requireFullAdmin, handleDraftRecap);
router.post('/api/admin/live/sessions/:id/recap/send', requireFullAdmin, handleSendRecap);

router.get('/api/live/recap/unsubscribe', publicLimiter, handleRecapOptOut);
router.get('/api/live/recap/:id', publicLimiter, handlePublicRecap);

export default router;
