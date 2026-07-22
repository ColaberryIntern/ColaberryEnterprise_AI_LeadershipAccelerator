import { Request, Response, NextFunction } from 'express';
import {
  requestMagicLink, verifyMagicLink, getParticipantProfile,
  getParticipantDashboard, getParticipantSessions, getParticipantSessionDetail,
  getParticipantSubmissions, createParticipantSubmission, uploadParticipantSubmission,
  getParticipantProgress, getNextLiveSession,
} from '../services/participantService';
import { joinLiveSession } from '../services/liveSessionAttendanceService';
import { createFreeAccount } from '../services/freeSignupService';
import { getPointsSummary } from '../services/pointsService';
import { getBandForEnrollment } from '../services/progression/progressionService';
import { env } from '../config/env';
import { getStreak, claimStreak } from '../services/streakService';
import { getPointsDrilldown } from '../services/pointsDrilldownService';
import { getSubscription, startCheckout, cancelSubscription, confirmCheckout } from '../services/subscriptionService';
import { getEnrollmentView, selectCohort, SelectCohortReason } from '../services/portalEnrollmentService';
import { z } from 'zod';
import type { SubscriptionPlan } from '../models/Subscription';
import { getOnboardingSchedule, rsvpToOpenHouse } from '../services/openHouseService';
import { isFreePreviewTier } from '../services/access/contentEntitlement';
import { getUpcomingPublicEvents } from '../services/publicEventsService';
import { ingestBackground, getOnboardingProfile } from '../services/resumeIngestService';
import { getCheckinInfo } from '../services/sessionKitService';

// PUBLIC (no auth): minimal, non-sensitive info for the pre-login check-in
// landing page a student reaches by scanning the Class Kit QR. Shows which
// class they are about to check in to; the meeting link is NOT returned here
// (revealed only after login + check-in). 404 if the session does not exist.
export async function handleGetCheckinInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const info = await getCheckinInfo(req.params.id as string);
    if (!info) return res.status(404).json({ error: 'Session not found' });
    res.json(info);
  } catch (err) { next(err); }
}

export async function handleIngestBackground(req: Request, res: Response, next: NextFunction) {
  try {
    const { resume_text, linkedin_url } = req.body || {};
    const result = await ingestBackground(req.participant!.sub, {
      resumeText: typeof resume_text === 'string' ? resume_text : undefined,
      linkedinUrl: typeof linkedin_url === 'string' ? linkedin_url : undefined,
    });
    if (!result.ok) return res.status(400).json({ error: 'Provide resume_text and/or linkedin_url' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetOnboardingProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getOnboardingProfile(req.participant!.sub);
    res.json(profile);
  } catch (err) { next(err); }
}

export async function handleGetPoints(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollmentId = req.participant!.sub;
    const summary = await getPointsSummary(enrollmentId);
    // Additive: attach the canonical 5-band identity + the runtime UI flag so the
    // HUD can switch to the band ladder without a rebuild. Existing fields (total,
    // events) are untouched; unknown fields are ignored by legacy clients, and the
    // frontend only reads `band` when `fiveBandUiEnabled` is true.
    const band = await getBandForEnrollment(enrollmentId, summary.total);
    res.json({ ...summary, band, fiveBandUiEnabled: env.fiveBandUiEnabled });
  } catch (err) { next(err); }
}

export async function handleGetPointsDrilldown(req: Request, res: Response, next: NextFunction) {
  try {
    const drilldown = await getPointsDrilldown(req.participant!.sub);
    res.json(drilldown);
  } catch (err) { next(err); }
}

export async function handleGetSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const view = await getSubscription(req.participant!.sub);
    res.json(view);
  } catch (err) { next(err); }
}

export async function handleStartSubscriptionCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = String(req.body?.plan || '') as SubscriptionPlan;
    if (plan !== 'annual' && plan !== 'monthly') {
      return res.status(400).json({ error: 'plan must be "annual" or "monthly"' });
    }
    const result = await startCheckout(req.participant!.sub, plan);
    if (result.ok) return res.json({ payment_link: result.payment_link, plan: result.plan, amount: result.amount, full_amount: result.full_amount, applied_credit: result.applied_credit });
    const status = result.reason === 'billing_unconfigured' ? 503
      : result.reason === 'enrollment_not_found' ? 404
      : result.reason === 'unknown_plan' ? 400 : 502;
    return res.status(status).json({ error: result.reason, message: result.message });
  } catch (err) { next(err); }
}

export async function handleConfirmCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await confirmCheckout(req.participant!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleCancelSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ error: 'A cancellation reason is required' });
    const result = await cancelSubscription(req.participant!.sub, reason);
    if (!result.ok) return res.status(409).json({ error: result.reason });
    res.json(result);
  } catch (err) { next(err); }
}

