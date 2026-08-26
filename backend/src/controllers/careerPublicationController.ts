/**
 * careerPublicationController — the review gate on the Capstone Record.
 *
 * CONVERGENCE, 2026-08-25. This controller previously drove a second public portfolio at
 * /talent/:slug. That surface is gone: the Capstone Record at /p/:slug shipped first, is
 * live, and had already solved the snapshot half. What remains here is the half it
 * lacked — a human approval before anything publishes, scoped so a mentor only reviews
 * the learners they are over.
 *
 * Three audiences, three authorization stories, deliberately separate handlers:
 *
 *   LEARNER   asks for review, and controls their own visibility  (req.participant.sub)
 *   REVIEWER  admin sees everyone, mentor sees only their learners (requireCareerReviewer)
 *   PUBLIC    reads the frozen record at /api/public/capstone/:slug (owned by Capstone,
 *             untouched by this file)
 */
import { Request, Response, NextFunction } from 'express';
import {
  requestCapstoneReview,
  recordCapstoneDecision,
  listCapstoneReviewQueue,
  getReviewState,
  setVisibility,
  getRecordForReview,
} from '../services/career/capstoneReviewService';
import { reviewerKind, type ReviewerIdentity } from '../services/career/careerMentorScopeService';

/** The learner is ALWAYS the caller. No learner route accepts an enrollment id. */
const eid = (req: Request) => req.participant!.sub;

/** The reviewer, as the scope service understands them. */
function reviewer(req: Request): ReviewerIdentity {
  const a: any = req.admin || {};
  return {
    sub: String(a.sub || a.id || 'admin'),
    email: a.email ?? null,
    role: a.role,
    mgmt_role: a.mgmt_role ?? null,
    enrollmentId: a.enrollment_id ?? null,
  };
}

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) {
    res.status(e.status).json({ error: e.message || 'error', error_class: e.error_class });
    return;
  }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'capstone_review_controller_error', error_class: e?.error_class || e?.name || 'Error',
    outcome: 'failure', context: { message: e?.message },
  }));
  next(e);
}

// ── Learner ────────────────────────────────────────────────────────────────

/** GET /api/portal/career/publication — where does my record stand? */
export async function handleGetPublicationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getReviewState(eid(req)));
  } catch (e) { fail(res, e, next); }
}

/** POST /api/portal/career/publication/request-review — ask a human to look at it. */
export async function handleRequestReview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await requestCapstoneReview(eid(req)));
  } catch (e) { fail(res, e, next); }
}

const VISIBILITIES = new Set(['private', 'unlisted', 'public']);

/**
 * PUT /api/portal/career/publication/visibility — the learner's own choice of audience.
 *
 * Ali, 2026-08-25: default noindex, the learner opts in to being indexable. `public` IS
 * that opt-in, which is why this is a LEARNER route and not a reviewer one. A mentor
 * approves that the work is publishable; who gets to see it stays the learner's call.
 */
export async function handleSetVisibility(req: Request, res: Response, next: NextFunction) {
  const visibility = String(req.body?.visibility || '');
  if (!VISIBILITIES.has(visibility)) {
    res.status(400).json({ error: `visibility must be one of: ${[...VISIBILITIES].join(', ')}` });
    return;
  }
  try {
    res.json({ ok: true, ...await setVisibility(eid(req), visibility as any) });
  } catch (e) { fail(res, e, next); }
}

// ── Reviewer ───────────────────────────────────────────────────────────────

/** GET /api/admin/career/review-queue — scoped to the learners this reviewer is over. */
export async function handleGetReviewQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const who = reviewer(req);
    const items = await listCapstoneReviewQueue(who);
    res.json({ ok: true, items, reviewer_kind: reviewerKind(who) });
  } catch (e) { fail(res, e, next); }
}

/**
 * GET /api/admin/career/review/:recordId/record — what the reviewer is deciding on.
 *
 * Serves the stored snapshot whatever its status, which the public reader cannot do:
 * everything awaiting review is unpublished, so /p/:slug 404s on all of it.
 */
export async function handleGetRecordForReview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ok: true, ...await getRecordForReview(String(req.params.recordId), reviewer(req)) });
  } catch (e) { fail(res, e, next); }
}

const DECISIONS = new Set(['approved', 'changes_requested', 'rejected']);

/**
 * POST /api/admin/career/review/:recordId — the ONLY path that publishes a record.
 *
 * The per-learner scope check lives in the service, so a mentor cannot act on a record
 * belonging to someone else's learner even with a valid reviewer token.
 */
export async function handleReviewDecision(req: Request, res: Response, next: NextFunction) {
  const decision = String(req.body?.decision || '');
  if (!DECISIONS.has(decision)) {
    res.status(400).json({ error: `decision must be one of: ${[...DECISIONS].join(', ')}` });
    return;
  }
  const notes = req.body?.notes == null ? null : String(req.body.notes).slice(0, 4000);
  // Sending work back with no explanation is useless to the learner who receives it.
  if (decision === 'changes_requested' && !notes?.trim()) {
    res.status(400).json({ error: 'Requesting changes requires notes explaining what to change' });
    return;
  }

  try {
    const result = await recordCapstoneDecision({
      recordId: String(req.params.recordId),
      decision: decision as any,
      reviewer: reviewer(req),
      notes,
    });
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}
