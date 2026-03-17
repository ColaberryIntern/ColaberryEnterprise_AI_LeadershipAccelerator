import { Op } from 'sequelize';
import { FollowUpSequence, ScheduledEmail, Lead, CampaignLead, StrategyCall } from '../models';
import type { SequenceStep } from '../models/FollowUpSequence';
import type { CampaignChannel } from '../models/ScheduledEmail';

/* ------------------------------------------------------------------ */
/*  Sequence Step Timing Validation                                    */
/* ------------------------------------------------------------------ */

export interface StepValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  corrected?: SequenceStep[];
}

/**
 * Validate sequence step timing to prevent aggressive or broken cadences.
 *
 * Rules enforced:
 * - delay_days must be non-negative
 * - delay_days must be monotonically non-decreasing
 * - No duplicate delay_days for same-channel-category steps
 *   (email+sms on same day is allowed; email+email or voice+voice is not)
 * - Minimum 2-day gap between consecutive steps (except email+sms pairs)
 * - Voice steps must be at least 2 days from adjacent steps
 * - Max 12 steps per sequence
 * - Max 45 days total duration
 *
 * Campaigns that use minutes_before_call (e.g., Strategy Call Readiness)
 * are excluded from spacing rules when all steps share delay_days=0.
 */
export function validateSequenceSteps(steps: SequenceStep[]): StepValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!Array.isArray(steps) || steps.length === 0) {
    return { valid: false, errors: ['Sequence must have at least one step'], warnings };
  }

  if (steps.length > 12) {
    errors.push(`Sequence has ${steps.length} steps (max 12)`);
  }

  // Detect minutes_before_call campaigns (all steps at delay_days=0)
  const allZeroDelay = steps.every(s => (s.delay_days || 0) === 0);
  const usesMinutesBefore = allZeroDelay && steps.some(s => s.minutes_before_call != null);
  if (usesMinutesBefore) {
    // These campaigns use minutes_before_call for actual timing — skip spacing checks
    return { valid: errors.length === 0, warnings: ['Uses minutes_before_call timing — spacing rules skipped'], errors };
  }

  // Check each step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const delay = step.delay_days ?? 0;

    if (delay < 0) {
      errors.push(`Step ${i + 1}: delay_days is negative (${delay})`);
    }
  }

  // Sort by delay_days for gap analysis
  const sorted = steps
    .map((s, i) => ({ ...s, originalIndex: i, delay: s.delay_days ?? 0 }))
    .sort((a, b) => a.delay - b.delay);

  // Check max duration
  const maxDelay = sorted[sorted.length - 1]?.delay || 0;
  if (maxDelay > 45) {
    warnings.push(`Campaign duration is ${maxDelay} days (recommended max 45)`);
  }

  // Check monotonicity (original order should have non-decreasing delays)
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].delay_days ?? 0;
    const curr = steps[i].delay_days ?? 0;
    if (curr < prev) {
      errors.push(`Step ${i + 1} has delay_days=${curr} which is less than step ${i} delay_days=${prev} — delays must be non-decreasing`);
    }
  }

  // Check for same-day same-channel-category conflicts and spacing
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.delay - prev.delay;

    // Same-day check
    if (gap === 0) {
      const prevCat = prev.channel === 'voice' ? 'voice' : prev.channel;
      const currCat = curr.channel === 'voice' ? 'voice' : curr.channel;
      // email+sms on same day is acceptable
      const isCrossChannel =
        (prevCat === 'email' && currCat === 'sms') ||
        (prevCat === 'sms' && currCat === 'email');

      if (!isCrossChannel) {
        errors.push(
          `Steps at day ${curr.delay}: ${prev.channel} and ${curr.channel} scheduled same day — ` +
          `only email+sms pairs are allowed on the same day`
        );
      }
    }
    // Spacing check (skip for same-day email+sms which we already handled)
    else if (gap < 2) {
      const isCrossChannel =
        (prev.channel !== curr.channel) &&
        prev.channel !== 'voice' && curr.channel !== 'voice';
      if (isCrossChannel) {
        warnings.push(`Steps at day ${prev.delay}→${curr.delay}: only ${gap}-day gap (${prev.channel}→${curr.channel}), recommend 2+ days`);
      } else {
        errors.push(`Steps at day ${prev.delay}→${curr.delay}: only ${gap}-day gap (${prev.channel}→${curr.channel}), minimum 2 days required`);
      }
    }

    // Voice spacing check
    if (curr.channel === 'voice' || prev.channel === 'voice') {
      if (gap > 0 && gap < 2) {
        errors.push(`Voice step at day ${curr.channel === 'voice' ? curr.delay : prev.delay} is only ${gap} day(s) from adjacent step — voice needs 2+ day gap`);
      }
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}

/**
 * Auto-repair step timing by re-spacing delay_days values.
 * Preserves step order and content, only adjusts delay_days.
 *
 * @deprecated Use normalizeSequenceTiming() instead — it assigns deterministic
 * timing from scratch rather than trying to repair AI-provided values.
 */
