import { Op } from 'sequelize';
import { Campaign, CampaignLead, CampaignHealth, Lead } from '../models';
import { enrollLeadsInCampaign } from './campaignService';

// ── Types ────────────────────────────────────────────────────────────────

export interface RampState {
  current_phase: number;
  phase_sizes: number[];
  leads_enrolled_per_phase: Record<string, number>;
  phase_started_at: string | null;
  phase_health_score: number | null;
  status: 'ramping' | 'evaluating' | 'paused_for_review' | 'complete';
  evaluation_history: Array<{
    phase: number;
    health_score: number;
    decision: string;
    at: string;
  }>;
}

export interface EvolutionConfig {
  enabled: boolean;
  evolution_frequency_sends: number;
  evolution_frequency_hours: number;
  last_evolution_at: string | null;
  sends_since_last_evolution: number;
  similarity_threshold: number;
  max_active_variants: number;
}

const DEFAULT_PHASE_SIZES = [20, 80, 200, -1]; // -1 = remaining

const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  enabled: true,
  evolution_frequency_sends: 100,
  evolution_frequency_hours: 24,
  last_evolution_at: null,
  sends_since_last_evolution: 0,
  similarity_threshold: 0.70,
  max_active_variants: 3,
};

// ── Initialize Ramp ──────────────────────────────────────────────────────

/**
 * Called when an autonomous campaign is activated.
 * Sets up ramp state, evolution config, and enrolls the first batch.
 */
export async function initializeRamp(campaignId: string): Promise<RampState> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  const rampState: RampState = {
    current_phase: 1,
    phase_sizes: DEFAULT_PHASE_SIZES,
    leads_enrolled_per_phase: { '1': 0, '2': 0, '3': 0, '4': 0 },
    phase_started_at: new Date().toISOString(),
    phase_health_score: null,
    status: 'ramping',
    evaluation_history: [],
  };

  await campaign.update({
    ramp_state: rampState,
    evolution_config: DEFAULT_EVOLUTION_CONFIG,
    updated_at: new Date(),
  });

  // Enroll the first batch
  const enrolledCount = await enrollPhaseBatch(campaignId, rampState, 1);
  rampState.leads_enrolled_per_phase['1'] = enrolledCount;

  await campaign.update({ ramp_state: rampState });

  console.log(`[Ramp] Initialized campaign ${campaignId}: phase 1, ${enrolledCount} leads enrolled`);
  return rampState;
}

// ── Evaluate Ramp Phase ──────────────────────────────────────────────────

/**
 * Called by cron every 2 hours for active autonomous campaigns.
 * Reads health score and decides whether to advance, hold, or pause.
 */
