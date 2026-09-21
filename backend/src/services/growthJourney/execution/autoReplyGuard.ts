import { Op } from 'sequelize';
import { env } from '../../../config/env';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { GrowthJourneyConversationOwnership, GrowthJourneyExecution } from '../../../models';
import { OPEN_EXECUTION_STATUSES } from '../../../models/GrowthJourneyExecution';
import { classifyError } from '../../../utils/errorClassifier';

/**
 * Should the inbound auto-reply stay silent for this lead? (Phase 5 T515.)
 *
 * The lead auto-reply generates a message nothing validates and sends it.
 * A lead the journey is in the middle of - an OPEN execution receipt on any
 * channel - or one a human has taken over - an open conversation-ownership
 * row (T402, `cleared_at IS NULL`) - must never meet it: the journey's own
 * sequence or the human is the conversation, and an ungrounded reply in the
 * middle of either is the failure Phase 5 exists to prevent.
 *
 * READ-ONLY, and it FAILS CLOSED: if the reads cannot answer, the answer is
 * "skip" - staying silent costs one auto-reply; guessing wrong sends an
 * unvalidated message into a conversation someone else owns (the same rule
 * the Explorer router applies above it). With the master flag off - production
 * today - it answers `null` before any read, so every existing campaign takes
 * exactly the path it took before.
 */

export type AutoReplySkipReason = 'open_receipt' | 'open_ownership' | 'guard_unavailable';

/**
 * T516: the same two facts for a LIST of leads - the Ali personal-outreach cron asks before it enrols anyone. Throws on a
 * read error: the cron fails closed by catching it (nobody enrolled that run), which is the caller's rule to own.
 */
export async function journeyOwnedLeadIds(leadIds: number[]): Promise<Set<number>> {
  if (leadIds.length === 0) return new Set();
  const [receipts, owners] = await Promise.all([
    GrowthJourneyExecution.findAll({ where: { lead_id: { [Op.in]: leadIds }, status: { [Op.in]: [...OPEN_EXECUTION_STATUSES] } }, attributes: ['lead_id'] }),
    GrowthJourneyConversationOwnership.findAll({ where: { lead_id: { [Op.in]: leadIds }, cleared_at: null }, attributes: ['lead_id'] }),
  ]);
  return new Set([...receipts, ...owners].map((r) => Number(r.get('lead_id'))));
}

export async function journeyAutoReplySkip(leadId: number, flags: GrowthJourneyFlags = env.growthJourney): Promise<AutoReplySkipReason | null> {
  if (!flags.growthJourneyEnabled) return null;
  try {
    const receipt = await GrowthJourneyExecution.findOne({ where: { lead_id: leadId, status: { [Op.in]: [...OPEN_EXECUTION_STATUSES] } }, attributes: ['id'] });
    if (receipt) return 'open_receipt';
    const ownership = await GrowthJourneyConversationOwnership.findOne({ where: { lead_id: leadId, cleared_at: null }, attributes: ['id'] });
    if (ownership) return 'open_ownership';
    return null;
  } catch (err: unknown) {
    console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event: 'growth_journey.auto_reply_guard_failed', outcome: 'failure', error_class: classifyError(err), context: { lead_id: leadId } }));
    return 'guard_unavailable';
  }
}
