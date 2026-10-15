import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * GET /api/public/tracking-config — which ad pixel, if any, this hostname should load.
 *
 * WHY THE APP CANNOT JUST KNOW. The landing page carries the brand in its path
 * (`/lp/colaberry-training/...`) so the renderer looks the pixel up directly. The React portal
 * has no brand in its URL: `/portal/today` is the same path for every brand on every host. So
 * the one thing it can be sure of is its own hostname, and that is what this resolves.
 *
 * HOSTNAME, NOT A HARD-CODED SLUG. Writing `colaberry-training` into the frontend would be the
 * same mistake as pasting a pixel snippet into one page - correct for exactly one brand until
 * the second one appears. `brand_domains` already records which hostnames belong to which brand,
 * and it is already the table the rest of the estate resolves sites with.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT RETURN ──
 *
 * Only the pixel ID, and only when one is set. No brand id, no tenant, no domain list. This is
 * an UNAUTHENTICATED endpoint reachable by anyone who can load the app shell, so it answers
 * exactly the question the page has to ask and nothing adjacent. A Meta Pixel ID is not a secret
 * - it is visible in the page source of every site that uses one - but the brand/tenant graph
 * around it is not public, and an endpoint that returns "a bit of context while we are here" is
 * how that leaks.
 *
 * MOUNTS ABOVE adminRoutes, like every other public route in this app. Mounted below, the admin
 * router's auth middleware answers first and a logged-out visitor gets a 401 for a page that is
 * supposed to be public - a bug this repo has shipped twice.
 */

const router = Router();

// Generous, because every portal page load asks once. Tight enough that the endpoint cannot be
// used to enumerate hostnames at speed.
const limiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/** `www.refactored.ai:443` and `WWW.Refactored.AI` are the same host as far as a lookup goes. */
function normaliseHost(raw: string | undefined): string | null {
  if (!raw) return null;
  const host = raw.split(',')[0].trim().toLowerCase().split(':')[0];
  // Hostnames only. Anything else is a malformed or spoofed Host header and gets no answer.
  return /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
}

router.get('/api/public/tracking-config', limiter, async (req: Request, res: Response) => {
  // Never cached by a shared cache: the answer varies by Host, and a CDN that cached one brand's
  // pixel for another brand's hostname would attribute one advertiser's conversions to another.
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Vary', 'Host');

  const host = normaliseHost(req.headers.host);
  if (!host) return void res.json({ meta_pixel_id: null });

  try {
    const { Brand, BrandDomain } = await import('../models');

    const domain = await BrandDomain.findOne({ where: { hostname: host } });
    if (!domain) return void res.json({ meta_pixel_id: null });

    const brand = await Brand.findOne({ where: { id: domain.brand_id } });
    const pixel = brand?.meta_pixel_id ?? null;

    // Re-checked here even though the column has a CHECK and the write path has a Zod regex.
    // This value is about to be interpolated into a script tag by the browser; a row written by
    // some future path that skipped both would otherwise arrive there unexamined.
    res.json({ meta_pixel_id: pixel && /^[0-9]{8,20}$/.test(pixel) ? pixel : null });
  } catch {
    // A tracking lookup must never break the page it is loaded by. No pixel is a correct answer
    // to "I could not find out"; a 500 here would surface as a broken portal.
    res.json({ meta_pixel_id: null });
  }
});

export default router;