export async function evaluateRampPhase(campaignId: string): Promise<{
  decision: 'advance' | 'hold' | 'pause_for_review' | 'already_complete' | 'no_data';
  health_score: number | null;
}> {
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;
  if (!campaign) throw new Error('Campaign not found');

  const rampState: RampState = campaign.ramp_state;
  if (!rampState || rampState.status === 'complete') {
    return { decision: 'already_complete', health_score: null };
  }

  if (rampState.status === 'paused_for_review') {
    return { decision: 'pause_for_review', health_score: rampState.phase_health_score };
  }

  // Check if current phase has enough data (at least 24h since phase started)
  const phaseStarted = rampState.phase_started_at ? new Date(rampState.phase_started_at) : null;
  if (phaseStarted) {
    const hoursSinceStart = (Date.now() - phaseStarted.getTime()) / (1000 * 60 * 60);
    if (hoursSinceStart < 24) {
      return { decision: 'hold', health_score: null };
    }
  }

  // Get health score
  const health = await CampaignHealth.findOne({
    where: { campaign_id: campaignId },
    raw: true,
  }) as any;

  const healthScore = health?.health_score ?? null;
  if (healthScore === null) {
    return { decision: 'no_data', health_score: null };
  }

  // Decision logic
  const campaignFull = await Campaign.findByPk(campaignId) as any;

  if (healthScore >= 70) {
    // Advance to next phase
    const nextPhase = rampState.current_phase + 1;
    if (nextPhase > rampState.phase_sizes.length) {
      // All phases complete
      rampState.status = 'complete';
      rampState.phase_health_score = healthScore;
      rampState.evaluation_history.push({
        phase: rampState.current_phase,
        health_score: healthScore,
        decision: 'complete',
        at: new Date().toISOString(),
      });
      await campaignFull.update({ ramp_state: rampState, updated_at: new Date() });
      console.log(`[Ramp] Campaign ${campaignId}: all phases complete (score: ${healthScore})`);
      return { decision: 'advance', health_score: healthScore };
    }

    rampState.evaluation_history.push({
      phase: rampState.current_phase,
      health_score: healthScore,
      decision: 'advance',
      at: new Date().toISOString(),
    });

    rampState.current_phase = nextPhase;
    rampState.phase_started_at = new Date().toISOString();
    rampState.phase_health_score = healthScore;
    rampState.status = 'ramping';

    await campaignFull.update({ ramp_state: rampState, updated_at: new Date() });

    // Enroll next batch
    const enrolledCount = await enrollPhaseBatch(campaignId, rampState, nextPhase);
    rampState.leads_enrolled_per_phase[String(nextPhase)] = enrolledCount;
    await campaignFull.update({ ramp_state: rampState });

    console.log(`[Ramp] Campaign ${campaignId}: advanced to phase ${nextPhase}, ${enrolledCount} leads enrolled (score: ${healthScore})`);
    return { decision: 'advance', health_score: healthScore };

  } else if (healthScore >= 50) {
    // Hold — wait for next evaluation
    rampState.phase_health_score = healthScore;
    rampState.status = 'evaluating';
    await campaignFull.update({ ramp_state: rampState, updated_at: new Date() });

    console.log(`[Ramp] Campaign ${campaignId}: holding at phase ${rampState.current_phase} (score: ${healthScore})`);
    return { decision: 'hold', health_score: healthScore };

  } else {
    // Pause for review — health too low
    rampState.phase_health_score = healthScore;
    rampState.status = 'paused_for_review';
    rampState.evaluation_history.push({
      phase: rampState.current_phase,
      health_score: healthScore,
      decision: 'paused_for_review',
      at: new Date().toISOString(),
    });
    await campaignFull.update({ ramp_state: rampState, updated_at: new Date() });

    console.log(`[Ramp] Campaign ${campaignId}: PAUSED for review at phase ${rampState.current_phase} (score: ${healthScore})`);
    return { decision: 'pause_for_review', health_score: healthScore };
  }
}

// ── Manual Advance ───────────────────────────────────────────────────────

/**
 * Admin override to manually advance to next ramp phase.
 */
export async function manualAdvanceRamp(campaignId: string): Promise<RampState> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  const rampState: RampState = campaign.ramp_state;
  if (!rampState) throw new Error('Campaign has no ramp state');
  if (rampState.status === 'complete') throw new Error('Ramp already complete');

  const nextPhase = rampState.current_phase + 1;
  if (nextPhase > rampState.phase_sizes.length) {
    rampState.status = 'complete';
    rampState.evaluation_history.push({
      phase: rampState.current_phase,
      health_score: rampState.phase_health_score || 0,
      decision: 'manual_complete',
      at: new Date().toISOString(),
    });
    await campaign.update({ ramp_state: rampState, updated_at: new Date() });
    return rampState;
  }

  rampState.evaluation_history.push({
    phase: rampState.current_phase,
    health_score: rampState.phase_health_score || 0,
    decision: 'manual_advance',
    at: new Date().toISOString(),
  });

  rampState.current_phase = nextPhase;
  rampState.phase_started_at = new Date().toISOString();
  rampState.status = 'ramping';

  await campaign.update({ ramp_state: rampState, updated_at: new Date() });

  const enrolledCount = await enrollPhaseBatch(campaignId, rampState, nextPhase);
  rampState.leads_enrolled_per_phase[String(nextPhase)] = enrolledCount;
  await campaign.update({ ramp_state: rampState });

  console.log(`[Ramp] Campaign ${campaignId}: manually advanced to phase ${nextPhase}, ${enrolledCount} leads enrolled`);
  return rampState;
}

// ── Get Ramp Status ──────────────────────────────────────────────────────

