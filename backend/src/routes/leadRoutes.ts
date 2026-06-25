import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitLead } from '../controllers/leadController';
import { requestSponsorshipKit } from '../controllers/sponsorshipController';
import { handleLeadIngest } from '../controllers/leadIngestionController';
import { handleSalesHubCory } from '../controllers/salesHubCoryController';

const leadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a few minutes.' },
});

// Ingest endpoint is server-to-server friendly — a per-IP cap of 60/min
// absorbs bursty site traffic while blocking obvious abuse. Per-source
// tuning is tracked by `lead_sources.rate_limit` (future middleware).
const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ingest rate limit exceeded' },
});

const router = Router();

// Sales-hub Cory RAG endpoint. Registered here (an early, public router) on
// purpose: on the deployed server, routers mounted after leadRoutes sit behind
// a broad auth guard, so a public endpoint must be reachable before them.
const coryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});

router.post('/api/leads', leadRateLimiter, submitLead);
router.post('/api/sponsorship-kit-request', leadRateLimiter, requestSponsorshipKit);
router.post('/api/leads/ingest', ingestRateLimiter, handleLeadIngest);
router.post('/api/sales-hub/cory', coryLimiter, handleSalesHubCory);

export default router;
