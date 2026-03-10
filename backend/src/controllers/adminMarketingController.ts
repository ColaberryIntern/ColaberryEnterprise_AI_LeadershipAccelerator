import { Request, Response } from 'express';
import { getCampaignMetrics } from '../services/marketingAnalyticsService';

export async function handleGetCampaignMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { start, end } = req.query as { start?: string; end?: string };
    const metrics = await getCampaignMetrics({ start, end });
    res.json({ campaigns: metrics });
  } catch (error: any) {
    console.error('[Marketing] Failed to fetch campaign metrics:', error.message);
    res.status(500).json({ error: 'Failed to fetch campaign metrics' });
  }
}
