import { Op } from 'sequelize';
import { GrowthJourneyExecution, GrowthJourneyInAppNudge, ProposedAgentAction, ScheduledEmail } from '../../../models';
import { OPEN_EXECUTION_STATUSES, type GrowthJourneyExecutionAttributes, type GrowthJourneyExecutionStatus } from '../../../models/GrowthJourneyExecution';
import { classifyError } from '../../../utils/errorClassifier';
import { recordOutcome, type RecordOutcomeInput } from '../outcomes/outcomeRecorder';
import { assertTransition, canTransition, recordReceiptTransition } from './receiptTransitions';

/**
 * Reconciliation, retries and expiry (Phase 5 T512): the pass that makes a
 * receipt say what the campaign engine actually did, returns work that never
 * happened, and lets nothing hold a person's one open slot forever. Bounded
 * (RECONCILE_LIMIT receipts a run, oldest-touched first) and idempotent: a
 * second run over the same world writes no second outcome and no second
 * ledger row.
 *
 *   enrolled / in_progress  the lead's scheduled_emails for the campaign since
 *                           the claim. Any `sent` -> in_progress, and completed
 *                           once none is pending, processing or paused; all
 *                           `cancelled` -> blocked:<the scheduler's blocked_reason>;
 *                           every row settled without a send -> failed. Each
 *                           settled row is one outcome, keyed (receipt, row).
 *   enrolling               older than ENROLLING_STALE_MINUTES with no id: the
 *                           row an interrupted enrolment DID create is attached
 *                           -> enrolled; else back to approved while attempts <
 *                           MAX_ENROL_ATTEMPTS; else failed / retries_exhausted.
 *                           This module cannot enrol: the sequence service is not
 *                           importable here (the no-send scanner), so a missing
 *                           row is never re-created, only re-claimed by the adapter.
 *   approved                older than APPROVED_TTL_HOURS -> expired.
 *   pending_review          whose proposal has expired -> expired, the proposal
 *                           too (the flip a late approve makes, conditional on
 *                           `pending`).
 *
 * Every move is conditional on the status it was read at, so a row the adapter
 * moved between the read and the write is left to the adapter; a move that
 * takes writes one ledger row. Ids and reasons only: the scheduler's
 * `blocked_reason` is a reason string (`journey_hold:pause:brand`,
 * `rate_limited`); a value that is not one is replaced, never copied.
 * A reply is T515's to record (the webhook sees it first); it is not read here.
 */

export const RECONCILE_LIMIT = 500;
export const ENROLLING_STALE_MINUTES = 15;
export const APPROVED_TTL_HOURS = 72;
export const MAX_ENROL_ATTEMPTS = 3;
/** The outcome index's `source` for a receipt's contact outcomes: the table, as every other member of the union is spelled. */
export const EXECUTION_OUTCOME_SOURCE = 'growth_journey_executions' as const;
const OPEN_EMAIL_STATUSES: readonly string[] = ['pending', 'processing', 'paused'];

export interface ReconcileArgs {
  asOf: Date;
  limit?: number;
}

export interface ReconcileSummary {
  scanned: number;
  moved: Partial<Record<GrowthJourneyExecutionStatus, number>>;
  outcomes: { recorded: number; replayed: number };
  errors: Array<{ execution_id: string; error_class: string }>;
}

type Receipt = GrowthJourneyExecution;
type Extra = Record<string, string | number | boolean | null | string[]>;
type ContactOutcomeType = Extract<RecordOutcomeInput['outcome_type'], 'contact_sent' | 'contact_blocked' | 'contact_failed'>;
interface EmailRow { id: string; status: string; sent_at: Date | string | null; created_at: Date | string; metadata: Record<string, unknown> | null }

const field = <T,>(r: Receipt, k: keyof GrowthJourneyExecutionAttributes): T => r.get(k as string) as T;
const at = (v: Date | string | null | undefined): Date | null => (v ? new Date(v) : null);
/** The scheduler's reason for a cancelled row lives in its metadata, not a column (`schedulerService`'s cancel write). */
const blockedReasonOf = (e: EmailRow): string => safeReason(e.metadata?.blocked_reason);
const MINUTE = 60_000;
const HOUR = 3_600_000;

/** A reason string is copied only when it looks like one: non-empty, bounded, and never an address. */
export function safeReason(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0) return 'unknown';
  return v.includes('@') ? 'reason_redacted' : v.slice(0, 120);
}

/** A transition conditional on the status the receipt was read at; the ledger row only when the move took. */
async function move(receipt: Receipt, from: GrowthJourneyExecutionStatus, to: GrowthJourneyExecutionStatus, reason: string, patch: Partial<GrowthJourneyExecutionAttributes>, summary: ReconcileSummary, extra: Extra = {}): Promise<boolean> {
  assertTransition(from, to);
  const id = field<string>(receipt, 'id');
  const [moved] = await GrowthJourneyExecution.update({ status: to, status_reason: reason, ...patch }, { where: { id, status: from } });
  if (moved === 0) return false;
  await recordReceiptTransition(id, { tenant_id: field<string>(receipt, 'tenant_id'), brand_id: field<string>(receipt, 'brand_id') }, from, to, reason, {
    decision_id: field<string>(receipt, 'decision_id'), channel: field<string>(receipt, 'channel'), ...extra,
  }, 'growth_journey_reconciler');
  summary.moved[to] = (summary.moved[to] ?? 0) + 1;
  return true;
}

