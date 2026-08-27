import { Router, Request, Response } from 'express';
import { getPublicPortfolioBySlug } from '../services/career/careerPortfolioPageService';

/**
 * GET /api/public/portfolios/:slug — the person-level public portfolio.
 *
 * UNAUTHENTICATED BY DESIGN, which is why the payload is built by
 * `careerPortfolioPublicProjection` as a named-field allow-list and never by filtering a
 * profile object. This route shapes nothing itself; it decides status codes and headers.
 *
 * PLURAL, AND THAT IS THE WHOLE POINT. `/api/public/portfolio/` (singular) already
 * belongs to `publicPortfolioRoutes.ts` and its share-token page, where `:token` would
 * happily match a slug — a collision resolved by mount order and maddening to debug.
 * `portfolios` is one character away from that trap and cannot fall into it.
 *
 * 404 FOR BOTH "NO SUCH PAGE" AND "NOT VIEWABLE". The service returns null for either,
 * and this route cannot tell them apart. A 403 would confirm that a person by that name
 * has a portfolio, which for a page keyed on someone's name is the entire disclosure.
 *
 * `X-Robots-Tag: noindex` UNLESS THE LEARNER OPTED IN. `unlisted` is a real page for
 * anyone holding the link and still asks not to be indexed. Only an explicit `public`
 * choice removes the header.
 */
const router = Router();

router.get('/api/public/portfolios/:slug', async (req: Request, res: Response): Promise<void> => {
  const slug = String(req.params.slug || '');

  // A slug is an address, not free text. Reject anything that is not one before it
  // reaches a query, rather than relying on the parameterised bind alone.
  if (!/^[a-z0-9][a-z0-9-]{0,158}$/i.test(slug)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const result = await getPublicPortfolioBySlug(slug);
    if (!result) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (!result.indexable) res.set('X-Robots-Tag', 'noindex, nofollow');
    // A portfolio changes as evidence accrues, so it is cacheable only briefly.
    res.set('Cache-Control', 'public, max-age=120');
    res.json({ ok: true, portfolio: result.portfolio });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'public_portfolio_read_failed', outcome: 'failure',
      error_class: err?.error_class || err?.name || 'Error',
      context: { slug, message: err?.message },
    }));
    // Never leak an internal message to an unauthenticated caller.
    res.status(500).json({ error: 'Unable to load this portfolio' });
  }
});

export default router;
