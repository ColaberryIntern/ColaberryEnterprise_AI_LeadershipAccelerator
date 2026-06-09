import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireServiceToken } from '../middlewares/serviceAuthMiddleware';
import { createExternalLead } from '../controllers/v1LeadController';

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

export default router;
