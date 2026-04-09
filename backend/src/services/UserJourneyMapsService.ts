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

export async function getJourneyMaps(params?: {
  search?: string;
  status?: string;
  project_id?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: any[]; count: number }> {
  const { default: UserJourneyMap } = await import('../models/UserJourneyMap');

  const where: any = {};
  const page = params?.page || 1;
  const limit = Math.min(params?.limit || 25, 100);
  const offset = (page - 1) * limit;

  // Status filter (default to active)
  where.status = params?.status || 'active';

  // Project filter
  if (params?.project_id) {
    where.project_id = params.project_id;
  }

  // Search across name and description
  if (params?.search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${params.search}%` } },
      { description: { [Op.iLike]: `%${params.search}%` } },
    ];
  }

  const { rows, count } = await UserJourneyMap.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  console.log(`${LOG_PREFIX} Listed journey maps: ${count} total, page ${page}`);
  return { rows, count };
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

  console.log(`${LOG_PREFIX} Creating journey map: ${data.name} (project: ${data.project_id})`);
  const map = await UserJourneyMap.create(data as any);
  console.log(`${LOG_PREFIX} Created journey map ${(map as any).id}`);
  return map;
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

  console.log(`${LOG_PREFIX} Updating journey map ${id}: fields=[${Object.keys(data).join(', ')}]`);
  await map.update(data);
  return map;
}

// ---------------------------------------------------------------------------
// Persona journey map seeding
// ---------------------------------------------------------------------------

const PERSONA_JOURNEY_MAPS = [
  {
    name: 'Secondary User Persona Journey',
    description: 'End-to-end journey for secondary user personas (IT Managers, Data Scientists, Corporate Trainers) across awareness through evaluation phases.',
    stages: [
      {
        id: 'awareness',
        name: 'Awareness',
        description: 'Users become aware of the accelerator through marketing channels.',
        touchpoints: ['Social media', 'Webinars', 'Email campaigns'],
        goals: ['Understand the benefits of the accelerator'],
        pain_points: ['Lack of familiarity with the platform and its offerings'],
        order: 1,
      },
      {
        id: 'consideration',
        name: 'Consideration',
        description: 'Users evaluate the program, often through demos or consultations.',
        touchpoints: ['One-on-one meetings', 'Demo sessions', 'FAQs'],
        goals: ['Assess how the program aligns with organizational needs'],
        pain_points: ['Concerns about return on investment'],
        order: 2,
      },
      {
        id: 'onboarding',
        name: 'Onboarding',
        description: 'Users sign up and access the platform for the first time.',
        touchpoints: ['Onboarding emails', 'Guided tours', 'Support'],
        goals: ['Successfully navigate the platform and understand its functionalities'],
        pain_points: ['Information overload', 'Technical challenges'],
        order: 3,
      },
      {
        id: 'engagement',
        name: 'Engagement',
        description: 'Users actively participate in workshops, training sessions, and collaborative projects.',
        touchpoints: ['Online course materials', 'Community forums', 'Live Q&A sessions'],
        goals: ['Acquire knowledge and skills regarding AI'],
        pain_points: ['Time constraints and balancing commitments'],
        order: 4,
      },
      {
        id: 'evaluation',
        name: 'Evaluation',
        description: 'Users assess the impact of the program on their organization\'s AI capabilities.',
        touchpoints: ['Feedback surveys', 'Follow-up meetings', 'Performance analytics'],
        goals: ['Determine the effectiveness of AI initiatives'],
        pain_points: ['Difficulty in measuring AI\'s ROI'],
        order: 5,
      },
    ],
    metadata: { persona_type: 'secondary', source: 'build_guide' },
  },
];

export async function seedPersonaJourneyMaps(): Promise<{ created: number; skipped: number }> {
  const { default: UserJourneyMap } = await import('../models/UserJourneyMap');
  const { SYSTEM_PLATFORM_PROJECT_ID } = await import('./businessProcessSeedService');

  let created = 0, skipped = 0;

  for (const template of PERSONA_JOURNEY_MAPS) {
    const existing = await UserJourneyMap.findOne({
      where: { project_id: SYSTEM_PLATFORM_PROJECT_ID, name: template.name },
    });

    if (existing) { skipped++; continue; }

    await UserJourneyMap.create({
      project_id: SYSTEM_PLATFORM_PROJECT_ID,
      name: template.name,
      description: template.description,
      stages: template.stages,
      status: 'active',
      created_by: 'system',
      metadata: template.metadata,
    } as any);
    created++;
    console.log(`${LOG_PREFIX} Seeded journey map: ${template.name}`);
  }

  return { created, skipped };
}
