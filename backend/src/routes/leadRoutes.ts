import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitLead } from '../controllers/leadController';
import { requestSponsorshipKit } from '../controllers/sponsorshipController';
import { handleLeadIngest } from '../controllers/leadIngestionController';
import { handleFlotationPreview } from '../controllers/flotationPreviewController';
import { handleFlotationInterview } from '../controllers/flotationInterviewController';
import {
  handleCreateEnterpriseIntake,
  handleEnterpriseInterviewTurn,
  handleEnterpriseIntakeCall,
  handleEnterpriseIntakeStatus,
} from '../controllers/enterpriseIntakeController';
import { handleFlotationApp } from '../controllers/flotationAppController';
import { handleScholarshipInterview } from '../controllers/scholarshipInterviewController';
import { handleSalesHubCory } from '../controllers/salesHubCoryController';
import {
  handleSponsorInquiry,
  handleRequestSponsorLink,
  handleVerifySponsorToken,
} from '../controllers/sponsorController';
import {
  handleGetLeaderboard,
  handleGetSponsorDashboard,
} from '../controllers/challengeController';
import { handleClientStatus, handleRequestClientLink } from '../controllers/enterpriseClientController';
import { handleBookMeeting, handleInterviewPlan, handleMeetingSlots, handleUploadClientFile } from '../controllers/enterpriseIntakeScheduleController';

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

/**
 * The prospect polls this while their call is still running, so it is allowed to be chatty -
 * but it reads by unguessable id, and a scraper walking ids would be doing so one guess at a
 * time against a v4 UUID space. The cap is here to bound cost, not to stop enumeration;
 * enumeration is stopped by the id itself and by every wrong answer looking identical.
 */
const previewRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Preview rate limit exceeded' },
});

/**
 * v2 intake planning (interview plan, meeting, file uploads). One client legitimately makes
 * up to ~8 of these in a visit (plan, a re-pick, the booking, five files), which the form's
 * 5-per-15-minutes limit would cut off mid-flow. Abuse stays bounded per intake anyway: one
 * booking and five files at most.
 */
const intakePlanRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

const interviewRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Interview rate limit exceeded' },
});

// W32: client sign-in links. Its own budget, so a prospect who just booked and asked for a call
// (both on leadRateLimiter) can still ask for a link; small, because each one sends an email.
const clientLinkRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many link requests. Please try again in a few minutes.' },
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
// Door B "Sponsor Your Team" inquiry — public, must stay on leadRoutes (mounted
// before the auth guard). Reuses the lead rate limiter.
router.post('/api/sponsor-inquiry', leadRateLimiter, handleSponsorInquiry);
// Phone stays OPTIONAL here on purpose (PH1, 2026-11-19): external sources post to ingest and FormDefinition.required_fields governs them; requiring it would break their leads.
router.post('/api/leads/ingest', ingestRateLimiter, handleLeadIngest);
router.get('/api/flotation/preview/:token', previewRateLimiter, handleFlotationPreview);
/**
 * The interview is a MODEL CALL per message, so it is rate limited harder than the preview
 * read. Twenty a minute is a fast conversation and a cheap ceiling; the interview service
 * caps the exchanges within one conversation separately.
 */
router.post('/api/flotation/interview', interviewRateLimiter, handleFlotationInterview);

// W28: the Enterprise intake, from "Book a demo pilot". Public, so registered here with the
// other early public routers. The form shares the lead form's limit; the interview its own.
router.post('/api/enterprise/intake', leadRateLimiter, handleCreateEnterpriseIntake);
router.get('/api/enterprise/intake/:token', interviewRateLimiter, handleEnterpriseIntakeStatus);
router.post('/api/enterprise/intake/:token/interview', interviewRateLimiter, handleEnterpriseInterviewTurn);
router.post('/api/enterprise/intake/:token/call', leadRateLimiter, handleEnterpriseIntakeCall);
// v2 (2026-11-21): the client plans the AI interview (now or later) and books the meeting with
// Ali in the same visit. Slots is a calendar read, so it shares the interview limiter; the
// writes have their own (intakePlanRateLimiter).
router.get('/api/enterprise/intake/:token/slots', interviewRateLimiter, handleMeetingSlots);
router.post('/api/enterprise/intake/:token/interview-plan', intakePlanRateLimiter, handleInterviewPlan);
router.post('/api/enterprise/intake/:token/meeting', intakePlanRateLimiter, handleBookMeeting);
// Their own research, one file per request (nginx raises only this exact path to 26m).
router.post('/api/enterprise/intake/:token/files', intakePlanRateLimiter, handleUploadClientFile);
// W32: the client's own view of their pilot, by emailed sign-in link.
router.post('/api/enterprise/client/request-link', clientLinkRateLimiter, handleRequestClientLink);
router.get('/api/enterprise/client/status', interviewRateLimiter, handleClientStatus);

// The OpportunityLift written interview. Same shape and the same limiter as the
// flotation one above: keyed on the `raw_payload_id` the ingest form returned, one
// model call per turn, so the abuse profile is identical and there is no reason to
// give it a looser budget.
router.post('/api/cpn/scholarship-interview', interviewRateLimiter, handleScholarshipInterview);
/**
 * A generated concept, rendered on its own for a phone. Shares the preview limiter: it is a
 * read of something already produced, and a prospect passing their phone round a table will
 * legitimately load it several times.
 */
router.get('/api/flotation/app/:token/:key', previewRateLimiter, handleFlotationApp);
router.post('/api/sales-hub/cory', coryLimiter, handleSalesHubCory);

// One Class, Many Doors — read-only Challenge leaderboard + Sponsor dashboard.
// Registered here (an early, public router) on purpose: routers mounted after
// leadRoutes sit behind a broad auth guard on the deployed server, so these
// public read surfaces must be reachable before them. The dashboard enforces a
// per-sponsor access token in its controller (real-auth follow-up documented
// there); the leaderboard is fully public.
router.get('/api/challenge/leaderboard', handleGetLeaderboard);
router.get('/api/sponsor/dashboard', handleGetSponsorDashboard);

// Sponsor portal login (magic-link, replaces the sponsor.id-as-token stopgap
// above). Rate-limited like the other public lead-adjacent endpoints.
router.post('/api/sponsor/request-link', leadRateLimiter, handleRequestSponsorLink);
router.get('/api/sponsor/verify', handleVerifySponsorToken);

export default router;
