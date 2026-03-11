import { Request, Response } from 'express';
import { LeadRecommendation } from '../models';
import {
  approveRecommendation,
  rejectRecommendation,
  bulkApproveRecommendations,
  getRecommendationStats,
} from '../services/leadIntelligenceService';

export async function handleListRecommendations(req: Request, res: Response) {
  try {
    const { campaign_id, status = 'pending', page = '1', per_page = '25' } = req.query;
    const where: any = {};
    if (campaign_id) where.campaign_id = campaign_id;
    if (status) where.status = status;

    const limit = Math.min(parseInt(per_page as string) || 25, 100);
    const offset = (Math.max(parseInt(page as string) || 1, 1) - 1) * limit;

    const { rows, count } = await LeadRecommendation.findAndCountAll({
      where,
      order: [['program_fit_score', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      recommendations: rows,
      total: count,
      page: parseInt(page as string) || 1,
      per_page: limit,
      total_pages: Math.ceil(count / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetRecommendationStats(req: Request, res: Response) {
  try {
    const campaignId = req.query.campaign_id as string | undefined;
    const stats = await getRecommendationStats(campaignId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleApproveRecommendation(req: Request, res: Response) {
  try {
    const adminUserId = (req as any).adminUser?.id;
    const result = await approveRecommendation(req.params.id as string, adminUserId);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleRejectRecommendation(req: Request, res: Response) {
  try {
    const adminUserId = (req as any).adminUser?.id;
    await rejectRecommendation(req.params.id as string, adminUserId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleBulkApproveRecommendations(req: Request, res: Response) {
  try {
    const adminUserId = (req as any).adminUser?.id;
    const { recommendation_ids } = req.body;
    if (!Array.isArray(recommendation_ids) || recommendation_ids.length === 0) {
      return res.status(400).json({ error: 'recommendation_ids array is required' });
    }
    const result = await bulkApproveRecommendations(recommendation_ids, adminUserId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