/** One contact outcome per settled scheduled row, keyed (receipt, row) so a second pass lands on the first row. */
async function contactOutcome(receipt: Receipt, type: ContactOutcomeType, email: EmailRow, occurredAt: Date, metadata: Record<string, unknown> | null, summary: ReconcileSummary): Promise<void> {
  const r = await recordOutcome({
    tenant_id: field<string>(receipt, 'tenant_id'), brand_id: field<string>(receipt, 'brand_id'), subject_ref: field<string>(receipt, 'subject_ref'),
    lead_id: field<number | null>(receipt, 'lead_id'), decision_id: field<string>(receipt, 'decision_id'),
    outcome_type: type, source: EXECUTION_OUTCOME_SOURCE, source_ref: `${field<string>(receipt, 'id')}:${email.id}`, occurred_at: occurredAt, metadata,
  });
  if (r.replayed) summary.outcomes.replayed += 1;
  else summary.outcomes.recorded += 1;
}

async function reconcileEnrolled(receipt: Receipt, status: 'enrolled' | 'in_progress', asOf: Date, summary: ReconcileSummary): Promise<void> {
  const leadId = field<number | null>(receipt, 'lead_id');
  const campaignId = field<string | null>(receipt, 'campaign_id');
  const claimedAt = at(field<Date | string | null>(receipt, 'claimed_at'));
  // An in-app receipt has no scheduled rows; its nudge's shown/dismissed life is the portal's to reconcile (Phase 6).
  if (leadId === null || !campaignId || !claimedAt) return;
  const emails = (await ScheduledEmail.findAll({
    where: { lead_id: leadId, campaign_id: campaignId, created_at: { [Op.gte]: claimedAt } },
    attributes: ['id', 'status', 'sent_at', 'created_at', 'metadata'],
    order: [['created_at', 'ASC']],
  })) as unknown as EmailRow[];
  if (emails.length === 0) return;

  const sent = emails.filter((e) => e.status === 'sent');
  const cancelled = emails.filter((e) => e.status === 'cancelled');
  const failed = emails.filter((e) => e.status === 'failed');
  const open = emails.filter((e) => OPEN_EMAIL_STATUSES.includes(e.status));
  for (const e of sent) await contactOutcome(receipt, 'contact_sent', e, at(e.sent_at) ?? at(e.created_at) ?? asOf, null, summary);
  for (const e of cancelled) await contactOutcome(receipt, 'contact_blocked', e, asOf, { blocked_reason: blockedReasonOf(e) }, summary);
  for (const e of failed) await contactOutcome(receipt, 'contact_failed', e, asOf, null, summary);
  const counts: Extra = { sent: sent.length, cancelled: cancelled.length, failed: failed.length, open: open.length };

  if (sent.length > 0) {
    let from: 'enrolled' | 'in_progress' = status;
    if (from === 'enrolled' && (await move(receipt, 'enrolled', 'in_progress', 'first_send_recorded', {}, summary, counts))) from = 'in_progress';
    if (open.length === 0) await move(receipt, from, 'completed', 'sequence_settled', { outcome: cancelled.length + failed.length > 0 ? 'partial' : 'sent' }, summary, counts);
    return;
  }
  if (open.length > 0) return; // nothing settled yet, nothing sent yet
  if (cancelled.length === emails.length) {
    await move(receipt, status, 'blocked', `blocked:${blockedReasonOf(cancelled[0])}`, { outcome: 'blocked' }, summary, counts);
    return;
  }
  await move(receipt, status, 'failed', failed.length === emails.length ? 'failed:send' : 'failed:send_and_blocked', { outcome: 'failed', last_error_class: 'SendFailed' }, summary, counts);
}

