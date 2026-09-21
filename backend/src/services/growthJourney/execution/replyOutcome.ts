import { Op } from 'sequelize';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { GrowthJourneyExecution } from '../../../models';
import { OPEN_EXECUTION_STATUSES } from '../../../models/GrowthJourneyExecution';
import { classifyError } from '../../../utils/errorClassifier';
import { recordOutcome } from '../outcomes/outcomeRecorder';
import { EXECUTION_OUTCOME_SOURCE } from './reconcileExecutions';

/**
 * The reply as an outcome on its receipt (Phase 5 T515): a lead who replies
 * to a campaign a journey execution enrolled them in has `contact_replied`
 * recorded on that receipt - the one place a receipt's send and its answer
 * meet.
 *
 * ─── WHICH RECEIPT ──────────────────────────────────────────────────────────
 *
 * The lead's receipt for the replied-to campaign that is still OPEN, or that
 * COMPLETED within COMPLETED_REPLY_WINDOW_DAYS (a reply to the last step of a
 * sequence lands after the receipt settled). Newest first. No campaign, or no
 * such receipt → no outcome; a reply to a manual enrolment or an old campaign
 * is not the journey's to claim.
 *
 * ─── ONE REPLY, ONE OUTCOME ─────────────────────────────────────────────────
 *
 * The key is `(growth_journey_executions, <receipt>:reply:<provider message
 * id>)` - the receipt AND the message, so two receipts for one lead get their
 * own outcome and a webhook delivered twice lands on the first row (the
 * recorder's replay). Without a provider id the day stands in for it. The
 * reconciler never writes this type: the webhook sees a reply first.
 */

export const COMPLETED_REPLY_WINDOW_DAYS = 14;
const DAY = 86_400_000;

export interface RecordReplyOutcomeArgs {
  leadId: number;
  campaignId: string | null;
  providerMessageId: string | null;
  flags: GrowthJourneyFlags;
  asOf?: Date;
}

export type RecordReplyOutcomeResult =
  | { status: 'disabled' }
  | { status: 'no_campaign' }
  | { status: 'no_receipt' }
  | { status: 'recorded' | 'replayed'; execution_id: string; source_ref: string }
  | { status: 'failed'; error_class: string };

/** The provider's message id with its angle brackets off, or the day, so the key is stable across redeliveries. */
export function replyKeyOf(providerMessageId: string | null, asOf: Date): string {
  const id = providerMessageId?.replace(/[<>\s]/g, '') ?? '';
  return id.length > 0 ? id : `day:${asOf.toISOString().slice(0, 10)}`;
}

export async function recordReplyOutcome(args: RecordReplyOutcomeArgs): Promise<RecordReplyOutcomeResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyExecution', args.flags)) return { status: 'disabled' };
  if (!args.campaignId) return { status: 'no_campaign' };
  const asOf = args.asOf ?? new Date();
  try {
    const receipt = await GrowthJourneyExecution.findOne({
      where: {
        lead_id: args.leadId,
        campaign_id: args.campaignId,
        [Op.or]: [
          { status: { [Op.in]: [...OPEN_EXECUTION_STATUSES] } },
          { status: 'completed', updated_at: { [Op.gte]: new Date(asOf.getTime() - COMPLETED_REPLY_WINDOW_DAYS * DAY) } },
        ],
      },
      order: [['created_at', 'DESC']],
    });
    if (!receipt) return { status: 'no_receipt' };
    const executionId = String(receipt.get('id'));
    const sourceRef = `${executionId}:reply:${replyKeyOf(args.providerMessageId, asOf)}`;
    const r = await recordOutcome({
      tenant_id: String(receipt.get('tenant_id')), brand_id: String(receipt.get('brand_id')), subject_ref: String(receipt.get('subject_ref')),
      lead_id: args.leadId, decision_id: String(receipt.get('decision_id')),
      outcome_type: 'contact_replied', source: EXECUTION_OUTCOME_SOURCE, source_ref: sourceRef, occurred_at: asOf,
      metadata: { campaign_id: args.campaignId },
    });
    return { status: r.replayed ? 'replayed' : 'recorded', execution_id: executionId, source_ref: sourceRef };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event: 'growth_journey.reply.outcome_failed', outcome: 'failure', error_class, context: { lead_id: args.leadId, campaign_id: args.campaignId } }));
    return { status: 'failed', error_class };
  }
}
