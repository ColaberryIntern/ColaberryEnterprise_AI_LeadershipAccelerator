/**
 * careerPublicationController — HTTP boundary for Gate 10 (publication) and
 * Gate 9b (review).
 *
 * Three distinct audiences, three distinct authorization stories, deliberately kept
 * in separate handlers rather than one polymorphic endpoint:
 *
 *  - the LEARNER submits their own portfolio  (subject = req.participant.sub, always)
 *  - an ADMIN decides                          (requireAdmin on the route)
 *  - the PUBLIC reads an approved snapshot     (no auth, slug only, frozen data)
 */
import { Request, Response, NextFunction } from 'express';
import {
  requestReview,
  recordReviewDecision,
  suspendPublication,
  listReviewQueue,
  getPublicationStatus,
  getPublicSnapshotBySlug,
} from '../services/career/careerPublicationService';
import {
  visibleEnrollmentIds,
  canReview,
  reviewerKind,
  type ReviewerIdentity,
} from '../services/career/careerMentorScopeService';
import CareerPublication from '../models/CareerPublication';
import CareerPublicationSnapshot from '../models/CareerPublicationSnapshot';

/** The learner is ALWAYS the caller. No route here accepts an enrollment id. */
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
    event: 'career_publication_controller_error', error_class: e?.error_class || e?.name || 'Error',
    outcome: 'failure', context: { message: e?.message },
  }));
  next(e);
}

// ── Learner ────────────────────────────────────────────────────────────────

/** GET /api/portal/career/publication — where does my publication stand? */
export async function handleGetPublicationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getPublicationStatus(eid(req)));
  } catch (e) { fail(res, e, next); }
}

/**
 * POST /api/portal/career/publication/request-review
 *
 * Freezes the learner's current studio into an immutable snapshot. 422 if readiness
 * policy is unmet — publishing is earned, and the refusal lives in the service so a
 * direct API call cannot skip it.
 */
export async function handleRequestReview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await requestReview(eid(req)));
  } catch (e) { fail(res, e, next); }
}

// ── Reviewer (admin) ───────────────────────────────────────────────────────

/** GET /api/admin/career/review-queue — snapshots awaiting a decision, oldest first. */
export async function handleGetReviewQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const who = reviewer(req);
    // A mentor sees only the learners they are over. An admin passes `null` (no filter).
    const scope = await visibleEnrollmentIds(who);
    const items = await listReviewQueue(50, scope);
    res.json({ ok: true, items, scoped: scope !== null, reviewer_kind: reviewerKind(who) });
  } catch (e) { fail(res, e, next); }
}

const DECISIONS = new Set(['approved', 'changes_requested', 'rejected']);

/**
 * POST /api/admin/career/review/:snapshotId
 *
 * The ONLY path that can make a portfolio public. Records who decided what about
 * which exact snapshot (plan §22). A replayed decision returns `duplicate: true` with
 * the decision already on record rather than overwriting it.
 */
export async function handleReviewDecision(req: Request, res: Response, next: NextFunction) {
  const decision = String(req.body?.decision || '');
  if (!DECISIONS.has(decision)) {
    res.status(400).json({ error: `decision must be one of: ${[...DECISIONS].join(', ')}` });
    return;
  }
  const notes = req.body?.notes == null ? null : String(req.body.notes).slice(0, 4000);
  // changes_requested with no explanation is useless to the learner receiving it.
  if (decision === 'changes_requested' && !notes?.trim()) {
    res.status(400).json({ error: 'Requesting changes requires notes explaining what to change' });
    return;
  }

  try {
    const who = reviewer(req);

    // Passing requireCareerReviewer only proves they may open the surface. Whether they
    // may act on THIS learner is a second question, and it has to be asked here — a
    // mentor could otherwise POST a snapshot id belonging to someone else's learner.
    const snapshot = await CareerPublicationSnapshot.findByPk(String(req.params.snapshotId));
    if (!snapshot) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const publication = await CareerPublication.findByPk(snapshot.publication_id);
    if (!publication) { res.status(404).json({ error: 'Publication not found' }); return; }

    if (!await canReview(who, publication.enrollment_id)) {
      res.status(403).json({ error: 'That learner is outside your mentor scope' });
      return;
    }

    const result = await recordReviewDecision({
      snapshotId: String(req.params.snapshotId),
      decision: decision as any,
      reviewerId: who.sub,
      reviewerEmail: who.email ?? null,
      notes,
    });
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}

/** POST /api/admin/career/publication/:enrollmentId/suspend — withdraw a live portfolio. */
export async function handleSuspendPublication(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollmentId = String(req.params.enrollmentId);
    if (!await canReview(reviewer(req), enrollmentId)) {
      res.status(403).json({ error: 'That learner is outside your mentor scope' });
      return;
    }
    res.json({ ok: true, ...await suspendPublication(enrollmentId) });
  } catch (e) { fail(res, e, next); }
}

// ── Public ─────────────────────────────────────────────────────────────────

/**
 * GET /api/public/talent/:slug — unauthenticated.
 *
 * Serves the frozen approved snapshot and nothing else. Returns an identical generic
 * 404 for unknown slug, unpublished and suspended, so a guess cannot distinguish them
 * — the same non-enumerable behaviour the existing project share link has.
 */
export async function handleGetPublicTalent(req: Request, res: Response, next: NextFunction) {
  try {
    const found = await getPublicSnapshotBySlug(String(req.params.slug));
    if (!found) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }
    res.json({
      slug: String(req.params.slug),
      version: found.version,
      published_at: found.published_at,
      ...found.payload,
    });
  } catch (e) {
    console.error('[CareerPublication] public talent read failed:', (e as any)?.message);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
}