// ─── Enrollment (class-date selection) — enrolling reserves a spot; paying locks it ───

const SelectCohortSchema = z.object({ cohort_id: z.string().uuid('cohort_id must be a UUID') });

const SELECT_COHORT_STATUS: Record<SelectCohortReason, number> = {
  enrollment_not_found: 404,
  cohort_not_found: 404,
  cohort_closed: 400,
  cohort_not_selectable: 400,
  cohort_started: 400,
  locked_after_payment: 409,
};

export async function handleGetEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const view = await getEnrollmentView(req.participant!.sub);
    if (!view) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(view);
  } catch (err) { next(err); }
}

export async function handleSelectEnrollmentCohort(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = SelectCohortSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'cohort_id is required' });
    }
    const result = await selectCohort(req.participant!.sub, parsed.data.cohort_id);
    if (!result.ok) return res.status(SELECT_COHORT_STATUS[result.reason]).json({ error: result.reason });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetStreak(req: Request, res: Response, next: NextFunction) {
  try {
    const streak = await getStreak(req.participant!.sub);
    res.json(streak);
  } catch (err) { next(err); }
}

export async function handleClaimStreak(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await claimStreak(req.participant!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetOnboardingSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const schedule = await getOnboardingSchedule(req.participant!.sub);
    // Free-preview status drives the enroll/pay conversion funnel on the portal
    // (Today). Single source of truth = contentEntitlement.isFreePreviewTier
    // (payment-keyed when CONTENT_PAID_GATE_ENABLED, else legacy explorer-only).
    res.json({ ...schedule, is_explorer: await isFreePreviewTier(req.participant!.sub) });
  } catch (err) { next(err); }
}

export async function handleGetPublicEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = parseInt(String(req.query.days ?? ''), 10);
    const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, raw)) : 30;
    const events = await getUpcomingPublicEvents(days);
    res.json({ events, window_days: days });
  } catch (err) { next(err); }
}

export async function handleRsvpOpenHouse(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await rsvpToOpenHouse(req.participant!.sub, String(req.params.id));
    if (!result.ok) return res.status(404).json({ error: 'Open house not found' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleFreeSignup(req: Request, res: Response, next: NextFunction) {
  try {
    const { full_name, email } = req.body || {};
    if (!full_name || !email || typeof email !== 'string') {
      return res.status(400).json({ error: 'full_name and email are required' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    const result = await createFreeAccount({ full_name: String(full_name), email });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) { next(err); }
}

export async function handleRequestMagicLink(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const result = await requestMagicLink(email);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleVerifyMagicLink(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    const result = await verifyMagicLink(token);
    if (!result) return res.status(401).json({ error: 'Invalid or expired link. Please request a new one.' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getParticipantProfile(req.participant!.sub);
    if (!profile) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ profile });
  } catch (err) { next(err); }
}

export async function handleGetDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getParticipantDashboard(req.participant!.sub);
    if (!dashboard) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(dashboard);
  } catch (err) { next(err); }
}

export async function handleGetSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await getParticipantSessions(req.participant!.sub, req.participant!.cohort_id);
    res.json({ sessions });
  } catch (err) { next(err); }
}

// Lean payload for the Today "Next live class" card (live_sessions-backed).
export async function handleGetNextSession(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getNextLiveSession(req.participant!.cohort_id);
    res.json(result);
  } catch (err) { next(err); }
}

// Student joined a live session — record attendance + award credit once.
export async function handleJoinSession(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await joinLiveSession(
      req.participant!.sub, req.params.id as string, req.participant!.cohort_id
    );
    if (!result) return res.status(404).json({ error: 'Session not found or not joinable' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetSessionDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const detail = await getParticipantSessionDetail(
      req.participant!.sub, req.params.id as string, req.participant!.cohort_id
    );
    if (!detail) return res.status(404).json({ error: 'Session not found' });
    res.json(detail);
  } catch (err) { next(err); }
}

export async function handleGetSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const submissions = await getParticipantSubmissions(req.participant!.sub);
    res.json({ submissions });
  } catch (err) { next(err); }
}

export async function handleCreateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const submission = await createParticipantSubmission(req.participant!.sub, req.body);
    res.status(201).json({ submission });
  } catch (err) { next(err); }
}

export async function handleUploadSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const submission = await uploadParticipantSubmission(
      req.participant!.sub, req.params.id as string, file
    );
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (err) { next(err); }
}

export async function handleGetProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const progress = await getParticipantProgress(req.participant!.sub);
    if (!progress) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(progress);
  } catch (err) { next(err); }
}