async function reconcileEnrolling(receipt: Receipt, asOf: Date, summary: ReconcileSummary): Promise<void> {
  const claimedAt = at(field<Date | string | null>(receipt, 'claimed_at'));
  if (claimedAt && asOf.getTime() - claimedAt.getTime() < ENROLLING_STALE_MINUTES * MINUTE) return;
  const receiptId = field<string>(receipt, 'id');
  const attempts = Number(field<number | null>(receipt, 'attempts') ?? 0);

  // The row an interrupted enrolment created is attached; nothing is created here.
  if (field<string>(receipt, 'channel') === 'in_app') {
    const nudge = await GrowthJourneyInAppNudge.findOne({ where: { execution_id: receiptId }, attributes: ['id'] });
    if (nudge) {
      const nudgeId = String(nudge.get('id'));
      await move(receipt, 'enrolling', 'enrolled', 'attached_after_interruption', { nudge_id: nudgeId }, summary, { nudge_id: nudgeId, attempts });
      return;
    }
  } else {
    const leadId = field<number | null>(receipt, 'lead_id');
    const campaignId = field<string | null>(receipt, 'campaign_id');
    if (leadId !== null && campaignId && claimedAt) {
      const step0 = await ScheduledEmail.findOne({ where: { lead_id: leadId, campaign_id: campaignId, step_index: 0, created_at: { [Op.gte]: claimedAt } }, attributes: ['id'], order: [['created_at', 'ASC']] });
      if (step0) {
        const scheduledEmailId = String(step0.get('id'));
        await move(receipt, 'enrolling', 'enrolled', 'attached_after_interruption', { scheduled_email_id: scheduledEmailId }, summary, { scheduled_email_id: scheduledEmailId, attempts });
        return;
      }
    }
  }
  if (attempts < MAX_ENROL_ATTEMPTS) {
    await move(receipt, 'enrolling', 'approved', 'enrolment_interrupted', { claimed_at: null }, summary, { attempts });
    return;
  }
  await move(receipt, 'enrolling', 'failed', 'retries_exhausted', { outcome: 'failed', last_error_class: 'RetriesExhausted' }, summary, { attempts });
}

async function reconcileApproved(receipt: Receipt, asOf: Date, summary: ReconcileSummary): Promise<void> {
  const since = at(field<Date | string | null>(receipt, 'approved_at')) ?? at(field<Date | string | null>(receipt, 'created_at'));
  if (!since || asOf.getTime() - since.getTime() <= APPROVED_TTL_HOURS * HOUR) return;
  await move(receipt, 'approved', 'expired', 'approval_expired', { outcome: 'expired' }, summary, { approved_at: since.toISOString() });
}

async function reconcilePendingReview(receipt: Receipt, asOf: Date, summary: ReconcileSummary): Promise<void> {
  const proposalId = field<string | null>(receipt, 'proposal_id');
  if (!proposalId) return;
  const proposal = await ProposedAgentAction.findOne({ where: { id: proposalId }, attributes: ['id', 'status', 'expires_at'] });
  if (!proposal) return;
  const expiresAt = at(proposal.get('expires_at') as Date | string | null);
  if (!expiresAt || expiresAt.getTime() >= asOf.getTime()) return;
  // The proposal first (the flip a late approve makes), then the receipt: a run cut between the two heals on the next.
  if (proposal.get('status') === 'pending') await ProposedAgentAction.update({ status: 'expired' }, { where: { id: proposalId, status: 'pending' } });
  await move(receipt, 'pending_review', 'expired', 'proposal_expired', { outcome: 'expired' }, summary, { proposal_id: proposalId });
}

export async function reconcileExecutions(args: ReconcileArgs): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { scanned: 0, moved: {}, outcomes: { recorded: 0, replayed: 0 }, errors: [] };
  const receipts = await GrowthJourneyExecution.findAll({
    where: { status: { [Op.in]: [...OPEN_EXECUTION_STATUSES] } },
    order: [['updated_at', 'ASC']],
    limit: args.limit ?? RECONCILE_LIMIT,
  });
  for (const receipt of receipts) {
    summary.scanned += 1;
    const status = field<GrowthJourneyExecutionStatus>(receipt, 'status');
    try {
      if (status === 'enrolled' || status === 'in_progress') await reconcileEnrolled(receipt, status, args.asOf, summary);
      else if (status === 'enrolling') await reconcileEnrolling(receipt, args.asOf, summary);
      else if (status === 'approved') await reconcileApproved(receipt, args.asOf, summary);
      else if (status === 'pending_review') await reconcilePendingReview(receipt, args.asOf, summary);
    } catch (err: unknown) {
      // One receipt's failure is one line and one summary entry; the next receipt still runs. Ids only.
      const error_class = classifyError(err);
      console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event: 'growth_journey.reconcile.receipt_failed', outcome: 'failure', error_class, context: { execution_id: field<string>(receipt, 'id'), status } }));
      summary.errors.push({ execution_id: field<string>(receipt, 'id'), error_class });
    }
  }
  return summary;
}

/** The edges this pass walks, for the test that pins them against the machine. */
export const RECONCILER_EDGES: ReadonlyArray<[GrowthJourneyExecutionStatus, GrowthJourneyExecutionStatus]> = [
  ['enrolled', 'in_progress'], ['enrolled', 'completed'], ['enrolled', 'blocked'], ['enrolled', 'failed'],
  ['in_progress', 'completed'], ['in_progress', 'blocked'], ['in_progress', 'failed'],
  ['enrolling', 'enrolled'], ['enrolling', 'approved'], ['enrolling', 'failed'],
  ['approved', 'expired'], ['pending_review', 'expired'],
];
export const reconcilerEdgesHold = (): boolean => RECONCILER_EDGES.every(([from, to]) => canTransition(from, to));
