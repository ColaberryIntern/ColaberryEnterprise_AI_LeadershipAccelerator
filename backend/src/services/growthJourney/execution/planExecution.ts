import { randomUUID } from 'crypto';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import { resolveExplorerGrowthFlags, type ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { CommunicationLog, GrowthJourneyExecution, GrowthJourneyExecutionControl, Lead } from '../../../models';
import type { GrowthJourneyExecutionAttributes } from '../../../models/GrowthJourneyExecution';
import { classifyError } from '../../../utils/errorClassifier';
import { isUniqueViolation } from '../../../utils/uniqueViolation';
import { executionChannelOf, LIVE_MODES } from '../decision/executionModeStamp';
import { resolveContactEvidence } from '../governor/contactEvidence';
import type { JourneyProgramKind } from '../governor/types';
import { resolveReturnToAi } from '../handoffs/returnToAi';
import { recordJourneyEvent } from '../ledger';
import { ALI_OUTREACH_CAMPAIGN_KEY } from './campaignKeys';
import { findActiveRollout } from './controlsRepo';
import { channelOpenness, inAppContentOf, selectedCandidateOf, stalenessOf, type ExecutionDecisionView } from './planChecks';
import { fileProposal, findExecutorAgentId } from './proposalFiler';
import { assertTransition, INITIAL_STATUS_BY_MODE, recordReceiptTransition } from './receiptTransitions';
import { EXECUTABLE_CHANNELS, resolveExecutionMode, type ExecutionChannel, type ModeResult } from './resolveExecutionMode';
import type { GrowthJourneyExecutionChannel } from '../../../models/GrowthJourneyExecution';
import { rolloutScopeKey } from './scopeKey';
import { validateCampaign, type ValidatedCampaign } from './validateCampaign';

/**
 * The planner (Phase 5 T508): a `live` decision becomes a receipt, exactly
 * once. Nothing here contacts anyone - a receipt is a row that the adapter
 * (T510/T511) may later act on, after re-running every gate.
 *
 * ─── THE ORDER IS THE POINT ─────────────────────────────────────────────────
 *
 *   1  the decision is live, and its selected action maps to a channel
 *      this phase can execute; sms / voice: channel_not_authorized, before
 *      any row is read. A deferral is never read: the strategy's "would" is
 *      not a decision.
 *   2  the winner is identifiable (planChecks.selectedCandidateOf).
 *   3  staleness: a reply newer than the decision, then the 36 h age cap.
 *   4  in ONE transaction, the rollout row locked so two planners at the
 *      limit serialise (the T504 verifier's non-atomic pre-count):
 *      the ladder re-resolved NOW; the contact evidence re-read NOW and the
 *      channel open under the decision's own policy (a human in the thread,
 *      an unverified consent, a return-to-AI cooldown each close it); the
 *      campaign validated (email, Ali outreach) or the nudge's content and
 *      portal account present (in_app); REVIEW needs the executor's agent
 *      row or there is no queue - then the receipt, and for REVIEW its
 *      proposal, land together or not at all.
 *   5  a unique violation is either this decision's own receipt (replayed)
 *      or another open receipt for the same person, brand and channel
 *      (open_execution_exists) - the database's rule, not a pre-count.
 *
 * Every refusal writes one ledger row on the decision; every receipt writes
 * one on itself. Ids and reasons only. The lead's address is read for the
 * consent lookup and held in memory for that call alone.
 */

export interface PlanExecutionArgs {
  decision: ExecutionDecisionView;
  flags: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  asOf: Date;
  /** The programme's kind, for the queue-capacity half of the evidence (T403). */
  programKind?: JourneyProgramKind;
}

export type PlanExecutionResult =
  | { status: 'planned'; receipt: GrowthJourneyExecution; replayed: false; mode: 'review' | 'limited'; proposal_id: string | null }
  | { status: 'replayed'; receipt: GrowthJourneyExecution; replayed: true }
  | { status: 'refused'; reason: string; channel: ExecutionChannel | null };

type Planned = { kind: 'planned'; receipt: GrowthJourneyExecution; mode: ModeResult; proposalId: string | null; campaign: ValidatedCampaign | null };
type Refusal = { kind: 'refused'; reason: string };
const refusal = (reason: string): Refusal => ({ kind: 'refused', reason });

/** The newest inbound message from this lead, or null. Bounded: the same window the evidence reads. */
async function newestInboundAt(leadId: number | null): Promise<Date | null> {
  if (leadId === null) return null;
  const rows = await CommunicationLog.findAll({ where: { lead_id: leadId, direction: 'inbound' }, attributes: ['created_at'], limit: 200 });
  let newest: Date | null = null;
  for (const r of rows as unknown as Array<{ created_at?: Date | string | null }>) {
    const at = r.created_at ? new Date(r.created_at) : null;
    if (at && (!newest || at.getTime() > newest.getTime())) newest = at;
  }
  return newest;
}

/** The address the consent record may be keyed by. Held for the evidence call; written nowhere. */
async function leadAddress(leadId: number): Promise<{ email: string | null; phone: string | null } | null> {
  const lead = await Lead.findByPk(leadId, { attributes: ['email', 'phone'] });
  if (!lead) return null;
  const email = lead.get('email');
  const phone = lead.get('phone');
  return { email: typeof email === 'string' ? email : null, phone: typeof phone === 'string' ? phone : null };
}

async function planInTransaction(args: PlanExecutionArgs, channel: GrowthJourneyExecutionChannel, candidate: { action_type: string; campaign_key: string | null }, address: { email: string | null; phone: string | null }, t: Transaction): Promise<Planned | Refusal> {
  const { decision, asOf } = args;
  const programId = decision.program_id as string;
  const scope = { brandId: decision.brand_id, programId, channel };

  // The rollout row, locked for the rest of this transaction: the ladder's daily count below is then a count
  // no concurrent planner can race, so `limit` releases at most `limit` receipts, not `limit + 1`.
  const rollout = await findActiveRollout(decision.tenant_id, rolloutScopeKey(scope));
  if (rollout) await GrowthJourneyExecutionControl.findOne({ where: { id: rollout.id }, transaction: t, lock: t.LOCK.UPDATE });

  const mode = await resolveExecutionMode({
    tenantId: decision.tenant_id, brandId: decision.brand_id, programId, channel,
    subjectRef: decision.subject_ref, leadId: decision.lead_id, asOf, flags: args.flags, explorerFlags: args.explorerFlags ?? resolveExplorerGrowthFlags(),
  });
  if (!LIVE_MODES.includes(mode.mode)) return refusal(`mode_not_live:${mode.reason}`);
  const resolvedMode = mode.mode as 'review' | 'limited';

  const evidence = await resolveContactEvidence({
    subject: { lead_id: decision.lead_id, email: address.email, phone: address.phone },
    brandId: decision.brand_id, tenantId: decision.tenant_id, asOf, programKind: args.programKind,
  });
  const open = channelOpenness(channel, evidence);
  if (!open.open) return refusal(open.reason);
  const cooldown = await resolveReturnToAi({ subjectRef: decision.subject_ref, brandId: decision.brand_id, asOf, leadId: decision.lead_id });
  if (cooldown.active) return refusal('returned_to_ai_cooldown');

  let campaign: ValidatedCampaign | null = null;
  if (channel === 'in_app') {
    if (!decision.enrollment_id) return refusal('in_app_requires_enrollment');
    if (!inAppContentOf(decision.selected_content).ok) return refusal('in_app_no_approved_content');
  } else {
    const campaignKey = channel === 'ali_outreach' ? ALI_OUTREACH_CAMPAIGN_KEY : candidate.campaign_key;
    const validated = await validateCampaign({ campaignKey, tenantId: decision.tenant_id, brandId: decision.brand_id, mode: resolvedMode });
    if (!validated.ok) return refusal(validated.reason);
    campaign = validated.campaign;
  }

  // REVIEW needs a queue to wait in: the executor's agent row. Checked BEFORE the receipt exists.
  let agentId: string | null = null;
  if (resolvedMode === 'review') {
    agentId = await findExecutorAgentId();
    if (!agentId) return refusal('review_queue_unavailable');
  }

  const status = INITIAL_STATUS_BY_MODE[resolvedMode];
  assertTransition(null, status);
  const receiptId = randomUUID();
  const proposalId = resolvedMode === 'review' ? randomUUID() : null;
  const attrs: GrowthJourneyExecutionAttributes = {
    id: receiptId,
    tenant_id: decision.tenant_id,
    brand_id: decision.brand_id,
    program_id: programId,
    decision_id: decision.id,
    subject_ref: decision.subject_ref,
    lead_id: decision.lead_id,
    enrollment_id: decision.enrollment_id,
    channel,
    action_type: candidate.action_type,
    campaign_id: campaign?.id ?? null,
    campaign_key: campaign?.campaign_key ?? candidate.campaign_key,
    sequence_id: campaign?.sequence_id ?? null,
    mode: resolvedMode,
    status,
    status_reason: mode.reason,
    control_ids: mode.control_ids,
    proposal_id: proposalId,
    approved_by: resolvedMode === 'limited' ? `limited_rollout:${mode.control_ids[0] ?? 'none'}` : null,
    approved_at: resolvedMode === 'limited' ? asOf : null,
  };
  const receipt = await GrowthJourneyExecution.create(attrs, { transaction: t });
  if (proposalId && agentId) {
    await fileProposal({ id: proposalId, agentId, receiptId, campaignId: campaign?.id ?? null, reason: decision.reason, asOf }, t);
  }
  return { kind: 'planned', receipt, mode, proposalId, campaign };
}

export async function planExecution(args: PlanExecutionArgs): Promise<PlanExecutionResult> {
  const { decision, asOf } = args;
  const scope = { tenant_id: decision.tenant_id, brand_id: decision.brand_id };
  const refuse = async (reason: string, channel: ExecutionChannel | null): Promise<PlanExecutionResult> => {
    await recordJourneyEvent('growth_journey.execution.refused', 'growth_journey_decision', decision.id, scope, { refusal: reason, channel, decision_id: decision.id });
    return { status: 'refused', reason, channel };
  };

  if (decision.mode !== 'live') return refuse('decision_not_live', null);
  if (!decision.selected_action) return refuse('no_selected_action', null);
  const target = executionChannelOf({ selected_action: decision.selected_action, selected_channel: decision.selected_channel as never });
  if (target.channel === null) return refuse(target.reason, null);
  if (!EXECUTABLE_CHANNELS.includes(target.channel)) return refuse('channel_not_authorized', target.channel);
  const channel = target.channel as GrowthJourneyExecutionChannel;
  const picked = selectedCandidateOf(decision);
  if (!picked.ok) return refuse(picked.reason, channel);
  if (decision.program_id === null) return refuse('no_program', channel);

  const stale = stalenessOf(decision, await newestInboundAt(decision.lead_id), asOf);
  if (stale) return refuse(stale, channel);

  let address: { email: string | null; phone: string | null } | null = { email: null, phone: null };
  if (decision.lead_id !== null) {
    address = await leadAddress(decision.lead_id);
    if (!address) return refuse('lead_unreadable', channel);
  }

  let outcome: Planned | Refusal;
  try {
    outcome = await sequelize.transaction((t) => planInTransaction(args, channel, picked.candidate, address as { email: string | null; phone: string | null }, t));
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) {
      console.error(JSON.stringify({
        level: 'error', service: 'growth-journey', event: 'growth_journey.execution.plan_failed', outcome: 'failure',
        error_class: classifyError(err), context: { tenant_id: decision.tenant_id, brand_id: decision.brand_id, decision_id: decision.id, channel },
      }));
      throw err;
    }
    // The database's rule: this decision already has its receipt (a replay), or another receipt for the same
    // person, brand and channel is still open.
    const existing = await GrowthJourneyExecution.findOne({ where: { decision_id: decision.id } });
    if (existing) return { status: 'replayed', receipt: existing, replayed: true };
    return refuse('open_execution_exists', channel);
  }

  if (outcome.kind === 'refused') return refuse(outcome.reason, channel);
  const { receipt, mode, proposalId, campaign } = outcome;
  await recordReceiptTransition(String(receipt.get('id')), scope, null, INITIAL_STATUS_BY_MODE[mode.mode as 'review' | 'limited'], mode.reason, {
    decision_id: decision.id, channel, mode: mode.mode, control_ids: mode.control_ids, proposal_id: proposalId, campaign_id: campaign?.id ?? null,
  });
  return { status: 'planned', receipt, replayed: false, mode: mode.mode as 'review' | 'limited', proposal_id: proposalId };
}
