import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireServiceToken } from '../middlewares/serviceAuthMiddleware';
import { createExternalLead } from '../controllers/v1LeadController';
import { requestCallback } from '../controllers/v1CallbackController';
import { handleOpenHouseRegister, handleGetOpenHouseEvent } from '../controllers/openHouseController';

// Generous limit: 300 req/min absorbs bursty training-site traffic while blocking abuse.
const v1RateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});

const router = Router();

router.post('/api/v1/leads', v1RateLimiter, requireServiceToken, createExternalLead);
// Inbound "call me now" — training.colaberry.com triggers a Synthflow outbound call.
router.post('/api/v1/request-callback', v1RateLimiter, requireServiceToken, requestCallback);
// Open House signup (training.colaberry.com -> creates an Explorer account + login link)
router.post('/api/v1/open-house/register', v1RateLimiter, requireServiceToken, handleOpenHouseRegister);
// Open House event details for the marketing card (public, cached; no token needed for this GET)
router.get('/api/v1/open-house/event', v1RateLimiter, handleGetOpenHouseEvent);

export default router;
