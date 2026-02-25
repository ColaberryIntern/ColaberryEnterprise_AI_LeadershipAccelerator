import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitLead } from '../controllers/leadController';

const leadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a few minutes.' },
});

const router = Router();

router.post('/api/leads', leadRateLimiter, submitLead);

export default router;
