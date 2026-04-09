/**
 * UserJourneyMapsService
 * BPOS service for aggregate journey analytics and journey map template CRUD.
 * Delegates per-lead/visitor journey data to journeyTimelineService.
 */

import { Op } from 'sequelize';

const LOG_PREFIX = '[UserJourneyMaps]';

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  const delays = [500, 1000, 2000];
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`${LOG_PREFIX} Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delays[attempt]}ms...`);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error('Unreachable');
}

// ---------------------------------------------------------------------------
// Aggregate journey analytics
// ---------------------------------------------------------------------------

export async function getJourneyOverview(): Promise<{
  total_leads_tracked: number;
  stage_distribution: Record<string, number>;
  avg_journey_duration_days: number;
  stalled_count: number;
  avg_velocity: number;
}> {
  const { Lead, Visitor } = await import('../models');
  const { getLeadJourney } = await import('./journeyTimelineService');

  return withRetry(async () => {
    // Get leads that have associated visitors (i.e. tracked journeys)
    const leads = await Lead.findAll({
      include: [{ model: Visitor, as: 'visitor', attributes: ['id'], required: true }],
      attributes: ['id'],
      limit: 500,
    });

    console.log(`${LOG_PREFIX} Computing overview for ${leads.length} tracked leads`);

    const stageDistribution: Record<string, number> = {
      awareness: 0, interest: 0, consideration: 0, evaluation: 0, decision: 0,
    };
    let totalDuration = 0;
    let stalledCount = 0;
    let totalVelocity = 0;
    let journeyCount = 0;

    // Process in batches to avoid memory pressure
    const batchSize = 50;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const journeys = await Promise.all(
        batch.map((l: any) => getLeadJourney(l.id).catch(() => null))
      );

      for (const journey of journeys) {
        if (!journey || journey.events.length === 0) continue;
        journeyCount++;
        stageDistribution[journey.metrics.current_stage] = (stageDistribution[journey.metrics.current_stage] || 0) + 1;
        totalDuration += journey.metrics.journey_duration_days;
        totalVelocity += journey.metrics.engagement_velocity;
        if (journey.metrics.stall_detected) stalledCount++;
      }
    }

    return {
      total_leads_tracked: journeyCount,
      stage_distribution: stageDistribution,
      avg_journey_duration_days: journeyCount > 0 ? Math.round(totalDuration / journeyCount) : 0,
      stalled_count: stalledCount,
      avg_velocity: journeyCount > 0 ? Math.round((totalVelocity / journeyCount) * 10) / 10 : 0,
    };
  });
}

export async function getJourneyFunnel(): Promise<{
  stages: Array<{ stage: string; count: number; percentage: number }>;
  total_leads: number;
}> {
  const { Lead, Visitor } = await import('../models');
  const { getLeadJourney } = await import('./journeyTimelineService');

  return withRetry(async () => {
    const leads = await Lead.findAll({
      include: [{ model: Visitor, as: 'visitor', attributes: ['id'], required: true }],
      attributes: ['id'],
      limit: 500,
    });

    const stageCounts: Record<string, number> = {
      awareness: 0, interest: 0, consideration: 0, evaluation: 0, decision: 0,
    };

    const batchSize = 50;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const journeys = await Promise.all(
        batch.map((l: any) => getLeadJourney(l.id).catch(() => null))
      );

      for (const journey of journeys) {
        if (!journey || journey.events.length === 0) continue;
        // Count leads that have reached each stage (cumulative)
        const stageOrder = ['awareness', 'interest', 'consideration', 'evaluation', 'decision'];
        const currentIdx = stageOrder.indexOf(journey.metrics.current_stage);
        for (let s = 0; s <= currentIdx; s++) {
          stageCounts[stageOrder[s]]++;
        }
      }
    }

    const total = stageCounts.awareness || 1;
    const stageOrder = ['awareness', 'interest', 'consideration', 'evaluation', 'decision'];

    return {
      stages: stageOrder.map(stage => ({
        stage,
        count: stageCounts[stage],
        percentage: Math.round((stageCounts[stage] / total) * 100),
      })),
      total_leads: total,
    };
  });
}

