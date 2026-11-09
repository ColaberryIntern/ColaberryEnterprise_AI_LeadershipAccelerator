import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireCoryAuthorized } from '../../middlewares/authMiddleware';
import { classifyError } from '../../utils/errorClassifier';
import {
  applyContentApproval, ContentApprovalError, previewContentApproval, revokeContentApproval,
} from '../../services/growthJourney/content/contentApprovalOperator';
import { LandingPageNotHttpsError, LandingPageRequiredError } from '../../services/growthJourney/content/contentRulesPlan';

/**
 * R2 - approve a brand's content for a landing page from the admin Content tab (services/growthJourney/content/
 * contentApprovalOperator.ts). The same writer as the growthJourneyContentRules CLI, now reachable by an operator.
 *
 *   preview  any admin              - shows exactly what would be approved, writes nothing
 *   apply    Ali or a super_admin   - content approval is a business decision (the CLI's own header: "the production run
 *                                     is Ali's"), recorded with the signed-in identity
 *   revoke   any admin              - taking approval away must never wait on one person
 */

const router = Router();

const Body = z.object({
  brand_slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/),
  landing_page: z.string().trim().min(8).max(500),
}).strict();

const who = (req: Request): string => String(req.admin?.email || req.admin?.sub || '').trim();

function fail(res: Response, event: string, err: unknown): void {
  if (err instanceof ContentApprovalError || err instanceof LandingPageRequiredError || err instanceof LandingPageNotHttpsError) {
    res.status(400).json({ error: err.message, error_class: 'ValidationError' });
    return;
  }
  const errorClass = classifyError(err);
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: errorClass, context: { message: err instanceof Error ? err.message : String(err) } }));
  res.status(500).json({ error: 'Content approval request failed', error_class: errorClass });
}

function handler(action: 'preview' | 'apply' | 'revoke') {
  return async (req: Request, res: Response): Promise<void> => {
    const body = Body.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Invalid request', error_class: 'ValidationError',
        issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      return;
    }
    const input = { brandSlug: body.data.brand_slug, landingPage: body.data.landing_page };
    try {
      if (action === 'preview') { res.json(await previewContentApproval(input)); return; }
      const by = who(req);
      if (!by) { res.status(401).json({ error: 'Authentication required' }); return; }
      const result = action === 'apply' ? await applyContentApproval(input, by) : await revokeContentApproval(input, by);
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend', event: `content_approval_${action}`,
        outcome: 'success', context: { brand_slug: input.brandSlug, by, result } }));
      res.json(result);
    } catch (err) {
      fail(res, `content_approval_${action}_failed`, err);
    }
  };
}

router.post('/api/admin/growth-journey/content-approval/preview', requireAdmin, handler('preview'));
router.post('/api/admin/growth-journey/content-approval/apply', requireCoryAuthorized, handler('apply'));
router.post('/api/admin/growth-journey/content-approval/revoke', requireAdmin, handler('revoke'));

export default router;
