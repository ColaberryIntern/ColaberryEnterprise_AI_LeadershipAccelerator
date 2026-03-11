import { Op } from 'sequelize';
import { Campaign, FollowUpSequence, CampaignVariant } from '../models';
import { generateMessage } from './aiMessageService';
import type { EvolutionConfig } from './autonomousRampService';

// ── Types ────────────────────────────────────────────────────────────────

interface VariantPerformance {
  id: string;
  variant_label: string;
  status: string;
  sends: number;
  score: number;
}

// ── Check Evolution Trigger ──────────────────────────────────────────────

/**
 * Returns true if evolution should run for this campaign.
 * Triggers: >= 100 sends since last evolution OR >= 24 hours.
 */
export function checkEvolutionTrigger(evolutionConfig: EvolutionConfig): boolean {
  if (!evolutionConfig || !evolutionConfig.enabled) return false;

  if (evolutionConfig.sends_since_last_evolution >= evolutionConfig.evolution_frequency_sends) {
    return true;
  }

  if (evolutionConfig.last_evolution_at) {
    const hoursSince = (Date.now() - new Date(evolutionConfig.last_evolution_at).getTime()) / (1000 * 60 * 60);
    if (hoursSince >= evolutionConfig.evolution_frequency_hours) {
      return true;
    }
  } else {
    // Never evolved — trigger if at least some sends exist
    return evolutionConfig.sends_since_last_evolution > 0;
  }

  return false;
}

// ── Generate Variants ────────────────────────────────────────────────────

/**
 * Generate new message variants for a specific campaign step.
 * Uses the AI message engine with evolution-specific instructions.
 */
export async function generateVariants(
  campaignId: string,
  stepIndex: number,
  channel: string,
): Promise<string[]> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  const evolutionConfig: EvolutionConfig = campaign.evolution_config;
  if (!evolutionConfig?.enabled) return [];

  // Load the sequence step to get original ai_instructions
  const sequence = campaign.sequence_id
    ? await FollowUpSequence.findByPk(campaign.sequence_id, { raw: true }) as any
    : null;

  if (!sequence?.steps?.[stepIndex]) return [];
  const step = sequence.steps[stepIndex];

  // Get current best variant or original instructions
  const currentBest = await CampaignVariant.findOne({
    where: {
      campaign_id: campaignId,
      step_index: stepIndex,
      channel,
      status: { [Op.in]: ['promoted', 'active'] },
    },
    order: [['performance_score', 'DESC NULLS LAST']],
  }) as any;

  const baseInstructions = currentBest?.ai_instructions_override || step.ai_instructions || '';
  const baseSubject = currentBest?.subject || step.subject || '';

  // Count existing active/testing variants
  const activeCount = await CampaignVariant.count({
    where: {
      campaign_id: campaignId,
      step_index: stepIndex,
      channel,
      status: { [Op.in]: ['active', 'testing'] },
    },
  });

  const maxVariants = evolutionConfig.max_active_variants || 3;
  const slotsAvailable = maxVariants - activeCount;
  if (slotsAvailable <= 0) return [];

  const variantsToGenerate = Math.min(2, slotsAvailable);
  const createdIds: string[] = [];

  // Determine next variant labels
  const allVariants = await CampaignVariant.findAll({
    where: { campaign_id: campaignId, step_index: stepIndex, channel },
    attributes: ['variant_label'],
    raw: true,
  }) as any[];
  const usedLabels = new Set(allVariants.map((v: any) => v.variant_label));

  const dimensions = [
    'subject line (make it more compelling, curiosity-driven, or personal)',
    'call to action (try a different CTA: question, direct ask, soft suggestion)',
    'message length (make it shorter/punchier or add a key detail)',
    'tone and phrasing (adjust warmth, urgency, or conversational style)',
  ];

  for (let i = 0; i < variantsToGenerate; i++) {
    const label = getNextLabel(usedLabels);
    usedLabels.add(label);
    const dimension = dimensions[Math.floor(Math.random() * dimensions.length)];

    try {
      const evolutionPrompt = buildEvolutionPrompt(
        baseInstructions,
        baseSubject,
        channel,
        dimension,
        campaign.ai_system_prompt,
        campaign.goals,
        evolutionConfig.similarity_threshold,
      );

      const result = await generateMessage({
        channel: channel as 'email' | 'sms' | 'voice',
        ai_instructions: evolutionPrompt,
        lead: {
          name: '{{name}}',
          company: '{{company}}',
          title: '{{title}}',
          industry: '{{industry}}',
          email: '{{email}}',
        } as any,
        campaignContext: {
          type: campaign.type,
          name: campaign.name,
          step_goal: step.step_goal || '',
          step_number: stepIndex,
          total_steps: sequence.steps.length,
          system_prompt: campaign.ai_system_prompt,
        },
      });

      const variant = await CampaignVariant.create({
        campaign_id: campaignId,
        step_index: stepIndex,
        channel,
        variant_label: label,
        subject: result.subject || null,
        body: result.body,
        ai_instructions_override: evolutionPrompt,
        status: 'testing',
        parent_variant_id: currentBest?.id || null,
        generation_metadata: {
          dimension_modified: dimension,
          tokens_used: result.tokens_used,
          model: result.model,
          base_variant: currentBest?.variant_label || 'original',
          similarity_threshold: evolutionConfig.similarity_threshold,
        },
      } as any);

      createdIds.push(variant.id);
      console.log(`[Evolution] Generated variant ${label} for campaign ${campaignId} step ${stepIndex} (${dimension})`);
    } catch (err: any) {
      console.error(`[Evolution] Failed to generate variant for campaign ${campaignId} step ${stepIndex}:`, err.message);
    }
  }

  return createdIds;
}

