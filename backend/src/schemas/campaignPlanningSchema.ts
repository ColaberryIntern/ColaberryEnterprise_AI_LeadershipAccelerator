import { z } from 'zod';
import { CAMPAIGN_FUNNEL_STAGES } from '../models/Campaign';

/**
 * Request contracts for the campaign PLANNING fields added alongside the marketing build.
 *
 * WHY THIS IMPORTS THE MODEL'S CONSTANT INSTEAD OF LISTING THE STAGES AGAIN.
 *
 * `funnel_stage` is stored as a plain string column. There is no database CHECK constraint on
 * it, and adding one was rejected deliberately: `campaigns` is a live table, so a CHECK would
 * validate every existing row at boot, which is exactly the class of statement this
 * workstream's DDL rules forbid. That makes THIS the only enforcement point between a request
 * body and a column the ranking logic later branches on.
 *
 * An enforcement point that keeps its own copy of the allowed values is worse than none,
 * because it looks authoritative while drifting. Deriving the enum from
 * `CAMPAIGN_FUNNEL_STAGES` means adding a sixth stage is one edit in one file, and it is
 * impossible for the validator to reject a value the model considers legal.
 */

/** The five funnel stages, straight from the model's own list. */
export const CampaignFunnelStageSchema = z.enum(CAMPAIGN_FUNNEL_STAGES);

export type CampaignFunnelStageInput = z.infer<typeof CampaignFunnelStageSchema>;

/**
 * Patch body for the planning fields.
 *
 * `.nullable()` on funnel_stage is intentional and distinct from omitting the key: sending
 * `null` CLEARS the stage (a campaign whose objective is genuinely undecided), while omitting
 * it leaves the current value alone. Collapsing those two would make "I don't know yet"
 * unexpressible, and the usual workaround for that is a fake sixth stage.
 */
export const CampaignPlanningPatchSchema = z.object({
  funnel_stage: CampaignFunnelStageSchema.nullable().optional(),
  planned_start_at: z.coerce.date().nullable().optional(),
  planned_end_at: z.coerce.date().nullable().optional(),
  owner_admin_id: z.string().uuid().nullable().optional(),
  approver_admin_id: z.string().uuid().nullable().optional(),
});

export type CampaignPlanningPatch = z.infer<typeof CampaignPlanningPatchSchema>;