export async function getRampStatus(campaignId: string): Promise<{
  ramp_state: RampState | null;
  total_enrolled: number;
  total_available: number;
}> {
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;
  if (!campaign) throw new Error('Campaign not found');

  const totalEnrolled = await CampaignLead.count({
    where: { campaign_id: campaignId },
  });

  // Count available leads matching targeting criteria
  const tc = campaign.targeting_criteria || {};
  const leadWhere: Record<string, any> = {};
  if (tc.lead_source_type) leadWhere.lead_source_type = tc.lead_source_type;

  const totalAvailable = await Lead.count({ where: leadWhere });

  return {
    ramp_state: campaign.ramp_state || null,
    total_enrolled: totalEnrolled,
    total_available: totalAvailable,
  };
}

// ── Run Ramp Evaluator (cron entry point) ────────────────────────────────

/**
 * Cron job: evaluate all active autonomous campaigns in ramping/evaluating state.
 */
export async function runRampEvaluator(): Promise<{
  evaluated: number;
  advanced: number;
  held: number;
  paused: number;
}> {
  const stats = { evaluated: 0, advanced: 0, held: 0, paused: 0 };

  const campaigns = await Campaign.findAll({
    where: {
      status: 'active',
      campaign_mode: 'autonomous',
    },
    raw: true,
  }) as any[];

  const rampCampaigns = campaigns.filter((c: any) => {
    const rs = c.ramp_state;
    return rs && ['ramping', 'evaluating'].includes(rs.status);
  });

  for (const campaign of rampCampaigns) {
    try {
      stats.evaluated++;
      const result = await evaluateRampPhase(campaign.id);
      if (result.decision === 'advance') stats.advanced++;
      else if (result.decision === 'hold' || result.decision === 'no_data') stats.held++;
      else if (result.decision === 'pause_for_review') stats.paused++;
    } catch (err: any) {
      console.error(`[Ramp] Error evaluating campaign ${campaign.id}:`, err.message);
    }
  }

  if (stats.evaluated > 0) {
    console.log(`[Ramp] Evaluator: ${stats.evaluated} campaigns — ${stats.advanced} advanced, ${stats.held} held, ${stats.paused} paused`);
  }
  return stats;
}

// ── Internal: Enroll Phase Batch ─────────────────────────────────────────

async function enrollPhaseBatch(
  campaignId: string,
  rampState: RampState,
  phase: number,
): Promise<number> {
  const campaign = await Campaign.findByPk(campaignId, { raw: true }) as any;
  if (!campaign) return 0;

  const phaseSize = rampState.phase_sizes[phase - 1];

  // Get already-enrolled lead IDs
  const enrolled = await CampaignLead.findAll({
    where: { campaign_id: campaignId },
    attributes: ['lead_id'],
    raw: true,
  }) as any[];
  const enrolledIds = new Set(enrolled.map((cl: any) => cl.lead_id));

  // Find matching leads not yet enrolled
  const tc = campaign.targeting_criteria || {};
  const leadWhere: Record<string, any> = {};
  if (tc.lead_source_type) leadWhere.lead_source_type = tc.lead_source_type;
  if (tc.lead_source_types?.length) {
    leadWhere.lead_source_type = { [Op.in]: tc.lead_source_types };
  }

  const availableLeads = await Lead.findAll({
    where: leadWhere,
    attributes: ['id'],
    raw: true,
  }) as any[];

  const unenrolledIds = availableLeads
    .map((l: any) => l.id)
    .filter((id: number) => !enrolledIds.has(id));

  if (unenrolledIds.length === 0) return 0;

  // Shuffle for random selection
  for (let i = unenrolledIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unenrolledIds[i], unenrolledIds[j]] = [unenrolledIds[j], unenrolledIds[i]];
  }

  // Select batch size (-1 means all remaining)
  const batchSize = phaseSize === -1 ? unenrolledIds.length : Math.min(phaseSize, unenrolledIds.length);
  const batchIds = unenrolledIds.slice(0, batchSize);

  if (batchIds.length === 0) return 0;

  const results = await enrollLeadsInCampaign(campaignId, batchIds);
  return results.filter((r: any) => r.status === 'enrolled' || r.status === 'already_enrolled').length;
}
