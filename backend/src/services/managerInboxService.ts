import AiAgent from '../models/AiAgent';
import ProposedAgentAction from '../models/ProposedAgentAction';

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
// wide. Read-only in this first slice — approving/rejecting still goes
// through the existing /api/admin/agent-actions/:id/approve|reject routes
// (requireAdmin only). Scoping THOSE actions to "only this agent's actual
// manager may decide" is a real, deliberately deferred next step: it would
// mean resolving a proposal's own agent_id before authorizing, touching
// already-live routes used broadly across unrelated agent types (content/
// conversation optimization), not just this mission's scope — a bigger,
// separate change, not silently folded into this read-only slice.

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
