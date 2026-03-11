import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitLead } from '../controllers/leadController';
import { requestSponsorshipKit } from '../controllers/sponsorshipController';

const leadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a few minutes.' },
});

const router = Router();

router.post('/api/leads', leadRateLimiter, submitLead);
router.post('/api/sponsorship-kit-request', leadRateLimiter, requestSponsorshipKit);

export default router;
