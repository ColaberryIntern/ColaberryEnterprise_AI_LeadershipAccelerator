import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireServiceToken } from '../middlewares/serviceAuthMiddleware';
import { createExternalLead } from '../controllers/v1LeadController';
import { handleOpenHouseRegister, handleGetOpenHouseEvent } from '../controllers/openHouseController';
import { handleGetSalesKb } from '../controllers/publicKbController';

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
// Open House signup (training.colaberry.com -> creates an Explorer account + login link)
router.post('/api/v1/open-house/register', v1RateLimiter, requireServiceToken, handleOpenHouseRegister);
// Open House event details for the marketing card (public, cached; no token needed for this GET)
router.get('/api/v1/open-house/event', v1RateLimiter, handleGetOpenHouseEvent);
// Phase 2 KB Ops (BC #10036783688): DB-backed sales KB. Public GET, no token —
// frontend/public/knowledge/sales/app.js falls back to its bundled kb-data.js on any failure.
router.get('/api/v1/knowledge/sales', v1RateLimiter, handleGetSalesKb);

export default router;
