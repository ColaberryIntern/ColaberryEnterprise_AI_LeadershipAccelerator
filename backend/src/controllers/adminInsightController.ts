import { Request, Response, NextFunction } from 'express';
import {
  getInsights,
  getTargetingRecommendations,
  getInsightSummary,
  computeInsights,
} from '../services/icpInsightService';
import {
  getCampaignOutcomeSummary,
  getLeadOutcomeSummary,
} from '../services/interactionService';
import { InteractionOutcome } from '../models';
import { Op, fn, col, literal } from 'sequelize';

/** GET /api/admin/insights — get filtered ICP insights */
export async function handleGetInsights(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { dimension_type, campaign_type, metric_name, min_sample_size } = req.query;

    const insights = await getInsights({
      dimension_type: dimension_type as string,
      campaign_type: campaign_type as string,
      metric_name: metric_name as string,
      min_sample_size: min_sample_size ? parseInt(min_sample_size as string, 10) : undefined,
    });

    res.json({ insights });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/insights/summary — get full insight summary with top performers */
export async function handleGetInsightSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaignType = (req.query.campaign_type as string) || 'all';
    const summary = await getInsightSummary(campaignType);
    res.json({ summary });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/insights/recommendations — get targeting recommendations */
export async function handleGetRecommendations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaignType = (req.query.campaign_type as string) || 'all';
    const metricName = (req.query.metric_name as string) || 'response_rate';
    const minSampleSize = req.query.min_sample_size
      ? parseInt(req.query.min_sample_size as string, 10)
      : 5;

    const recommendations = await getTargetingRecommendations(campaignType, metricName, minSampleSize);
    res.json({ recommendations });
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/insights/compute — manually trigger insight computation */
export async function handleComputeInsights(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const periodDays = req.body.period_days || 90;
    const count = await computeInsights(periodDays);
    res.json({ message: `Computed ${count} insights`, count });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/insights/outcomes — get recent interaction outcomes with filters */
export async function handleGetOutcomes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      campaign_id, channel, outcome, lead_source_type,
      page = '1', limit = '50',
    } = req.query;

    const where: Record<string, any> = {};
    if (campaign_id) where.campaign_id = campaign_id;
    if (channel) where.channel = channel;
    if (outcome) where.outcome = outcome;
    if (lead_source_type) where.lead_source_type = lead_source_type;

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const { rows, count } = await InteractionOutcome.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit as string, 10),
      offset,
    });

    res.json({
      outcomes: rows,
      total: count,
      page: parseInt(page as string, 10),
      pages: Math.ceil(count / parseInt(limit as string, 10)),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/insights/outcome-stats — aggregated outcome statistics */
export async function handleGetOutcomeStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const days = parseInt((req.query.days as string) || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const outcomes = await InteractionOutcome.findAll({
      where: { created_at: { [Op.gte]: since } },
      attributes: [
        'outcome',
        'channel',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['outcome', 'channel'],
      raw: true,
    });

    // Also get daily trend
    const dailyTrend = await InteractionOutcome.findAll({
      where: { created_at: { [Op.gte]: since } },
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        'outcome',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: [fn('DATE', col('created_at')), 'outcome'],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    });

    res.json({ outcomes, daily_trend: dailyTrend, period_days: days });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/insights/campaigns/:id/outcomes — outcomes for a specific campaign */
export async function handleGetCampaignOutcomes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaignId = req.params.id as string;
    const summary = await getCampaignOutcomeSummary(campaignId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/insights/leads/:id/outcomes — outcomes for a specific lead */
export async function handleGetLeadOutcomes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    const summary = await getLeadOutcomeSummary(leadId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}
