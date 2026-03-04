import { Request, Response, NextFunction } from 'express';
import { getLeadJourney, getVisitorJourney } from '../services/journeyTimelineService';
import {
  getTopOpportunities,
  getOpportunitySummary,
  getForecastProjections,
  recomputeActiveOpportunityScores,
} from '../services/opportunityScoringService';

// ---------------------------------------------------------------------------
// Journey Timeline
// ---------------------------------------------------------------------------

export async function handleGetLeadJourney(req: Request, res: Response, next: NextFunction) {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    if (isNaN(leadId)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    const journey = await getLeadJourney(leadId);
    if (!journey) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(journey);
  } catch (error) {
    next(error);
  }
}

export async function handleGetVisitorJourney(req: Request, res: Response, next: NextFunction) {
  try {
    const journey = await getVisitorJourney(req.params.id as string);
    if (!journey) {
      return res.status(404).json({ error: 'Visitor not found' });
    }
    res.json(journey);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Opportunity Scores
// ---------------------------------------------------------------------------

export async function handleGetOpportunityScores(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, level, stall_risk, pipeline_stage, sort, order } = req.query;
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 50;

    const { rows, count } = await getTopOpportunities({
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      level: level as string | undefined,
      stallRisk: stall_risk as string | undefined,
      pipelineStage: pipeline_stage as string | undefined,
      sort: sort as string | undefined,
      order: order as string | undefined,
    });

    res.json({
      rows,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
    });
  } catch (error) {
    next(error);
  }
}

export async function handleGetOpportunitySummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await getOpportunitySummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

export async function handleGetForecastProjections(req: Request, res: Response, next: NextFunction) {
  try {
    const forecast = await getForecastProjections();
    res.json(forecast);
  } catch (error) {
    next(error);
  }
}

export async function handleRecomputeOpportunities(req: Request, res: Response, next: NextFunction) {
  try {
    const scored = await recomputeActiveOpportunityScores();
    res.json({ message: `Recomputed opportunity scores for ${scored} lead(s)`, scored });
  } catch (error) {
    next(error);
  }
}