// ── Evaluate Variants ────────────────────────────────────────────────────

/**
 * Evaluate variant performance and promote/retire based on metrics.
 */
export async function evaluateVariants(campaignId: string): Promise<{
  promoted: string[];
  retired: string[];
}> {
  const result = { promoted: [] as string[], retired: [] as string[] };

  // Get all active and testing variants for this campaign
  const variants = await CampaignVariant.findAll({
    where: {
      campaign_id: campaignId,
      status: { [Op.in]: ['active', 'testing', 'promoted'] },
    },
  }) as any[];

  // Group by step_index + channel
  const groups: Record<string, typeof variants> = {};
  for (const v of variants) {
    const key = `${v.step_index}:${v.channel}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }

  for (const [_key, groupVariants] of Object.entries(groups)) {
    // Calculate performance scores
    const scored: VariantPerformance[] = groupVariants.map((v: any) => ({
      id: v.id,
      variant_label: v.variant_label,
      status: v.status,
      sends: v.sends,
      score: v.sends > 0
        ? (v.opens * 1 + v.replies * 5 + v.conversions * 10 - v.bounces * 3) / v.sends
        : 0,
    }));

    // Update performance scores
    for (const s of scored) {
      await CampaignVariant.update(
        { performance_score: s.score, updated_at: new Date() } as any,
        { where: { id: s.id } },
      );
    }

    // Find current promoted variant
    const promoted = scored.find(s => s.status === 'promoted');
    const promotedScore = promoted?.score || 0;
    const MIN_SENDS = 30;

    for (const s of scored) {
      if (s.status !== 'testing') continue;
      if (s.sends < MIN_SENDS) continue;

      // Testing variant outperforms promoted by >= 10%
      if (promoted && s.score > promotedScore * 1.10) {
        await CampaignVariant.update(
          { status: 'promoted', updated_at: new Date() } as any,
          { where: { id: s.id } },
        );
        await CampaignVariant.update(
          { status: 'retired', updated_at: new Date() } as any,
          { where: { id: promoted.id } },
        );
        result.promoted.push(s.variant_label);
        result.retired.push(promoted.variant_label);
        console.log(`[Evolution] Promoted ${s.variant_label} (score: ${s.score.toFixed(2)}) → retired ${promoted.variant_label} (score: ${promotedScore.toFixed(2)})`);

      } else if (promoted && s.score < promotedScore * 0.80) {
        // Testing variant underperforms by >= 20%
        await CampaignVariant.update(
          { status: 'retired', updated_at: new Date() } as any,
          { where: { id: s.id } },
        );
        result.retired.push(s.variant_label);
        console.log(`[Evolution] Retired underperforming ${s.variant_label} (score: ${s.score.toFixed(2)} vs ${promotedScore.toFixed(2)})`);

      } else if (!promoted && s.score > 0) {
        // No promoted variant yet — promote the first one with positive score
        await CampaignVariant.update(
          { status: 'promoted', updated_at: new Date() } as any,
          { where: { id: s.id } },
        );
        result.promoted.push(s.variant_label);
        console.log(`[Evolution] First promotion: ${s.variant_label} (score: ${s.score.toFixed(2)})`);
      }
    }
  }

  return result;
}

// ── Select Variant for Send ──────────────────────────────────────────────

/**
 * Called by the scheduler before sending a message.
 * Returns a variant to use based on traffic split:
 *   - Promoted: 70% of traffic
 *   - Testing: split remaining 30%
 * Returns null if no variants exist (use original content).
 */
export async function selectVariantForSend(
  campaignId: string,
  stepIndex: number,
  channel: string,
): Promise<any | null> {
  const variants = await CampaignVariant.findAll({
    where: {
      campaign_id: campaignId,
      step_index: stepIndex,
      channel,
      status: { [Op.in]: ['promoted', 'testing'] },
    },
  }) as any[];

  if (variants.length === 0) return null;

  const promoted = variants.filter((v: any) => v.status === 'promoted');
  const testing = variants.filter((v: any) => v.status === 'testing');

  const roll = Math.random();

  // 70% chance to use promoted variant
  if (promoted.length > 0 && roll < 0.70) {
    return promoted[Math.floor(Math.random() * promoted.length)];
  }

  // 30% chance to test — pick a random testing variant
  if (testing.length > 0) {
    return testing[Math.floor(Math.random() * testing.length)];
  }

  // Fallback to promoted
  if (promoted.length > 0) {
    return promoted[0];
  }

  return null;
}

// ── Admin Controls ───────────────────────────────────────────────────────

export async function freezeEvolution(campaignId: string): Promise<void> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  const config: EvolutionConfig = campaign.evolution_config || {};
  config.enabled = false;
  await campaign.update({ evolution_config: config, updated_at: new Date() });
  console.log(`[Evolution] Frozen for campaign ${campaignId}`);
}

export async function unfreezeEvolution(campaignId: string): Promise<void> {
  const campaign = await Campaign.findByPk(campaignId) as any;
  if (!campaign) throw new Error('Campaign not found');

  const config: EvolutionConfig = campaign.evolution_config || {};
  config.enabled = true;
  await campaign.update({ evolution_config: config, updated_at: new Date() });
  console.log(`[Evolution] Unfrozen for campaign ${campaignId}`);
}

export async function approveVariant(variantId: string): Promise<void> {
  const variant = await CampaignVariant.findByPk(variantId) as any;
  if (!variant) throw new Error('Variant not found');

  // Retire any existing promoted variant for same step/channel
  await CampaignVariant.update(
    { status: 'retired', updated_at: new Date() } as any,
    {
      where: {
        campaign_id: variant.campaign_id,
        step_index: variant.step_index,
        channel: variant.channel,
        status: 'promoted',
      },
    },
  );

  await variant.update({ status: 'promoted', updated_at: new Date() });
  console.log(`[Evolution] Admin approved variant ${variant.variant_label} → promoted`);
}

export async function rejectVariant(variantId: string): Promise<void> {
  const variant = await CampaignVariant.findByPk(variantId) as any;
  if (!variant) throw new Error('Variant not found');

  await variant.update({ status: 'retired', updated_at: new Date() });
  console.log(`[Evolution] Admin rejected variant ${variant.variant_label} → retired`);
}

// ── Run Evolution Engine (cron entry point) ──────────────────────────────

/**
 * Cron job: check evolution triggers and generate/evaluate variants for autonomous campaigns.
 */
export async function runEvolutionEngine(): Promise<{
  campaigns_checked: number;
  variants_generated: number;
  variants_promoted: number;
  variants_retired: number;
}> {
  const stats = { campaigns_checked: 0, variants_generated: 0, variants_promoted: 0, variants_retired: 0 };

  const campaigns = await Campaign.findAll({
    where: {
      status: 'active',
      campaign_mode: 'autonomous',
    },
    raw: true,
  }) as any[];

  for (const campaign of campaigns) {
    const evolutionConfig: EvolutionConfig = campaign.evolution_config;
    if (!evolutionConfig?.enabled) continue;

    stats.campaigns_checked++;

    try {
      // Evaluate existing variants first
      const evalResult = await evaluateVariants(campaign.id);
      stats.variants_promoted += evalResult.promoted.length;
      stats.variants_retired += evalResult.retired.length;

      // Check if evolution should trigger
      if (!checkEvolutionTrigger(evolutionConfig)) continue;

      // Load sequence steps
      const sequence = campaign.sequence_id
        ? await FollowUpSequence.findByPk(campaign.sequence_id, { raw: true }) as any
        : null;

      if (!sequence?.steps?.length) continue;

      // Generate variants for each step
      for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];
        const ids = await generateVariants(campaign.id, i, step.channel || 'email');
        stats.variants_generated += ids.length;
      }

      // Update evolution config timestamps
      const campaignFull = await Campaign.findByPk(campaign.id) as any;
      const updatedConfig = { ...evolutionConfig };
      updatedConfig.last_evolution_at = new Date().toISOString();
      updatedConfig.sends_since_last_evolution = 0;
      await campaignFull.update({ evolution_config: updatedConfig, updated_at: new Date() });

    } catch (err: any) {
      console.error(`[Evolution] Error processing campaign ${campaign.id}:`, err.message);
    }
  }

  if (stats.campaigns_checked > 0) {
    console.log(`[Evolution] Engine: ${stats.campaigns_checked} campaigns — ${stats.variants_generated} generated, ${stats.variants_promoted} promoted, ${stats.variants_retired} retired`);
  }
  return stats;
}

// ── Internal Helpers ─────────────────────────────────────────────────────

function getNextLabel(usedLabels: Set<string>): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    if (!usedLabels.has(letter)) return letter;
  }
  return `V${usedLabels.size + 1}`;
}

function buildEvolutionPrompt(
  baseInstructions: string,
  baseSubject: string,
  channel: string,
  dimension: string,
  systemPrompt: string | null,
  goals: string | null,
  similarityThreshold: number,
): string {
  return `You are evolving a campaign message to improve engagement.

ORIGINAL MESSAGE INSTRUCTIONS:
${baseInstructions}

${baseSubject ? `ORIGINAL SUBJECT: ${baseSubject}` : ''}

DIMENSION TO MODIFY: ${dimension}

RULES:
1. The new message must remain at least ${Math.round(similarityThreshold * 100)}% similar to the original in meaning and structure.
2. You MUST retain all references to Ali Kursun and Colaberry.
3. You MUST maintain the campaign objective${goals ? `: ${goals}` : ''}.
4. ${channel === 'sms' ? 'Keep SMS under 160 characters.' : 'Keep email under 200 words.'}
5. Make ONE meaningful change in the specified dimension.
6. The message should feel natural and personalized, not like a variant test.

${systemPrompt ? `CAMPAIGN CONTEXT:\n${systemPrompt}` : ''}

Generate a fresh ${channel} message with the modification applied. Do NOT explain what you changed.`;
}
