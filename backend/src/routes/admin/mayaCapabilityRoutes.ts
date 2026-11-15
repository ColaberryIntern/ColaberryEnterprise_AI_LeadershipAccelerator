import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { isCoryAuthorizedIdentity, requireAdmin, requireCoryAuthorized } from '../../middlewares/authMiddleware';
import { classifyError } from '../../utils/errorClassifier';
import {
  currentCapabilityState, isMayaCapability, isRaise, isRefusedCapability, promoteMayaCapability,
  readPromotionRecord, resolveAllMayaModes, revertMayaCapability, setMayaCapabilityState,
  type PromotableCapability, type PromotionChange, type PromotionResult, type PromotionState,
} from '../../services/maya/mayaPromotion';
import type { MayaToolCapability } from '../../services/maya/mayaToolGovernance';

/**
 * M37 - Maya's shadow-to-live switch, per capability. Checklist: docs/maya/MAYA_PROMOTION_CHECKLIST.md.
 *
 * WHO MAY DO WHAT, and why the two directions differ:
 *   GET    any admin             (requireAdmin)          - seeing what Maya may do is not a risk
 *   promote  Ali or a super_admin (requireCoryAuthorized) - "Ali promotes each capability. Nobody else."
 *   revert   any admin             (requireAdmin)          - silencing her must never wait on one person
 * Both writes require a review note; the reviewer is the authenticated identity, never a body field.
 */

const router = Router();

const ReviewBody = z.object({ review_note: z.string().trim().min(3).max(500) });

function badRequest(res: Response, message: string, issues?: z.ZodIssue[]): void {
  res.status(400).json({
    error: message, error_class: 'ValidationError',
    issues: issues?.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

function fail(res: Response, event: string, err: unknown): void {
  const errorClass = classifyError(err);
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: errorClass, context: { message: err instanceof Error ? err.message : String(err) },
  }));
  res.status(500).json({ error: 'Maya capability request failed', error_class: errorClass });
}

function reviewer(req: Request): string {
  return String(req.admin?.email || req.admin?.sub || '').trim();
}

router.get('/api/admin/maya/capabilities', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [modes, record] = await Promise.all([resolveAllMayaModes(), readPromotionRecord()]);
    res.json({ modes, promotions: record.capabilities, history: record.history.slice(-50) });
  } catch (err) {
    fail(res, 'maya_capabilities_read_failed', err);
  }
});

function writeRoute(action: (cap: MayaToolCapability, change: PromotionChange) => Promise<PromotionResult>, event: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const cap = req.params.cap;
    if (!isMayaCapability(cap)) { badRequest(res, 'Unknown Maya capability'); return; }
    const body = ReviewBody.safeParse(req.body ?? {});
    if (!body.success) { badRequest(res, 'A review note of 3 to 500 characters is required', body.error.issues); return; }
    const by = reviewer(req);
    if (!by) { res.status(401).json({ error: 'Authentication required' }); return; }
    try {
      const result = await action(cap, { reviewerId: by, reviewNote: body.data.review_note });
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service: 'backend', event, outcome: 'success',
        context: { capability: cap, state: result.state, changed: result.changed, by },
      }));
      res.json(result);
    } catch (err) {
      fail(res, `${event}_failed`, err);
    }
  };
}

router.post('/api/admin/maya/capabilities/:cap/promote', requireCoryAuthorized, writeRoute(promoteMayaCapability, 'maya_capability_promoted'));
router.post('/api/admin/maya/capabilities/:cap/revert', requireAdmin, writeRoute(revertMayaCapability, 'maya_capability_reverted'));

const StateBody = ReviewBody.extend({ state: z.enum(['shadow', 'review', 'live']) });

/**
 * THE THREE-WAY SETTER. `review` is a state the two routes above cannot reach, in either
 * direction, so without this a capability could be shipped in `review` and never moved, or
 * moved out and never moved back.
 *
 * WHY THE AUTH CHECK IS IN THE HANDLER AND NOT IN A MIDDLEWARE.
 *
 * The two routes above can split authority by path because each one has a fixed direction:
 * promote always widens, revert always narrows. This one does not. `shadow -> review` widens
 * and `live -> review` narrows, and which it is depends on the body and on what is stored, so
 * the authority cannot be known until both have been read. A middleware would have to guess.
 *
 * So it runs behind `requireAdmin` - which has already verified the token and populated
 * `req.admin` - and then applies the SAME predicate `requireCoryAuthorized` uses, from the same
 * exported function, to the direction it computed. The asymmetry the two routes above encode is
 * preserved exactly: widening what Maya may do without a person is Ali's, and pulling her back
 * during an incident is any admin's, because silencing her must never wait on one person.
 */
router.post('/api/admin/maya/capabilities/:cap/state', requireAdmin, async (req: Request, res: Response) => {
  const cap = req.params.cap;
  if (!isMayaCapability(cap)) { badRequest(res, 'Unknown Maya capability'); return; }
  // A refused capability is answered here with a sentence rather than a 500 from the service,
  // because the person reading it needs to know this is a decision, not a failure.
  if (isRefusedCapability(cap)) {
    res.status(409).json({
      error: `${cap} is refused by name and has no state to set`,
      error_class: 'CapabilityRefused',
    });
    return;
  }
  const body = StateBody.safeParse(req.body ?? {});
  if (!body.success) {
    badRequest(res, 'A state of shadow, review or live and a review note of 3 to 500 characters are required', body.error.issues);
    return;
  }
  const by = reviewer(req);
  if (!by) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const target = body.data.state as PromotionState;
    const current = await currentCapabilityState(cap as PromotableCapability);
    if (isRaise(current, target) && !isCoryAuthorizedIdentity(req.admin)) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'maya_capability_raise_denied', outcome: 'failure', error_class: 'AuthError',
        context: { capability: cap, from: current, to: target, by },
      }));
      res.status(403).json({
        error: 'Widening a Maya capability requires Ali or a super_admin. Lowering one does not.',
        error_class: 'AuthError',
      });
      return;
    }
    // `expectedFrom` pins the write to the state the authority check above was answered
    // against. Without it the two statements are a read-then-write, and a lawful lowering that
    // interleaves with somebody else's change lands as a raise by an admin who may not raise.
    const result = await setMayaCapabilityState(cap, target, {
      reviewerId: by, reviewNote: body.data.review_note, expectedFrom: current,
    });
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'backend',
      event: 'maya_capability_state_set', outcome: 'success',
      context: { capability: cap, from: current, to: result.state, changed: result.changed, raised: isRaise(current, target), by },
    }));
    res.json(result);
  } catch (err) {
    fail(res, 'maya_capability_state_set_failed', err);
  }
});

export default router;