export function autoRepairStepTiming(steps: SequenceStep[]): SequenceStep[] {
  return normalizeSequenceTiming(steps);
}

/* ------------------------------------------------------------------ */
/*  Deterministic Sequence Timing                                      */
/* ------------------------------------------------------------------ */

/**
 * Assign deterministic delay_days values to sequence steps based purely
 * on step order and channel type. AI-provided delay values are IGNORED.
 *
 * Rules:
 * - Step 1 always starts at day 0
 * - Minimum 2-day gap between consecutive steps
 * - Voice steps require a 3-day gap from the previous step
 * - Each step gets a unique day (one touch per day)
 * - email+sms on the same day is NOT allowed (keeps things simple and predictable)
 *
 * This function is the single source of truth for campaign timing.
 * The AI generates content and channels; this function generates timing.
 */
export function normalizeSequenceTiming(steps: SequenceStep[]): SequenceStep[] {
  if (steps.length === 0) return steps;

  // Detect minutes_before_call campaigns (e.g., Strategy Call Readiness)
  // These use a different timing model — preserve their delay_days=0 pattern.
  const allZeroDelay = steps.every(s => (s.delay_days || 0) === 0);
  const usesMinutesBefore = allZeroDelay && steps.some(s => s.minutes_before_call != null);
  if (usesMinutesBefore) {
    return steps.map(s => ({ ...s }));
  }

  const result = steps.map(s => ({ ...s }));
  result[0].delay_days = 0;

  for (let i = 1; i < result.length; i++) {
    const prevChannel = result[i - 1].channel || 'email';
    const currChannel = result[i].channel || 'email';
    const prevDelay = result[i - 1].delay_days ?? 0;

    // Voice steps (either current or previous) need a 3-day gap
    const gap = (currChannel === 'voice' || prevChannel === 'voice') ? 3 : 2;

    result[i].delay_days = prevDelay + gap;
  }

  return result;
}

interface CreateSequenceParams {
  name: string;
  description?: string;
  steps: SequenceStep[];
}

export async function createSequence(params: CreateSequenceParams) {
  // Normalize steps: ensure channel defaults to 'email'
  const normalizedSteps = params.steps.map((s) => ({
    ...s,
    channel: s.channel || 'email' as CampaignChannel,
    max_attempts: s.max_attempts || (s.channel === 'voice' ? 2 : 1),
    fallback_channel: s.fallback_channel || null,
  }));

  // Validate step timing (log warnings but don't block — callers may auto-repair)
  const validation = validateSequenceSteps(normalizedSteps);
  if (validation.warnings.length > 0) {
    console.log(`[Sequence] Timing warnings for "${params.name}":`, validation.warnings);
  }
  if (!validation.valid) {
    console.warn(`[Sequence] Timing errors for "${params.name}":`, validation.errors);
  }

  return FollowUpSequence.create({
    name: params.name,
    description: params.description || '',
    steps: normalizedSteps,
    is_active: true,
  } as any);
}

export async function listSequences() {
  return FollowUpSequence.findAll({
    order: [['created_at', 'DESC']],
  });
}

export async function getSequenceById(id: string) {
  return FollowUpSequence.findByPk(id);
}

export async function updateSequence(id: string, updates: Record<string, any>) {
  const seq = await FollowUpSequence.findByPk(id);
  if (!seq) return null;

  const allowedFields = ['name', 'description', 'steps', 'is_active'];
  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }
  filtered.updated_at = new Date();

  // Validate step timing when steps are being updated
  if (filtered.steps && Array.isArray(filtered.steps)) {
    const validation = validateSequenceSteps(filtered.steps);
    if (validation.warnings.length > 0) {
      console.log(`[Sequence] Timing warnings for update on ${id}:`, validation.warnings);
    }
    if (!validation.valid) {
      console.warn(`[Sequence] Timing errors for update on ${id}:`, validation.errors);
    }
  }

  await seq.update(filtered);
  return seq;
}

export async function deleteSequence(id: string) {
  const seq = await FollowUpSequence.findByPk(id);
  if (!seq) return false;

  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { sequence_id: id, status: 'pending' } }
  );

  await seq.destroy();
  return true;
}

