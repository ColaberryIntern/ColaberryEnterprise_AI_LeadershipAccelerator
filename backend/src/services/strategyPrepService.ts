import { StrategyPrepInput } from '../schemas/strategyPrepSchema';
import { FollowUpSequence, Campaign, ScheduledEmail, CampaignLead } from '../models';
import { enrollLeadInSequence } from './sequenceService';
import { env } from '../config/env';

const PREP_NUDGE_SEQUENCE_NAME = 'Strategy Call Readiness';
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
 * Cancel pending actions from a named sequence for a lead.
 * Used to suppress lower-priority campaigns when a lead advances in the funnel:
 *   Briefing Interest (awareness) → Strategy Call Readiness (decision) → No-Show Recovery (recovery)
 * Also marks the CampaignLead as completed with outcome 'superseded'.
 */
async function cancelCampaignActionsForLead(leadId: number, sequenceName: string): Promise<number> {
  const sequence = await FollowUpSequence.findOne({ where: { name: sequenceName } });
  if (!sequence) return 0;

  const [count] = await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { lead_id: leadId, sequence_id: sequence.id, status: 'pending' } }
  );

  if (count > 0) {
    const campaign = await Campaign.findOne({ where: { sequence_id: sequence.id } });
    if (campaign) {
      await CampaignLead.update(
        { status: 'completed', outcome: 'superseded' } as any,
        { where: { campaign_id: campaign.id, lead_id: leadId, status: 'active' } }
      );
    }
    console.log(`[PrepService] Cancelled ${count} pending "${sequenceName}" actions for lead ${leadId} (superseded)`);
  }

  return count;
}

/**
 * Enroll a lead in the strategy call readiness sequence.
 * Uses countdown scheduling: each action is scheduled backwards from the call time.
 * Actions whose countdown time is already past are auto-cancelled.
 * Injects the prep link + meeting details into each action's metadata.
 */
export async function enrollInPrepNudge(
  leadId: number,
  prepToken: string,
  meetLink?: string,
  scheduledAt?: Date,
): Promise<void> {
  const result = await findSequenceAndCampaign(PREP_NUDGE_SEQUENCE_NAME);
  if (!result) {
    console.warn('[PrepService] Readiness sequence not seeded yet. Skipping enrollment.');
    return;
  }

  const { sequence, campaign } = result;
  const prepLink = `${env.frontendUrl}/strategy-call-prep?token=${prepToken}`;

  try {
    // Cancel any pending Briefing Interest actions — lead has already booked a call
    await cancelCampaignActionsForLead(leadId, 'Executive Briefing Interest');

    const actions = await enrollLeadInSequence(leadId, sequence.id, campaign?.id);

    const meetingContext = [
      `IMPORTANT: Include this preparation form link prominently in the message: ${prepLink}`,
      meetLink ? `Meeting link (Google Meet): ${meetLink}` : '',
      scheduledAt ? `Scheduled call time: ${scheduledAt.toISOString()}` : '',
    ].filter(Boolean).join('\n');

    const now = new Date();
    let scheduled = 0;
    let cancelled = 0;

    for (let i = 0; i < actions.length; i++) {
      const step = sequence.steps[i];
      const action = actions[i];
      const updates: Record<string, any> = {
        metadata: {
          ...(action.metadata || {}),
          ai_context_notes: meetingContext,
          prep_token: prepToken,
        },
      };

      // Countdown scheduling: calculate scheduled_for backwards from call time
      const minutesBefore = (step as any).minutes_before_call;
      if (minutesBefore !== undefined && scheduledAt) {
        const countdownTime = new Date(scheduledAt.getTime() - minutesBefore * 60 * 1000);
        if (countdownTime <= now) {
          // This action's window has already passed — cancel it
          updates.status = 'cancelled';
          updates.scheduled_for = countdownTime;
          cancelled++;
        } else {
          updates.scheduled_for = countdownTime;
          scheduled++;
        }
      } else {
        scheduled++;
      }

      await action.update(updates as any);
    }

    // Mark step 0 (confirmation email) as sent — the actual email is sent by calendarController
    const confirmAction = actions[0];
    if (confirmAction && confirmAction.step_index === 0 && !(confirmAction as any).minutes_before_call) {
      await confirmAction.update({
        status: 'sent',
        sent_at: new Date(),
        attempts_made: 1,
      } as any);
    }

    // Update CampaignLead tracking: step 0 complete, set next action time
    if (campaign) {
      const nextPending = await ScheduledEmail.findOne({
        where: {
          campaign_id: campaign.id,
          lead_id: leadId,
          status: 'pending',
        },
        order: [['scheduled_for', 'ASC']],
      });

      await CampaignLead.update(
        {
          current_step_index: 0,
          last_activity_at: new Date(),
          next_action_at: nextPending ? nextPending.scheduled_for : null,
        } as any,
        { where: { campaign_id: campaign.id, lead_id: leadId } }
      );
    }

    console.log(
      `[PrepService] Enrolled lead ${leadId} in readiness countdown: 1 confirmation (sent), ${scheduled} scheduled, ${cancelled} auto-cancelled (past window)`
    );
  } catch (err: any) {
    console.error('[PrepService] Failed to enroll in readiness sequence:', err.message);
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
    // Cancel any pending Briefing Interest actions — no-show recovery takes priority
    await cancelCampaignActionsForLead(leadId, 'Executive Briefing Interest');

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
