import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { env } from '../../config/env';

/**
 * Instructor controls for the Presentation Studio.
 *
 * Every route is `requireAdmin` — the repo's route-auth lint scans this directory and
 * fails CI on an unguarded admin route, so the guard is enforced rather than remembered.
 *
 * SCOPED BY COHORT, DELIBERATELY. The required template is set per cohort, so an
 * instructor changing it for one cohort cannot touch another, cannot touch an existing
 * card, and cannot move "every legacy curriculum instance globally" — which the build
 * spec explicitly forbids. The change is also NOT retroactive: an assignment a learner
 * has already started keeps the template they have been preparing against.
 *
 * Services are imported dynamically, matching the convention in the sibling routers:
 * they pull in models, and this router must stay importable without initialising the ORM.
 */

const router = Router();

/** Flagged-off features 404 rather than 403 — a feature that is off does not exist. */
function gate(res: Response): boolean {
  if (!env.presentationStudioEnabled) {
    res.status(404).json({ error: 'Presentation Studio not enabled' });
    return false;
  }
  return true;
}

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  return next(err);
}

/** The template menu an instructor chooses from. */
router.get('/api/admin/presentation/templates', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const { listTemplatesForInstructor } = await import('../../services/presentation/presentationInstructorService');
    res.json(listTemplatesForInstructor());
  } catch (e) { fail(res, e, next); }
});

const cohortParam = z.object({ cohortId: z.string().uuid() });

router.get('/api/admin/presentation/cohorts/:cohortId/required-template', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const p = cohortParam.parse(req.params);
    const { getCohortRequiredTemplate } = await import('../../services/presentation/presentationInstructorService');
    res.json(await getCohortRequiredTemplate(p.cohortId));
  } catch (e) { fail(res, e, next); }
});

const setBody = z.object({ template: z.string().trim().min(1).max(80) }).strict();

router.put('/api/admin/presentation/cohorts/:cohortId/required-template', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const p = cohortParam.parse(req.params);
    const b = setBody.parse(req.body || {});
    const { setCohortRequiredTemplate } = await import('../../services/presentation/presentationInstructorService');
    const r = await setCohortRequiredTemplate(p.cohortId, b.template);
    // Refused rather than coerced: silently storing a template that does not exist
    // would leave the whole cohort defaulting somewhere nobody chose.
    if (!r.ok) return res.status(400).json({ error: 'Unknown presentation template' });
    res.json(r.setting);
  } catch (e) { fail(res, e, next); }
});

/**
 * Who has actually started preparing. Counts come from persisted answers — the
 * server-derived `prep_state` and a stored audience — never from a student having
 * opened a page. "Intent" and "progress" are different facts and the spec is explicit
 * that they must not be conflated.
 */
router.get('/api/admin/presentation/cohorts/:cohortId/readiness', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const p = cohortParam.parse(req.params);
    const { cohortReadiness } = await import('../../services/presentation/presentationInstructorService');
    const rows = await cohortReadiness(p.cohortId);
    res.json({
      cohort_id: p.cohortId,
      total: rows.length,
      not_started: rows.filter((r) => r.prepState === 'not_started').length,
      preparing: rows.filter((r) => r.prepState === 'preparing').length,
      ready: rows.filter((r) => r.prepState === 'ready').length,
      with_audience: rows.filter((r) => r.hasAudience).length,
      rows,
    });
  } catch (e) { fail(res, e, next); }
});

/**
 * POINTING A WHOLE COHORT AT ONE LIVE SESSION — two routes, never one.
 *
 * `plan` is a pure read: the service it calls contains no write statement of any
 * kind, so it cannot write however it is called. `commit` is the only writer, and it
 * takes the plan back as INPUT — which makes the plan untrusted on the return trip.
 * The service therefore re-verifies every row's cohort and story against the database
 * and skips anything that no longer matches. The plan decides what to consider, never
 * whether it is allowed.
 *
 * A single `dryRun` flag on one endpoint would be one forgotten `if` away from
 * rebinding forty students' demo slots, which is why this is shaped as two.
 *
 * Neither route completes a task or awards anything. Mapping a student to a room says
 * where they will present, not that they presented.
 */
