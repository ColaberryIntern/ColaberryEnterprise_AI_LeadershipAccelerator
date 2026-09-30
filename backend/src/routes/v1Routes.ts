import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireServiceToken } from '../middlewares/serviceAuthMiddleware';
import { createExternalLead } from '../controllers/v1LeadController';
import { requestCallback } from '../controllers/v1CallbackController';
import { handleOpenHouseRegister, handleGetOpenHouseEvent } from '../controllers/openHouseController';
import { handleGetSalesKb } from '../controllers/publicKbController';
import { handleGetPublicEventsList } from '../controllers/publicEventsController';
import { lookupEnrollment } from '../controllers/v1EnrollmentLookupController';

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

// Public, unauthenticated, same as the open-house event above. training.colaberry.com
// renders this on an anonymous marketing page, and the listings are already public on
// Eventbrite, so a service token would guard nothing and add a way for the site to break.
router.get('/api/v1/events', v1RateLimiter, handleGetPublicEventsList);
// Phase 2 KB Ops (BC #10036783688): DB-backed sales KB. Public GET, no token —
// frontend/public/knowledge/sales/app.js falls back to its bundled kb-data.js on any failure.
router.get('/api/v1/knowledge/sales', v1RateLimiter, handleGetSalesKb);
// Repo2Reputation login gate: "is this email an Accelerator student" against the live
// enrollment roster, so a partner app never has to fall back to the school database
// for launch students. Service token required; the email is hashed in the log, never written.
router.get('/api/v1/enrollments/lookup', v1RateLimiter, requireServiceToken, lookupEnrollment);

export default router;