export async function getStageBreakdown(stage: string): Promise<Array<{
  lead_id: number;
  lead_name: string;
  company: string;
  touchpoints: number;
  days_in_stage: number;
  velocity: number;
  stall_detected: boolean;
}>> {
  const { Lead, Visitor } = await import('../models');
  const { getLeadJourney } = await import('./journeyTimelineService');

  const validStages = ['awareness', 'interest', 'consideration', 'evaluation', 'decision'];
  if (!validStages.includes(stage)) {
    throw new Error(`Invalid stage: ${stage}. Must be one of: ${validStages.join(', ')}`);
  }

  return withRetry(async () => {
    const leads = await Lead.findAll({
      include: [{ model: Visitor, as: 'visitor', attributes: ['id'], required: true }],
      attributes: ['id', 'name', 'company'],
      limit: 500,
    });

    const results: Array<any> = [];
    const batchSize = 50;

    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const journeys = await Promise.all(
        batch.map((l: any) => getLeadJourney(l.id).catch(() => null))
      );

      for (let j = 0; j < batch.length; j++) {
        const journey = journeys[j];
        if (!journey || journey.metrics.current_stage !== stage) continue;
        results.push({
          lead_id: (batch[j] as any).id,
          lead_name: (batch[j] as any).name || 'Unknown',
          company: (batch[j] as any).company || '',
          touchpoints: journey.metrics.total_touchpoints,
          days_in_stage: journey.metrics.time_in_current_stage_days,
          velocity: journey.metrics.engagement_velocity,
          stall_detected: journey.metrics.stall_detected,
        });
      }
    }

    return results;
  });
}

export async function getStalledJourneys(): Promise<Array<{
  lead_id: number;
  lead_name: string;
  company: string;
  current_stage: string;
  days_since_last_touchpoint: number;
  total_touchpoints: number;
}>> {
  const { Lead, Visitor } = await import('../models');
  const { getLeadJourney } = await import('./journeyTimelineService');

  return withRetry(async () => {
    const leads = await Lead.findAll({
      include: [{ model: Visitor, as: 'visitor', attributes: ['id'], required: true }],
      attributes: ['id', 'name', 'company'],
      limit: 500,
    });

    const results: Array<any> = [];
    const batchSize = 50;

    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const journeys = await Promise.all(
        batch.map((l: any) => getLeadJourney(l.id).catch(() => null))
      );

      for (let j = 0; j < batch.length; j++) {
        const journey = journeys[j];
        if (!journey || !journey.metrics.stall_detected) continue;
        results.push({
          lead_id: (batch[j] as any).id,
          lead_name: (batch[j] as any).name || 'Unknown',
          company: (batch[j] as any).company || '',
          current_stage: journey.metrics.current_stage,
          days_since_last_touchpoint: journey.metrics.days_since_last_touchpoint,
          total_touchpoints: journey.metrics.total_touchpoints,
        });
      }
    }

    // Sort by days since last touchpoint descending (most stalled first)
    results.sort((a, b) => b.days_since_last_touchpoint - a.days_since_last_touchpoint);
    return results;
  });
}

// ---------------------------------------------------------------------------
// Journey map template CRUD
// ---------------------------------------------------------------------------

export async function getJourneyMaps(): Promise<any[]> {
  const { default: UserJourneyMap } = await import('../models/UserJourneyMap');
  return UserJourneyMap.findAll({
    where: { status: 'active' },
    order: [['created_at', 'DESC']],
  });
}

export async function getJourneyMapById(id: string): Promise<any | null> {
  const { default: UserJourneyMap } = await import('../models/UserJourneyMap');
  return UserJourneyMap.findByPk(id);
}

export async function createJourneyMap(data: {
  project_id: string;
  name: string;
  description?: string;
  stages?: any[];
  created_by?: string;
  metadata?: Record<string, any>;
}): Promise<any> {
  const { default: UserJourneyMap } = await import('../models/UserJourneyMap');

  if (!data.project_id || !data.name) {
    throw new Error('project_id and name are required');
  }

  console.log(`${LOG_PREFIX} Creating journey map: ${data.name}`);
  return UserJourneyMap.create(data as any);
}

export async function updateJourneyMap(id: string, data: Partial<{
  name: string;
  description: string;
  stages: any[];
  status: string;
  metadata: Record<string, any>;
}>): Promise<any> {
  const { default: UserJourneyMap } = await import('../models/UserJourneyMap');

  const map = await UserJourneyMap.findByPk(id);
  if (!map) throw new Error('Journey map not found');

  console.log(`${LOG_PREFIX} Updating journey map: ${id}`);
  await map.update(data);
  return map;
}
