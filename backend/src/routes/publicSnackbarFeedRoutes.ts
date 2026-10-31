import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { isSnackbarEnabled, parseSnackbarConfig } from '../services/marketing/landingPageSnackbar';
import { buildSnackbarFeed } from '../services/marketing/snackbarFeedService';

/**
 * GET /v1/lp-activity/:brand/:slug - the snack bar feed for one published hosted page.
 *
 * MOUNT ABOVE `adminRoutes`, next to publicLandingPageRoutes, for the same reason that file
 * documents: anything mounted after adminRoutes 401s.
 *
 * Same visibility rule as the page: only kind='hosted' AND status='published' AND the bar is on.
 * Everything else, including a malformed slug, returns `{ events: [] }` with 200, so the feed
 * cannot be used to probe which drafts exist, and the script simply shows nothing.
 *
 * Cached 30s at the edge: a campaign spike should hit the database a couple of times a minute,
 * not once per visitor.
 */

const paramsSchema = z.object({
  brand: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,159}$/),
});

const feedRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => { res.status(429).json({ events: [] }); },
});

function logJson(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'public-snackbar-feed', event,
    outcome: level === 'error' ? 'failure' : 'success', context,
  });
  if (level === 'error') console.error(line); else console.log(line);
}

function sendEmpty(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
  res.status(200).json({ events: [] });
}

const router = Router();

router.get('/v1/lp-activity/:brand/:slug', feedRateLimiter, async (req: Request, res: Response) => {
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) { sendEmpty(res); return; }
  const { brand: brandSlug, slug } = parsed.data;
  const started = Date.now();

  try {
    const { LandingPage, Brand } = await import('../models');
    const brand = await Brand.findOne({ where: { slug: brandSlug } });
    if (!brand) { sendEmpty(res); return; }
    const page = await LandingPage.findOne({ where: { brand_id: brand.id, slug, kind: 'hosted', status: 'published' } });
    if (!page || !isSnackbarEnabled(brand.snackbar_default_enabled, page.snackbar_enabled)) { sendEmpty(res); return; }

    const { config, ok } = parseSnackbarConfig(page.snackbar_config);
    if (!ok) logJson('warn', 'snackbar_config_invalid', { brand_slug: brandSlug, slug, impact: 'rendering with defaults' });

    const events = await buildSnackbarFeed({ id: brand.id, timezone: brand.timezone }, config);
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).json({ events });
    logJson('info', 'snackbar_feed_served', { brand_slug: brandSlug, slug, count: events.length, duration_ms: Date.now() - started });
  } catch (err: unknown) {
    logJson('error', 'snackbar_feed_failed', {
      brand_slug: brandSlug, slug, duration_ms: Date.now() - started,
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    sendEmpty(res); // the page loses its snack bar, never the page
  }
});

export default router;