const planBody = z.object({
  cohort_id: z.string().uuid(),
  story_id: z.string().trim().min(1).max(60),
  booking_id: z.string().uuid(),
}).strict();

router.post('/api/admin/presentation/session-map/plan', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const b = planBody.parse(req.body || {});
    const { planSessionMap } = await import('../../services/presentation/presentationSessionMap');
    res.json(await planSessionMap({ cohortId: b.cohort_id, storyId: b.story_id, bookingId: b.booking_id }));
  } catch (e) { fail(res, e, next); }
});

// The plan is echoed back whole. Shape-checked only — its CONTENTS are re-proved
// against the database by the service, because anything the client returns to us is
// something the client could have invented.
const commitBody = z.object({
  plan: z.object({
    dry_run: z.literal(true),
    bookingId: z.string().uuid(),
    cohortId: z.string().uuid(),
    storyId: z.string().trim().min(1).max(60),
    rows: z.array(z.object({
      assignmentId: z.string().uuid(),
      projectId: z.string().uuid(),
      storyId: z.string().trim().min(1).max(60),
      cohortId: z.string().uuid().nullable(),
      attemptId: z.string().uuid().nullable(),
      currentBookingId: z.string().uuid().nullable(),
      outcome: z.enum(['will_map', 'already_mapped', 'will_remap', 'blocked_no_booking']),
      actions: z.array(z.string()),
      blocked_reason: z.string().nullable(),
    })).max(500),
  }).passthrough(),
}).strict();

router.post('/api/admin/presentation/session-map/commit', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const b = commitBody.parse(req.body || {});
    const actorId = String((req as any).admin?.email || (req as any).admin?.sub || 'admin');
    const { commitSessionMap } = await import('../../services/presentation/presentationSessionMap');
    res.json(await commitSessionMap({ plan: b.plan as any, actorId }));
  } catch (e) { fail(res, e, next); }
});

/**
 * STAFF APPROVE A DEMO, WHICH PUBLISHES IT AND POSTS IT TO THE COHORT FEED.
 *
 * One call because it is one decision: a staff member approving a demo means the
 * cohort may see it. Splitting approval from publication would leave things
 * approved and invisible — a state nobody returns to finish, and which the student
 * experiences as silence.
 *
 * The service re-reads the showcase AFTER recording the approval, so publication is
 * decided on current state rather than on what this request believed when it
 * arrived. Announcing is last and may fail without rolling back a publication; it
 * is idempotent, so a retry posts once.
 */
const approveBody = z.object({
  audience: z.enum(['cohort', 'community']).optional(),
}).strict();

router.post('/api/admin/presentation/showcases/:showcaseId/approve', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const b = approveBody.parse(req.body || {});
    // The identity is who vouched for it. Recorded on the row, never inferred.
    const staffIdentity = String((req as any).admin?.email || (req as any).admin?.sub || 'admin');
    const { approveAndPublish } = await import('../../services/presentation/showcaseLifecycle');
    const r = await approveAndPublish(String(req.params.showcaseId), staffIdentity, b.audience ?? 'cohort');
    if (!r.ok) return res.status(409).json({ error: r.reason });
    res.json({
      showcase_id: r.showcaseId,
      post_id: r.postId,
      already_published: r.alreadyPublished,
      // Said explicitly: published with no post is a real outcome, not a silent
      // half-success, and the operator needs to know which happened.
      posted: Boolean(r.postId),
    });
  } catch (e) { fail(res, e, next); }
});

/**
 * THE REVIEW QUEUE — what is waiting on a staff decision.
 *
 * `listPendingShowcases` was written on 2026-10-18 and had no route, no caller
 * and no tests until this one. The approve endpoint above could act on an id;
 * nothing could tell anybody WHICH ids. A learner flipping a take to Public saw
 * "Waiting for staff approval" and waited indefinitely, because the only way to
 * find their request was to query the database by hand — which is literally how
 * the two demos live in production today were approved.
 */
router.get('/api/admin/presentation/showcases/pending', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const staffIdentity = String((req as any).admin?.email || (req as any).admin?.sub || 'admin');
    const { listPendingShowcases } = await import('../../services/presentation/showcaseReviewQueue');
    const pending = await listPendingShowcases(staffIdentity);
    res.json({ pending, count: pending.length });
  } catch (e) { fail(res, e, next); }
});

