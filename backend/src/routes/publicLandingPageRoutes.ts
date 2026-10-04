import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { renderLandingPage } from '../services/marketing/landingPageRenderer';
import { parseLandingPageContent } from '../schemas/landingPageContentSchema';

/**
 * GET /lp/:brand/:slug — a hosted landing page, served to strangers.
 *
 * ── MOUNT POSITION IS CORRECTNESS, NOT STYLE ──
 * This MUST be mounted above `adminRoutes`. `adminRoutes` is mounted with no path prefix and
 * chains sub-routers that call `router.use(requireAdmin)` unscoped, so anything mounted after it
 * 401s. `/i/:tag` sat below it from 2026-08-27 to 2026-09-11 and 401'd every visitor. A landing
 * page is the destination of a social post: a 401 here means every click on every campaign
 * lands on an auth error. `publicLandingPageRoutes.test.ts` pins both orders.
 *
 * ── WHAT IS SERVED, AND WHAT IS NOT ──
 * Only `kind = 'hosted'` AND `status = 'published'`. Everything else is a 404, including a
 * draft that exists. A draft is unreviewed copy: serving it because someone guessed the URL
 * would publish by accident, so "exists but is not published" and "does not exist" deliberately
 * look identical from outside. The 17 legacy `external_path` rows are not pages at all - they
 * are paths on sites hosted elsewhere - so they 404 here too.
 *
 * ── FAIL-CLOSED ON CONTENT ──
 * The tracked-link redirect fails soft on its click write and closed on its destination. The
 * same split applies here: content that does not parse is a 404 with a logged error, never a
 * half-rendered page. A published row whose content is unparseable is a bug upstream (the DB
 * CHECK only proves content is non-empty, not that it is renderable), and a blank or partial
 * public page is worse than a missing one.
 *
 * ── `:brand` IS A BRAND SLUG, AND THE BROWSER NEVER NAMES ITS OWN TENANT ──
 * `:brand` is user input. It is resolved to a real brand row and a miss is a 404; nothing from
 * the path is trusted as a tenant identifier. Brand slugs are values like `colaberry-training`
 * and `colaberry-enterprise` - not `site_slug` values like `enterprise`, which are a different
 * grain and live in their own column on the row.
 */

// Same shape as the other public endpoints: generous enough for a real campaign spike, low
// enough that this is not a free HTML-rendering CPU faucet.
const landingPageRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => { res.status(429).send('Too Many Requests'); },
});

/**
 * A malformed slug and an unknown slug both return 404, never 400. A different status for "wrong
 * shape" would let someone map the slug alphabet without ever guessing a real page - the same
 * reasoning as the tracked-link redirect's param handling.
 */
const paramsSchema = z.object({
  brand: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,159}$/),
});

function logJson(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'public-landing-page',
    event,
    outcome: level === 'error' ? 'failure' : 'success',
    context,
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** The absolute URL of this request, for the canonical link and the OG url. */
function absoluteUrl(req: Request): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  return host ? `${proto}://${host}${req.path}` : req.path;
}

const router = Router();

router.get('/lp/:brand/:slug', landingPageRateLimiter, async (req: Request, res: Response) => {
  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Not found.');
    return;
  }
  const { brand: brandSlug, slug } = parsedParams.data;

  try {
    // Lazily imported inside the handler, like the tracked-link redirect, so this router can be
    // mounted (and its ordering tested) without pulling the model layer in at import time.
    const { LandingPage, Brand } = await import('../models');

    const brand = await Brand.findOne({ where: { slug: brandSlug } });
    if (!brand) {
      res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Not found.');
      return;
    }

    const page = await LandingPage.findOne({
      where: { brand_id: brand.id, slug, kind: 'hosted', status: 'published' },
    });
    if (!page) {
      res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Not found.');
      return;
    }

    const content = parseLandingPageContent(page.content);
    if (!content.ok) {
      // Fail closed: a published page whose content will not parse is a bug, and a blank public
      // URL is worse than a missing one. Loud in the log, 404 to the visitor.
      logJson('error', 'landing_page_content_unrenderable', {
        brand_slug: brandSlug, slug, problems: content.problems.slice(0, 10),
        impact: 'a published landing page is serving 404 because its content does not match the schema',
      });
      res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Not found.');
      return;
    }

    const { html, branded } = renderLandingPage({
      content: content.content,
      brand: { name: brand.name, default_theme_key: brand.default_theme_key },
      siteSlug: page.site_slug,
      pageUrl: absoluteUrl(req),
    });

    if (!page.site_slug) {
      // Not fatal to the page, but it means this view is invisible to the analytics, which is
      // precisely the "full tracking" requirement failing quietly. Say so.
      logJson('warn', 'landing_page_untracked', {
        brand_slug: brandSlug, slug,
        impact: 'no site_slug on the row, so the tracker is omitted and this view is not recorded',
      });
    }

    // The app-wide helmet default CSP would block the inline <style>, so it is overridden per
    // response - the same approach the unsubscribe page uses. `script-src 'self'` is what lets
    // /v1/track.js load while leaving no room for an inline script, which matters on a page
    // built from operator-supplied content.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src 'self'; connect-src 'self' https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Short, shared cache: a campaign page gets hammered after a post goes out, but an operator
    // who fixes a typo should not wait an hour to see it.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.status(200).type('html').send(html);

    logJson('info', 'landing_page_served', { brand_slug: brandSlug, slug, branded, site_slug: page.site_slug });
  } catch (err: unknown) {
    logJson('error', 'landing_page_failed', {
      brand_slug: brandSlug, slug,
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    res.status(500).type('html').send('<!doctype html><title>Error</title><p>Something went wrong.');
  }
});

export default router;
