import AiAgent from '../models/AiAgent';
import ProposedAgentAction from '../models/ProposedAgentAction';
import { approveProposedAction, rejectProposedAction, ProposalOutcome } from './agentApprovalService';

// AI Workforce Management, Checkpoint C — the Manager Inbox. Deliberately
// reuses the real, already-live ProposedAgentAction rather than a new empty
// table: it's the strongest existing precedent for "a human needs to decide
// something about what an agent proposed to do" (real 4-state lifecycle,
// FK'd to ai_agents.id, already used by content-optimization,
// conversation-optimization, and workforce-director actions — see
// docs/architecture/ai-workforce-management/DOMAIN_REUSE_MAP.md's own
// AgentManagerInboxItem verdict: "modeled on ProposedAgentAction's real,
// enforced status lifecycle").
//
// This is the genuinely NEW capability: a per-agent, manager-scoped VIEW
// over that data. The existing admin-wide list
// (GET /api/admin/agent-actions, agentGovernanceController.ts) has no such
// scoping — any admin sees every pending proposal for every agent platform-
// wide, and that route stays exactly as it was.
//
// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — closes the gap
// this file's own header used to flag as "deliberately deferred": approving/
// rejecting a proposal from THIS agent's page now goes through the two
// functions below, which verify the proposal actually belongs to the agent
// in the URL before calling the same agentApprovalService the global routes
// use — one implementation, two authorization surfaces (platform-wide admin
// vs. this-agent's-actual-manager), never a duplicated executor.

export interface ManagerInboxItemView {
  id: string;
  actionType: string;
  reason: string;
  confidence: number;
  priorityScore: number | null;
  riskScore: number | null;
  impactScore: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'applied';
  createdAt: Date;
  expiresAt: Date | null;
  /** The real business object the proposal would change, and whether that
   * change actually executes on approval — see agentApprovalService.ts.
   * `targetTable === 'scheduled_emails'` is the one target with a real,
   * tested executor today; every other value means approving only flips
   * status, so the UI must never claim it "does" anything more than that. */
  targetTable: string | null;
  targetId: string | null;
}

function toView(row: ProposedAgentAction): ManagerInboxItemView {
  return {
    id: row.id,
    actionType: row.action_type,
    reason: row.reason,
    confidence: row.confidence,
    priorityScore: row.priority_score,
    riskScore: row.risk_score,
    impactScore: row.impact_score,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    targetTable: row.target_table,
    targetId: row.target_id,
  };
}

/** `null` return means the agent itself doesn't exist. An agent with zero
 * pending proposals returns an empty array — the honest "nothing needs your
 * attention right now" state, not an error. */
export async function getManagerInboxItems(agentId: string): Promise<ManagerInboxItemView[] | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const rows = await ProposedAgentAction.findAll({
    where: { agent_id: agentId, status: 'pending' },
    order: [['priority_score', 'DESC NULLS LAST'], ['created_at', 'DESC']],
  });
  return rows.map(toView);
}

interface InboxDecisionResult {
  outcome: ProposalOutcome | 'approved' | 'rejected';
  applied?: boolean;
  item?: ManagerInboxItemView;
}

/** Verifies the proposal actually belongs to `agentId` before approving —
 * a proposal id from a DIFFERENT agent reads as `not_found` here, the same
 * as a genuinely missing one, rather than leaking which agent it really
 * belongs to. */
export async function approveManagerInboxItem(agentId: string, proposalId: string, adminEmail: string, notes: string | null): Promise<InboxDecisionResult> {
  const proposal = await ProposedAgentAction.findByPk(proposalId);
  if (!proposal || proposal.agent_id !== agentId) return { outcome: 'not_found' };

  const result = await approveProposedAction(proposalId, adminEmail, notes);
  if (result.outcome !== 'approved') return { outcome: result.outcome, item: result.proposal ? toView(result.proposal) : undefined };
  return { outcome: 'approved', applied: result.applied, item: toView(result.proposal) };
}

export async function rejectManagerInboxItem(agentId: string, proposalId: string, adminEmail: string, notes: string | null): Promise<InboxDecisionResult> {
  const proposal = await ProposedAgentAction.findByPk(proposalId);
  if (!proposal || proposal.agent_id !== agentId) return { outcome: 'not_found' };

  const result = await rejectProposedAction(proposalId, adminEmail, notes);
  if (result.outcome !== 'rejected') return { outcome: result.outcome, item: result.proposal ? toView(result.proposal) : undefined };
  return { outcome: 'rejected', item: toView(result.proposal) };
}
