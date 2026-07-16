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

export default router;
