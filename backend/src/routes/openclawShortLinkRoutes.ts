import { Router, Request, Response } from 'express';

/**
 * openclawShortLinkRoutes — `GET /i/:tag`, the OpenClaw outreach short link.
 *
 * PUBLIC. A stranger who clicks a link in a Reddit or LinkedIn reply has no session, so this
 * router MUST be mounted BEFORE `adminRoutes` in `server.ts`. adminRoutes is mounted with no
 * path prefix and chains sub-routers that call `router.use(requireAdmin)` with no path scope,
 * so anything mounted after it is answered 401 before it can match. That is exactly what
 * happened here: the handler lived inline in `server.ts` *below* `app.use(adminRoutes)` from
 * 2026-08-27 (`b7f59e42`) until this file, and every `/i/` visitor got
 * `{"error":"Authentication required"}` instead of the landing page. The 2026-09-11
 * production verification of the marketing release found it while probing public routes.
 *
 * `openclawShortLinkRoutes.test.ts` builds both mount orders and asserts 302 above / 401
 * below, so a future re-order fails a test rather than a campaign.
 *
 * Behaviour is otherwise the inline handler's, unchanged: unknown tag → landing page; visitor
 * attribution row (non-critical, logged if it fails); click count bumped on the response.
 */

const LANDING = '/ai-architect';

const router = Router();

router.get('/i/:tag', async (req: Request, res: Response) => {
  try {
    const { OpenclawResponse: OcResponse } = await import('../models');
    const response = await OcResponse.findOne({ where: { short_id: req.params.tag } });
    if (!response) return res.redirect(LANDING);

    // Record visitor attribution
    try {
      const { Visitor } = await import('../models');
      if (Visitor) {
        await (Visitor as any).create({
          campaign_id: response.utm_params?.utm_campaign || response.short_id,
          source: response.utm_params?.utm_source || response.platform,
          medium: response.utm_params?.utm_medium || 'organic_outreach',
          landing_page: LANDING,
          referrer: req.get('referer') || null,
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          created_at: new Date(),
        });
      }
    } catch (err: any) {
      // Visitor tracking is non-critical: the visitor still gets the page. Logged, not swallowed.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'openclaw-short-link',
        event: 'visitor_attribution_failed', outcome: 'partial',
        error_class: err?.name ?? 'Error', context: { tag: req.params.tag, message: String(err?.message ?? err).slice(0, 200) },
      }));
    }

    // Update engagement metrics
    const clicks = (response.engagement_metrics?.clicks || 0) + 1;
    await response.update({
      engagement_metrics: { ...response.engagement_metrics, clicks },
      updated_at: new Date(),
    });

    return res.redirect(LANDING);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'openclaw-short-link',
      event: 'short_link_redirect_failed', outcome: 'failure',
      error_class: err?.name ?? 'Error', context: { tag: req.params.tag, message: String(err?.message ?? err).slice(0, 200) },
    }));
    return res.redirect(LANDING);
  }
});

export default router;
