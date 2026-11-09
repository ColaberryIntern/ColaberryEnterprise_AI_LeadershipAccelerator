import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireCoryAuthorized } from '../../middlewares/authMiddleware';
import { classifyError } from '../../utils/errorClassifier';
import {
  isMayaCapability, promoteMayaCapability, readPromotionRecord, resolveAllMayaModes, revertMayaCapability,
  type PromotionChange, type PromotionResult,
} from '../../services/maya/mayaPromotion';
import type { MayaCapability } from '../../services/mayaEnablement';

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

function writeRoute(action: (cap: MayaCapability, change: PromotionChange) => Promise<PromotionResult>, event: string) {
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

export default router;