/**
 * DECLINE, with a reason the learner can act on.
 *
 * Without this the queue has one button, and refusing means leaving the request
 * to rot — which a learner cannot tell apart from being forgotten.
 */
const declineBody = z.object({
  reason: z.string().min(1).max(2000),
}).strict();

router.post('/api/admin/presentation/showcases/:showcaseId/decline', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    const b = declineBody.parse(req.body || {});
    const staffIdentity = String((req as any).admin?.email || (req as any).admin?.sub || 'admin');
    const { staffDecline } = await import('../../services/presentation/showcaseLifecycle');
    const r = await staffDecline(String(req.params.showcaseId), staffIdentity, b.reason);
    if (!r.ok) return res.status(409).json({ error: r.reason });
    res.json({ showcase_id: String(req.params.showcaseId), declined: true });
  } catch (e) { fail(res, e, next); }
});

/**
 * WATCH THE DEMO BEING REVIEWED.
 *
 * A `<video src>` sends no Authorization header, so `requireAdmin` alone cannot
 * guard a player — the URL has to carry its own authority. The ticket is minted
 * by the queue above: signed, staff-scoped, and half an hour long, which is the
 * length of the job rather than the ten minutes a learner's ticket gets.
 *
 * BOTH GUARDS APPLY. An admin session to GET the queue that mints the ticket,
 * and the ticket to fetch the bytes. Neither alone is enough, and a learner's
 * own ticket fails `isStaffTicket` here even though it is validly signed.
 */
async function serveStaffRecording(req: Request, res: Response, next: NextFunction, want: 'file' | 'thumbnail') {
  try {
    const { verifyRecordingTicket, isStaffTicket } = await import('../../services/presentation/recordingTicket');
    const claims = verifyRecordingTicket(typeof req.query.t === 'string' ? req.query.t : null);
    // Same 404 for every refusal: a distinct code would confirm that a guessed
    // recording id is a real one.
    if (!claims || !isStaffTicket(claims) || claims.recordingId !== String(req.params.recordingId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { resolveStaffRecording } = await import('../../services/presentation/recordingPlayback');
    const r = await resolveStaffRecording(String(req.params.recordingId));
    if (!r.ok) {
      if (r.reason === 'file_missing') {
        return res.status(409).json({ error: 'The recording row exists but the video file is not on disk.' });
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const fs = await import('fs');

    if (want === 'thumbnail') {
      const { ensureThumbnail } = await import('../../services/presentation/recordingThumbnail');
      const poster = await ensureThumbnail(
        r.recording.recordingId, r.recording.filePath, r.recording.durationSeconds,
      );
      // A camera-off take has no frame worth showing. The card falls back to a
      // poster-less player; nothing about review should break over a picture.
      if (!poster) return res.status(404).json({ error: 'No thumbnail' });
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, no-store');
      return fs.createReadStream(poster.path).pipe(res);
    }

    const { filePath, sizeBytes, mimeType, downloadName } = r.recording;
    const { parseRange, contentRangeHeader, rangeLength } = await import('../../services/presentation/byteRange');
    const outcome = parseRange(req.headers.range, sizeBytes);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);

    if (outcome.kind === 'unsatisfiable') {
      res.setHeader('Content-Range', `bytes */${sizeBytes}`);
      return res.status(416).end();
    }
    if (outcome.kind === 'partial') {
      const { range } = outcome;
      res.status(206);
      res.setHeader('Content-Range', contentRangeHeader(range, sizeBytes));
      res.setHeader('Content-Length', String(rangeLength(range)));
      return fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    }

    res.setHeader('Content-Length', String(sizeBytes));
    return fs.createReadStream(filePath).pipe(res);
  } catch (e) { fail(res, e, next); }
}

// The flag check stays on each ROUTE rather than inside the shared helper, because
// the suite next door asserts one `gate(res)` per registration — an invariant that
// would quietly stop meaning anything the first time a route delegated its gate
// to somewhere the per-route count could not see.
router.get('/api/admin/presentation/recordings/:recordingId/file', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  void serveStaffRecording(req, res, next, 'file');
});

router.get('/api/admin/presentation/recordings/:recordingId/thumbnail', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  void serveStaffRecording(req, res, next, 'thumbnail');
});

export default router;
