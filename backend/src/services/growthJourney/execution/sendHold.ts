import { Op } from 'sequelize';
import { resolveExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import { resolveGrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { GrowthJourneyExecution } from '../../../models';
import { OPEN_EXECUTION_STATUSES } from '../../../models/GrowthJourneyExecution';
import { classifyError } from '../../../utils/errorClassifier';
import { campaignKeyOwnership } from './campaignKeys';
import { resolveExecutionHold, type ExecutionChannel } from './resolveExecutionMode';

/**
 * The send-time journey hold (Phase 5 T511): the ONE question the send path
 * asks the journey, and only for a campaign whose key is registered - every
 * other campaign never reaches this module (the caller decides that with an
 * in-memory registry check and a lazy require; see communicationSafetyService
 * step 3.7).
 *
 * READ-ONLY. It reads the lead's open receipt for the campaign and asks T504's
 * `resolveExecutionHold` - flags, the kill switch, the pauses; never a rollout,
 * a cohort or a daily limit, which govern what may be PLANNED next, not what
 * is already in flight. A pause set between enrolment and step 3 of a
 * sequence therefore stops step 3 (Scenario K at send time).
 *
 * ─── WHO OWNS THE KEY DECIDES WHAT AN ERROR MEANS ──────────────────────────
 *
 *   - no open receipt: not held. A manual enrolment into a registered
 *     campaign is not the journey's to stop.
 *   - the receipt read fails:
 *       `journey`-owned key  -> held, `journey_hold_unavailable`: every
 *                               enrolment into that campaign is the journey's.
 *       `shared` key         -> not held, logged `journey_hold_lookup_failed`:
 *                               the Ali campaign's ordinary sends keep today's
 *                               outcome; the kill switch still stops them by
 *                               pausing the campaign (step 2 of evaluateSend).
 *   - a receipt IS found and the hold resolver fails (an unreadable kill
 *     switch): held, `journey_hold_unavailable`, for shared keys too - that is
 *     a known journey send, and no ordinary send reaches this branch.
 */

export interface JourneyHoldInput {
  leadId: number;
  campaignId: string;
  campaignKey: string;
  asOf?: Date;
}

export type JourneyHoldResult = { held: false; reason: null } | { held: true; reason: string };

const NOT_HELD: JourneyHoldResult = Object.freeze({ held: false, reason: null });

function log(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event, outcome: 'failure', error_class: classifyError(err), context }));
}

export async function checkJourneyHold(input: JourneyHoldInput): Promise<JourneyHoldResult> {
  const ownership = campaignKeyOwnership(input.campaignKey);
  if (ownership === null) return NOT_HELD;
  const context = { campaign_id: input.campaignId, campaign_key: input.campaignKey, ownership };

  let receipt: GrowthJourneyExecution | null;
  try {
    receipt = await GrowthJourneyExecution.findOne({
      where: { lead_id: input.leadId, campaign_id: input.campaignId, status: { [Op.in]: [...OPEN_EXECUTION_STATUSES] } },
      attributes: ['id', 'tenant_id', 'brand_id', 'program_id', 'subject_ref', 'lead_id', 'channel'],
    });
  } catch (err: unknown) {
    if (ownership === 'shared') {
      log('growth_journey.send_hold.journey_hold_lookup_failed', err, context);
      return NOT_HELD;
    }
    log('growth_journey.send_hold.journey_hold_unavailable', err, context);
    return { held: true, reason: 'journey_hold_unavailable' };
  }
  if (!receipt) return NOT_HELD;

  try {
    const hold = await resolveExecutionHold({
      tenantId: String(receipt.get('tenant_id')),
      brandId: String(receipt.get('brand_id')),
      programId: String(receipt.get('program_id') ?? ''),
      channel: receipt.get('channel') as ExecutionChannel,
      subjectRef: String(receipt.get('subject_ref')),
      leadId: input.leadId,
      asOf: input.asOf ?? new Date(),
      flags: resolveGrowthJourneyFlags(),
      explorerFlags: resolveExplorerGrowthFlags(),
    });
    return hold.held ? { held: true, reason: `journey_hold:${hold.reason}` } : NOT_HELD;
  } catch (err: unknown) {
    log('growth_journey.send_hold.journey_hold_unavailable', err, { ...context, execution_id: String(receipt.get('id')) });
    return { held: true, reason: 'journey_hold_unavailable' };
  }
}
