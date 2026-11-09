import type ScheduledEmail from '../models/ScheduledEmail';
import type { Transaction, WhereOptions } from 'sequelize';

/**
 * R3 - every cancellation of a scheduled message states WHY, machine-readably.
 *
 * Measured 2026-10-29: of the messages cancelled in the previous 30 days, 13,643 recorded no reason at all. A
 * cancellation with no reason is indistinguishable from one nobody chose, which is how a dead channel went quiet for
 * 71 days unnoticed. Every write that sets a scheduled_emails row to 'cancelled' goes through this module, and
 * __tests__/scheduledEmailCancellationGuard.test.ts fails if a new one does not.
 *
 * WHAT IS WRITTEN: `metadata.cancel_reason` (one of CANCEL_REASONS), MERGED into the existing metadata. Older keys a
 * site already wrote (blocked_reason, expired_reason, cancelled_reason) are kept, so nothing that reads them changes.
 * No column is added: metadata is JSONB and the merge is done in SQL for bulk cancels, in JS for a single row.
 */

export const CANCEL_REASONS = [
  'expired_stale',              // scheduler: too long past scheduled_for
  'campaign_inactive',          // scheduler: the campaign is archived, paused, completed or draft
  'lead_paid',                  // scheduler: payment reminder for an enrollment already paid
  'cohort_started',             // scheduler: payment reminder after the cohort start
  'test_action_non_test_domain',// scheduler: a test action aimed at a real address
  'safety_blocked',             // scheduler: communicationSafety refused (detail in blocked_reason)
  'campaign_deleted',           // campaignService.deleteCampaign
  'campaign_completed',         // campaignService.completeCampaign
  'lead_removed_from_campaign', // campaignService.removeLeadFromCampaign
  'sequence_deleted',           // sequenceService.deleteSequence
  'sequence_reenrolled',        // sequenceService: replaced by a fresh enrollment in the same sequence
  'sequence_cancelled_for_lead',// sequenceService.cancelSequenceForLead
  'converted_to_student',       // acceleratorService: the lead enrolled
  'moved_to_strategy_call',     // synthflow webhook: hot lead moved to Strategy Call Readiness
  'sms_opt_out',                // smsOptOutProcessor
  'lead_opted_out',             // unsubscribeEnforcementService
  'superseded_by_strategy_prep',// strategyPrepService: campaign actions replaced by the prep sequence
  'prep_window_passed',         // strategyPrepService: a countdown step whose moment already passed
  'prep_nudge_cancelled',       // strategyPrepService.cancelPrepNudge
  'test_harness_cleanup',       // testing/campaignTestHarness
  'test_action_not_retried',    // self-healing agent: test actions are never retried
  'lead_not_sendable',          // repair / self-healing agents: the lead can no longer be contacted
  'agent_draft_discarded',      // agents/tools/agentEmailInboxService: a reviewer discarded an AI-drafted email (raw SQL)
] as const;

export type CancelReason = typeof CANCEL_REASONS[number];

export function isCancelReason(v: unknown): v is CancelReason {
  return typeof v === 'string' && (CANCEL_REASONS as readonly string[]).includes(v);
}

/** The values to write on ONE row: status plus the reason merged into that row's own metadata. */
export function cancelledValues(reason: CancelReason, metadata?: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  return { status: 'cancelled', metadata: { ...(metadata || {}), ...extra, cancel_reason: reason } } as const;
}

/** Cancel one already-loaded row, keeping its metadata. */
export async function cancelScheduledEmail(row: ScheduledEmail, reason: CancelReason, extra: Record<string, unknown> = {}): Promise<void> {
  await row.update(cancelledValues(reason, row.metadata ?? null, extra) as Partial<ScheduledEmail>);
}

/** Bulk cancel: the reason is merged into each row's existing metadata in SQL. Returns the number of rows cancelled. */
export async function cancelScheduledEmails(
  where: WhereOptions, reason: CancelReason, opts: { transaction?: Transaction; extra?: Record<string, unknown> } = {},
): Promise<number> {
  const patch = { ...(opts.extra || {}), cancel_reason: reason };
  // Loaded lazily: importing this module must not open the database (callers' unit tests mock only what they use).
  const { sequelize } = await import('../config/database');
  const { default: ScheduledEmailModel } = await import('../models/ScheduledEmail');
  const [count] = await ScheduledEmailModel.update(
    { status: 'cancelled', metadata: sequelize.literal(`COALESCE(metadata, '{}'::jsonb) || ${sequelize.escape(JSON.stringify(patch))}::jsonb`) } as never,
    { where, transaction: opts.transaction },
  );
  return count;
}
