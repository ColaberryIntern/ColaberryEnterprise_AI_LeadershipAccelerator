import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireServiceClient } from '../middlewares/serviceAuthMiddleware';
import { createExternalLead } from '../controllers/v1LeadController';
import { requestCallback } from '../controllers/v1CallbackController';
import { handleOpenHouseRegister, handleGetOpenHouseEvent, handlePublicOpenHouseSignup } from '../controllers/openHouseController';
import { handleGetSalesKb } from '../controllers/publicKbController';
import { handleGetPublicEventsList } from '../controllers/publicEventsController';
import { lookupEnrollment } from '../controllers/v1EnrollmentLookupController';
import { getOutreachFeed } from '../controllers/v1OutreachController';

// Generous limit: 300 req/min absorbs bursty training-site traffic while blocking abuse.
const v1RateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});

/**
 * A much tighter limit for the one PUBLIC route here that WRITES.
 *
 * The 300/min above is sized for a trusted server's bursty traffic. This route
 * takes an anonymous request and creates an account, sends a real email through
 * Mandrill and writes an attendee row, so the same allowance would let one IP
 * mint 300 accounts and 300 emails a minute - a way to burn the sending domain's
 * reputation as much as to fill a table. Five signups per quarter-hour from one
 * address is already far more than a human funnel produces, and matches the
 * posture `leadRateLimiter` takes on the public lead routes.
 *
 * Note the limit is per IP and therefore not a defense against a distributed
 * attempt; the idempotency on email address is what makes a repeat harmless.
 */
const openHouseSignupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signups from this address. Please try again shortly.' },
});

const router = Router();

router.post('/api/v1/leads', v1RateLimiter, requireServiceClient('enterprise_crm'), createExternalLead);
// Inbound "call me now" — training.colaberry.com triggers a Synthflow outbound call.
router.post('/api/v1/request-callback', v1RateLimiter, requireServiceClient('enterprise_crm'), requestCallback);
// Open House signup (training.colaberry.com -> creates an Explorer account + login link)
router.post('/api/v1/open-house/register', v1RateLimiter, requireServiceClient('enterprise_crm'), handleOpenHouseRegister);
// Open House event details for the marketing card (public, cached; no token needed for this GET)
router.get('/api/v1/open-house/event', v1RateLimiter, handleGetOpenHouseEvent);
// OH-2: the PUBLIC Open House signup, for our own landing-page funnel. One request
// puts the person on our attendee list, creates their Explorer account and emails a
// login link. Unauthenticated by necessity - the caller is a stranger's browser, not
// a service - so it carries its own strict limiter rather than the generous one above.
router.post('/api/v1/open-house/signup', openHouseSignupLimiter, handlePublicOpenHouseSignup);

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
router.get('/api/v1/enrollments/lookup', v1RateLimiter, requireServiceClient('enterprise_crm'), lookupEnrollment);
// The Explorer call queue, for Cora's nightly GoHighLevel tagging job.
// Same ranking as /api/admin/explorer-growth/outreach, which a machine cannot call because that
// one takes a four-hour session JWT. The payload here is an ALLOWLIST and deliberately carries
// no email and no name: Cora joins on ghl_url, so the personal data never crosses the boundary.
//
// SCOPED TO 'cora' ALONE, and deliberately NOT to 'enterprise_crm'. This read does not belong
// to the credential that opens the three writes above, and Cora has no business holding one
// that does. Until CORA_SERVICE_TOKEN is set on the host this route answers 401 to everybody,
// which is the correct state for a route whose only consumer has not been provisioned.
router.get('/api/v1/explorer-growth/outreach', v1RateLimiter, requireServiceClient('cora'), getOutreachFeed);

export default router;
