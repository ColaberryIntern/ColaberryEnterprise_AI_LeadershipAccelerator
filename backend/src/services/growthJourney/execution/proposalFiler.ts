import type { Transaction } from 'sequelize';
import { AiAgent, ProposedAgentAction } from '../../../models';

/**
 * REVIEW files a `ProposedAgentAction` (Phase 5 T508) - the queue Admin >
 * Agents and the manager inbox already review, so a journey execution waits
 * for a human where every other agent's proposal waits. Filing contacts
 * nobody: the proposal points at a receipt (`target_table`, `target_id`) and a
 * campaign, and the approval branch (T509) is what moves the receipt.
 *
 * The proposal is filed AS the executor agent, whose registry row ships
 * `enabled: false` under the outbound category (T509). Without that row there
 * is no queue for a human to find the proposal in, so the planner refuses with
 * `review_queue_unavailable` and writes no receipt at all - an orphan
 * `pending_review` row that nobody could ever approve must not exist.
 *
 * No address, no name, no subject line: `reason` is the decision's own reason
 * (a rationale over states and tiers), the states are receipt statuses.
 */

export const EXECUTOR_AGENT_NAME = 'GrowthJourneyExecutor';
export const PROPOSAL_ACTION_TYPE = 'growth_journey_execution';
export const PROPOSAL_TARGET_TABLE = 'growth_journey_executions';
export const PROPOSAL_TTL_HOURS = 72;

/** The executor's registry row id, or null when the row does not exist (the shipped state until T509). */
export async function findExecutorAgentId(): Promise<string | null> {
  const row = await AiAgent.findOne({ where: { agent_name: EXECUTOR_AGENT_NAME }, attributes: ['id'] });
  return row ? String(row.get('id')) : null;
}

export interface ProposalDraft {
  id: string;
  agentId: string;
  receiptId: string;
  campaignId: string | null;
  /** The decision's reason - a rationale over states and tiers, never a person's data. */
  reason: string;
  asOf: Date;
}

/** The proposal's attributes. Pure, so the shape is pinned without a database. */
export function proposalAttributes(draft: ProposalDraft): Record<string, unknown> {
  return {
    id: draft.id,
    agent_id: draft.agentId,
    agent_name: EXECUTOR_AGENT_NAME,
    action_type: PROPOSAL_ACTION_TYPE,
    target_table: PROPOSAL_TARGET_TABLE,
    target_id: draft.receiptId,
    proposed_changes: { status: 'approved' },
    before_state: { status: 'pending_review' },
    reason: draft.reason,
    // The Governor is rule-based (`ai_involved: false` on every row it writes): a proposal it files is not a guess.
    confidence: 1,
    campaign_id: draft.campaignId,
    status: 'pending',
    expires_at: new Date(draft.asOf.getTime() + PROPOSAL_TTL_HOURS * 3_600_000),
  };
}

/** Files the proposal inside the planner's transaction, so a receipt and its proposal land together or not at all. */
export async function fileProposal(draft: ProposalDraft, transaction: Transaction): Promise<void> {
  await ProposedAgentAction.create(proposalAttributes(draft) as never, { transaction });
}
