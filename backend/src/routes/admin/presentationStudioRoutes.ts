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

export default router;