export async function enrollLeadInSequence(leadId: number, sequenceId: string, campaignId?: string, force?: boolean) {
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error('Lead not found');

  // Guard: prevent test leads from being enrolled in production campaigns
  if (lead.source === 'campaign_test') {
    throw new Error('Cannot enroll test leads in production campaigns');
  }

  const sequence = await FollowUpSequence.findByPk(sequenceId);
  if (!sequence || !sequence.is_active) throw new Error('Sequence not found or inactive');

  // Idempotency guard: skip if lead already has active scheduled actions for this sequence.
  // This prevents duplicate ScheduledEmail creation when enrollment is called multiple times
  // (e.g., by cron jobs, agents, or concurrent requests).
  // Use force=true for intentional re-enrollment (e.g., lifecycle re-entry after re-engagement).
  if (!force) {
    const existingActive = await ScheduledEmail.count({
      where: {
        lead_id: leadId,
        sequence_id: sequenceId,
        status: { [Op.in]: ['pending', 'processing'] },
      },
    });
    if (existingActive > 0) {
      console.log(`[Sequence] Lead ${leadId} already has ${existingActive} pending actions for sequence ${sequenceId}, skipping re-enrollment`);
      // Still ensure CampaignLead exists
      if (campaignId) {
        try {
          await CampaignLead.findOrCreate({
            where: { campaign_id: campaignId, lead_id: leadId },
            defaults: {
              campaign_id: campaignId,
              lead_id: leadId,
              status: 'active',
              total_steps: sequence.steps.length,
            } as any,
          });
        } catch { /* non-blocking */ }
      }
      return [];
    }
  }

  // Cancel any existing pending actions for this lead from THIS sequence only
  // (preserves actions from other campaigns the lead may be enrolled in)
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { lead_id: leadId, sequence_id: sequenceId, status: 'pending' } }
  );

  const now = new Date();
  const scheduledActions = [];

  // Detect T-minus campaign (appointment-relative scheduling)
  const allZeroDelay = sequence.steps.every((s: SequenceStep) => (s.delay_days || 0) === 0);
  const isTMinus = allZeroDelay && sequence.steps.some((s: SequenceStep) => s.minutes_before_call != null);

  let appointmentTime: Date | null = null;
  if (isTMinus) {
    const strategyCall = await StrategyCall.findOne({
      where: { lead_id: leadId },
      order: [['scheduled_at', 'DESC']],
    });
    if (!strategyCall) {
      throw new Error('Cannot enroll in T-minus campaign: no appointment found for this lead');
    }
    appointmentTime = (strategyCall as any).scheduled_at;
    console.log(`[Sequence] T-minus campaign detected — scheduling relative to appointment at ${appointmentTime}`);
  }

  for (let i = 0; i < sequence.steps.length; i++) {
    const step = sequence.steps[i];
    const channel: CampaignChannel = step.channel || 'email';

    let scheduledFor: Date;
    if (isTMinus && appointmentTime && step.minutes_before_call != null) {
      scheduledFor = new Date(appointmentTime.getTime() - step.minutes_before_call * 60 * 1000);
      if (scheduledFor.getTime() < now.getTime()) {
        console.log(`[Sequence] Skipping step ${i + 1} — T-${step.minutes_before_call}min is already past`);
        continue;
      }
    } else {
      scheduledFor = new Date(now.getTime() + step.delay_days * 24 * 60 * 60 * 1000);
    }

    // Replace template variables in text content (fallback content)
    const replaceVars = (text: string) =>
      text
        .replace(/\{\{name\}\}/g, lead.name)
        .replace(/\{\{company\}\}/g, lead.company || '')
        .replace(/\{\{title\}\}/g, lead.title || '')
        .replace(/\{\{email\}\}/g, lead.email)
        .replace(/\{\{phone\}\}/g, lead.phone || '')
        .replace(/\{\{referred_by\}\}/g, (lead as any).alumni_context?.referred_by_name || '');

    const subject = replaceVars(step.subject || '');
    const body = replaceVars(
      channel === 'sms' && step.sms_template
        ? step.sms_template
        : step.body_template || ''
    );

    const action = await ScheduledEmail.create({
      lead_id: leadId,
      sequence_id: sequenceId,
      campaign_id: campaignId || null,
      step_index: i,
      channel,
      subject,
      body,
      to_email: lead.email,
      to_phone: lead.phone || null,
      voice_agent_type: channel === 'voice' ? (step.voice_agent_type || 'interest') : null,
      max_attempts: step.max_attempts || (channel === 'voice' ? 2 : 1),
      attempts_made: 0,
      fallback_channel: step.fallback_channel || null,
      scheduled_for: scheduledFor,
      status: 'pending',
      ai_instructions: step.ai_instructions || null,
      metadata: {
        step_goal: step.step_goal || null,
        ai_tone: step.ai_tone || null,
        ai_context_notes: step.ai_context_notes || null,
        voice_prompt: channel === 'voice' && step.voice_prompt ? step.voice_prompt : null,
      },
    } as any);

    scheduledActions.push(action);
  }

  // Create CampaignLead record so campaign UI shows lead count
  if (campaignId) {
    try {
      await CampaignLead.findOrCreate({
        where: { campaign_id: campaignId, lead_id: leadId },
        defaults: {
          campaign_id: campaignId,
          lead_id: leadId,
          status: 'active',
          total_steps: sequence.steps.length,
        } as any,
      });
    } catch (err: any) {
      console.warn('[Sequence] CampaignLead upsert failed (non-blocking):', err.message);
    }
  }

  return scheduledActions;
}

export async function cancelSequenceForLead(leadId: number) {
  const [count] = await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { lead_id: leadId, status: 'pending' } }
  );
  return count;
}

export async function getLeadSequenceStatus(leadId: number) {
  const emails = await ScheduledEmail.findAll({
    where: { lead_id: leadId },
    include: [{ model: FollowUpSequence, as: 'sequence', attributes: ['id', 'name'] }],
    order: [['step_index', 'ASC']],
  });

  return emails;
}
