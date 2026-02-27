import { StrategyPrepInput } from '../schemas/strategyPrepSchema';
import { FollowUpSequence, Campaign, ScheduledEmail } from '../models';
import { enrollLeadInSequence } from './sequenceService';
import { env } from '../config/env';

const PREP_NUDGE_SEQUENCE_NAME = 'Strategy Call Prep Nudge';
const NO_SHOW_SEQUENCE_NAME = 'Strategy Call No-Show Recovery';

/**
 * Calculate completion score (0-100) based on filled fields.
 *
 * Core fields (60%): challenges, maturity, team size, use case, timeline, tools — 10 pts each
 * File upload (20%): uploaded file
 * Budget + consulting (10%): 5 pts each
 * Questions + context (10%): 5 pts each
 */
export function calculateCompletionScore(
  data: StrategyPrepInput,
  hasUploadedFile: boolean
): number {
  let score = 0;

  // Core fields — 10 pts each = 60
  if (data.primary_challenges.length > 0) score += 10;
  if (data.ai_maturity_level) score += 10;
  if (data.team_size) score += 10;
  if (data.priority_use_case && data.priority_use_case.trim().length > 0) score += 10;
  if (data.timeline_urgency) score += 10;
  if (data.current_tools && data.current_tools.length > 0) score += 10;

  // File upload — 20 pts
  if (hasUploadedFile) score += 20;

  // Budget + consulting — 5 pts each = 10
  if (data.budget_range && data.budget_range.trim().length > 0) score += 5;
  if (data.evaluating_consultants !== undefined) score += 5;

  // Questions + context — 5 pts each = 10
  if (data.specific_questions && data.specific_questions.trim().length > 0) score += 5;
  if (data.additional_context && data.additional_context.trim().length > 0) score += 5;

  return score;
}

/** Find a sequence and its campaign by name. Returns null if not seeded yet. */
async function findSequenceAndCampaign(sequenceName: string): Promise<{
  sequence: InstanceType<typeof FollowUpSequence>;
  campaign: InstanceType<typeof Campaign> | null;
} | null> {
  const sequence = await FollowUpSequence.findOne({
    where: { name: sequenceName },
  });
  if (!sequence) return null;

  const campaign = await Campaign.findOne({
    where: { sequence_id: sequence.id, status: 'active' },
  });

  return { sequence, campaign };
}

/**
 * Enroll a lead in the prep nudge sequence.
 * Injects the prep link into each scheduled action's metadata so the AI can include it.
 */
export async function enrollInPrepNudge(leadId: number, prepToken: string): Promise<void> {
  const result = await findSequenceAndCampaign(PREP_NUDGE_SEQUENCE_NAME);
  if (!result) {
    console.warn('[PrepService] Prep nudge sequence not seeded yet. Skipping enrollment.');
    return;
  }

  const { sequence, campaign } = result;
  const prepLink = `${env.frontendUrl}/strategy-call-prep?token=${prepToken}`;

  try {
    const actions = await enrollLeadInSequence(leadId, sequence.id, campaign?.id);

    // Inject prep link into each action's metadata so AI can include it in content
    for (const action of actions) {
      await action.update({
        metadata: {
          ...(action.metadata || {}),
          ai_context_notes: `IMPORTANT: Include this preparation form link prominently in the message: ${prepLink}`,
          prep_token: prepToken,
        },
      } as any);
    }

    console.log(`[PrepService] Enrolled lead ${leadId} in prep nudge (${actions.length} actions)`);
  } catch (err: any) {
    console.error('[PrepService] Failed to enroll in prep nudge:', err.message);
  }
}

/**
 * Cancel pending prep nudge actions for a lead.
 * Only cancels actions from the nudge sequence, not from other campaigns.
 */
export async function cancelPrepNudge(leadId: number): Promise<number> {
  const result = await findSequenceAndCampaign(PREP_NUDGE_SEQUENCE_NAME);
  if (!result) return 0;

  const [count] = await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    {
      where: {
        lead_id: leadId,
        sequence_id: result.sequence.id,
        status: 'pending',
      },
    }
  );

  if (count > 0) {
    console.log(`[PrepService] Cancelled ${count} pending nudge actions for lead ${leadId}`);
  }

  return count;
}

/**
 * Enroll a lead in the no-show recovery sequence.
 */
export async function enrollInNoShowRecovery(leadId: number): Promise<void> {
  const result = await findSequenceAndCampaign(NO_SHOW_SEQUENCE_NAME);
  if (!result) {
    console.warn('[PrepService] No-show recovery sequence not seeded yet. Skipping enrollment.');
    return;
  }

  const { sequence, campaign } = result;
  const bookingLink = `${env.frontendUrl}/strategy-call`;

  try {
    const actions = await enrollLeadInSequence(leadId, sequence.id, campaign?.id);

    // Inject booking link into metadata for AI context
    for (const action of actions) {
      await action.update({
        metadata: {
          ...(action.metadata || {}),
          ai_context_notes: `Include this booking/reschedule link: ${bookingLink}`,
        },
      } as any);
    }

    console.log(`[PrepService] Enrolled lead ${leadId} in no-show recovery (${actions.length} actions)`);
  } catch (err: any) {
    console.error('[PrepService] Failed to enroll in no-show recovery:', err.message);
  }
}
