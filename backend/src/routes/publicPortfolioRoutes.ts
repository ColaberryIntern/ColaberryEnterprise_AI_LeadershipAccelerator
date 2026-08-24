import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/public/portfolio/:token
 * Unauthenticated — anyone with the link can view a student's shared
 * portfolio. Gated by Project.share_enabled, not by any session. Returns a
 * generic 404 for both "no such token" and "sharing disabled" so a guess
 * can't distinguish the two.
 */
router.get('/api/public/portfolio/:token', async (req: Request, res: Response) => {
  try {
    const { getPortfolioByShareToken } = await import('../services/portfolioShareService');
    const portfolio = await getPortfolioByShareToken(req.params.token as string);
    res.json(portfolio);
  } catch (err: any) {
    if (err?.error_class === 'NotFoundError') {
      res.status(404).json({ error: 'Portfolio not found or not shared' });
      return;
    }
    console.error('[PublicPortfolioRoutes] GET /public/portfolio/:token error:', err.message);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

/**
 * GET /api/public/capstone/:slug
 * Unauthenticated — the Capstone Record behind a student's shareable link.
 *
 * Returns the STORED snapshot (`content_json`), never a live join. A link
 * already sitting in someone's inbox renders what was published, not whatever
 * five tables happen to hold when they open it six months later.
 *
 * A generic 404 covers "no such slug", "not published", and "private" alike:
 * distinguishing them would confirm that a given person is enrolled, which an
 * anonymous request has not earned.
 */
router.get('/api/public/capstone/:slug', async (req: Request, res: Response) => {
  try {
    const { default: CapstoneRecord } = await import('../models/CapstoneRecord');
    const { publicViewDecision } = await import('../services/capstone/capstoneRecordContract');

    const record: any = await CapstoneRecord.findOne({ where: { slug: req.params.slug as string } });
    const decision = record
      ? publicViewDecision(record.status, record.visibility)
      : 'not_found';

    if (decision === 'not_found' || !record?.content_json) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // The slug is readable, so it is guessable. Indexing is what turns an
    // unlisted page a student handed to one person into a page that finds them.
    if (decision === 'serve_noindex') res.set('X-Robots-Tag', 'noindex, nofollow');

    res.json({
      slug: record.slug,
      version: record.version,
      indexable: decision === 'serve_indexable',
      record: record.content_json,
    });
  } catch (err: any) {
    console.error('[PublicPortfolioRoutes] GET /public/capstone/:slug error:', err.message);
    res.status(500).json({ error: 'Failed to load record' });
  }
});

export default router;
