import { isKillSwitchActive } from '../../launchSafety';
import { advancePipelineStage } from '../../pipelineService';
import { STAGE_BY_DISPOSITION, type IntegratingDisposition } from './dispositions';

/**
 * The pipeline advance: a human's disposition moves `leads.pipeline_stage`
 * forward, through the existing writer only (Phase 4 T406).
 *
 * `advancePipelineStage` is forward-only by construction - it compares ranks
 * and refuses to move backward, refuses a `lost` lead, and logs the activity.
 * This file adds nothing to that rule; the stage a human's verdict may imply
 * is `STAGE_BY_DISPOSITION` in `./dispositions` (pure, so the machine can ask
 * without loading this writer).
 *
 * A lead already at or past the implied stage is `not_advanced` (the writer's
 * `false`): correct, not a failure, and no outcome is recorded for it - the
 * stage it already holds is T409's to index.
 */

/** The activity trigger the existing writer records; `growth_journey:handoff:<id>` names the human's row. */
export const pipelineTrigger = (handoffId: string) => `growth_journey:handoff:${handoffId}`;

export interface PipelineAdvanceInput {
  leadId: number;
  disposition: IntegratingDisposition;
  handoffId: string;
}

export type PipelineAdvanceResult =
  | { status: 'refused'; reason: 'kill_switch_active' }
  | { status: 'advanced'; stage: string; trigger: string }
  | { status: 'not_advanced'; stage: string; trigger: string };

export async function advanceForDisposition(input: PipelineAdvanceInput): Promise<PipelineAdvanceResult> {
  if (await isKillSwitchActive()) return { status: 'refused', reason: 'kill_switch_active' };
  const stage = STAGE_BY_DISPOSITION[input.disposition];
  const trigger = pipelineTrigger(input.handoffId);
  const advanced = await advancePipelineStage(input.leadId, stage, trigger);
  return { status: advanced ? 'advanced' : 'not_advanced', stage, trigger };
}
