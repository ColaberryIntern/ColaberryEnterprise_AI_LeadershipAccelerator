/**
 * careerPortfolioPageController — the person-level portfolio at /u/:slug.
 *
 * Two audiences, deliberately separate handlers:
 *
 *   LEARNER   reads their page state, sets visibility, asks for review. The enrollment
 *             is ALWAYS taken from the token, never from the request — there is no route
 *             here that accepts an enrollment id from a learner.
 *   REVIEWER  approves or asks for changes, and only for a learner they are over. The
 *             scope check is `canReview`, the same function the record review uses, so
 *             the two surfaces cannot disagree about who a mentor is over.
 */
import { Request, Response, NextFunction } from 'express';
import {
  getPortfolioPageState,
  setPortfolioVisibility,
  requestPortfolioReview,
  decidePortfolioReview,
  isVisibility,
  listPortfolioReviewQueue,
  type PortfolioDecision,
} from '../services/career/careerPortfolioPageWriteService';
import { canReview, type ReviewerIdentity } from '../services/career/careerMentorScopeService';
import { getPortfolioPreview } from '../services/career/careerPortfolioPageService';

/** The learner is always the caller. */
const eid = (req: Request) => req.participant!.sub;

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
    event: 'portfolio_page_controller_error', outcome: 'failure',
    error_class: e?.error_class || e?.name || 'Error', context: { message: e?.message },
  }));
  next(e);
}

// ── Learner ────────────────────────────────────────────────────────────────

/** GET /api/portal/career/portfolio-page */
export async function handleGetPortfolioPage(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ok: true, page: await getPortfolioPageState(eid(req)) });
  } catch (e) { fail(res, e, next); }
}

/**
 * PUT /api/portal/career/portfolio-page/visibility
 *
 * Safe to hand the learner outright: visibility and status are independent axes and both
 * must pass, so setting `public` on an unapproved page changes nothing a stranger sees.
 */
export async function handleSetPortfolioPageVisibility(req: Request, res: Response, next: NextFunction) {
  const visibility = req.body?.visibility;
  if (!isVisibility(visibility)) {
    res.status(400).json({ error: 'visibility must be one of: private, unlisted, public' });
    return;
  }
  try {
    res.json({ ok: true, page: await setPortfolioVisibility(eid(req), visibility) });
  } catch (e) { fail(res, e, next); }
}

/**
 * GET /api/portal/career/portfolio-page/preview
 *
 * WHAT THE LEARNER IS ABOUT TO ASK SOMEONE TO APPROVE. The Publishing tab could show the
 * address, the state and the visibility controls, but the page itself only became
 * openable once it was already live -- so a learner pressed "Ask for review" on something
 * they had never seen. That is the same defect Ali reported on the reviewer's side ("it's
 * just asking me to give changes but I can't view what I'm supposed to be approving"),
 * one seat over.
 *
 * It serves `getPortfolioPreview` -- the SAME function behind the reviewer's preview and
 * the same allow-list the public page uses -- so the learner, the reviewer and the
 * stranger are all looking at one rendering. No `canReview` check: the subject is the
 * caller's own enrollment, taken from the session rather than the URL, so there is no id
 * here for anyone to substitute.
 */
export async function handleGetMyPortfolioPreview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ok: true, ...await getPortfolioPreview(eid(req)) });
  } catch (e) { fail(res, e, next); }
}

/** POST /api/portal/career/portfolio-page/request-review */
export async function handleRequestPortfolioPageReview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ok: true, page: await requestPortfolioReview(eid(req)) });
  } catch (e) { fail(res, e, next); }
}

// ── Reviewer ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/career/portfolio-review-queue — pages awaiting a decision.
 *
 * Added after shipping the request and decide endpoints WITHOUT this one, which left a
 * learner's request sitting in a table no surface read. Scoped per reviewer by the same
 * function the record queue uses.
 */
export async function handleGetPortfolioReviewQueue(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ok: true, items: await listPortfolioReviewQueue(reviewer(req)) });
  } catch (e) { fail(res, e, next); }
}

/**
 * GET /api/admin/career/portfolio-review/:enrollmentId/preview
 *
 * What the reviewer is deciding on. The screen shipped with Approve and Ask-for-changes
 * and nothing to look at, which is not a review gate.
 *
 * Serves the same allow-list payload the public page would, whatever the page's status --
 * everything awaiting review is unpublished, so the public reader 404s on all of it.
 */
export async function handleGetPortfolioPreview(req: Request, res: Response, next: NextFunction) {
  const enrollmentId = String(req.params.enrollmentId || '');
  try {
    if (!(await canReview(reviewer(req), enrollmentId))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ ok: true, ...await getPortfolioPreview(enrollmentId) });
  } catch (e) { fail(res, e, next); }
}

const DECISIONS = new Set<PortfolioDecision>(['approved', 'changes_requested']);

/**
 * POST /api/admin/career/portfolio-review/:enrollmentId — the only path that publishes.
 *
 * A mentor holding a valid reviewer token still cannot act on a learner outside their
 * scope: `canReview` is checked per learner, here, before anything is written.
 */
export async function handlePortfolioPageDecision(req: Request, res: Response, next: NextFunction) {
  const decision = String(req.body?.decision || '') as PortfolioDecision;
  if (!DECISIONS.has(decision)) {
    res.status(400).json({ error: 'decision must be one of: approved, changes_requested' });
    return;
  }

  const enrollmentId = String(req.params.enrollmentId || '');
  const who = reviewer(req);
  try {
    if (!(await canReview(who, enrollmentId))) {
      // 404, not 403: a reviewer outside their scope learns nothing about who exists.
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const page = await decidePortfolioReview({
      enrollmentId,
      decision,
      reviewerEmail: String(who.email || who.sub),
    });
    res.json({ ok: true, page });
  } catch (e) { fail(res, e, next); }
}
