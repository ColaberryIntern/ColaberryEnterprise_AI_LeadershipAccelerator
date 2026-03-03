import Lead from '../models/Lead';
import { logActivity } from './activityService';

/**
 * Pipeline stage ordering. 'lost' is terminal and handled separately.
 * Only forward progression is allowed through advancePipelineStage.
 */
const STAGE_ORDER: Record<string, number> = {
  new_lead: 0,
  contacted: 1,
  meeting_scheduled: 2,
  proposal_sent: 3,
  negotiation: 4,
  enrolled: 5,
};

/**
 * Advance a lead's pipeline stage forward (never backward, never from 'lost').
 * Returns true if the stage was actually changed, false if skipped.
 */
export async function advancePipelineStage(
  leadId: number,
  targetStage: string,
  trigger: string,
): Promise<boolean> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return false;

  const currentStage = lead.pipeline_stage || 'new_lead';

  // Never auto-advance a 'lost' lead
  if (currentStage === 'lost') return false;

  const currentRank = STAGE_ORDER[currentStage];
  const targetRank = STAGE_ORDER[targetStage];

  if (targetRank === undefined) return false;

  // Only advance forward
  if (currentRank !== undefined && currentRank >= targetRank) return false;

  await lead.update({ pipeline_stage: targetStage, updated_at: new Date() });

  await logActivity({
    lead_id: leadId,
    type: 'status_change',
    subject: `Pipeline auto-advanced: ${currentStage} → ${targetStage}`,
    metadata: { from_stage: currentStage, to_stage: targetStage, trigger },
  });

  console.log(`[Pipeline] Lead ${leadId}: ${currentStage} → ${targetStage} (${trigger})`);
  return true;
}
