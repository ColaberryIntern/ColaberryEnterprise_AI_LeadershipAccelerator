import { Op } from 'sequelize';
import AiAgent from '../models/AiAgent';
import AiEvent from '../models/AiEvent';
import ProposedAgentAction from '../models/ProposedAgentAction';
import ApprovalRequest from '../models/ApprovalRequest';

// AI Workforce Management, Checkpoint F — "Ask Agent About This"
// explainability. Per DOMAIN_REUSE_MAP.md's own verdict: "BUILD NEW,
// grounded in real data... a new read-only synthesis view over existing
// evidence, not a new data-capture system." No new table — this is a pure
// aggregation of ai_events, ProposedAgentAction.reason, and
// agent.authorization verdicts that already exist.
//
// Deliberately NOT an LLM-generated narrative: every field returned here
// is copied verbatim from a real, already-persisted row. There is no
// summarization step that could hallucinate a reason nobody actually gave
// — "never a hidden reasoning trace," per TBI_DATA_MAP.md's own framing.
//
// PII-SCOPING (matches trustMetricsService.ts's own drill-down rule):
// metadata is never returned wholesale — only a curated, known-safe
// allowlist per event_type. ProposedAgentAction's before_state/
// proposed_changes (arbitrary row diffs, potentially PII-bearing
// depending on target_table) are never returned either — reason/status/
// confidence are enough to explain a decision without redisclosing
// arbitrary row contents.

export interface ExplainabilityEvent {
  eventType: string;
  outcome: string;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  createdAt: Date;
  /** Only populated for event_type='agent.authorization' — the real
   * verdict/reason this specific decision recorded, never the raw
   * metadata blob. */
  authorization: { verdict: string; reason: string; mode: string; enforced: boolean } | null;
}

export interface ExplainabilityProposedAction {
  actionType: string;
  reason: string;
  status: string;
  confidence: number;
  createdAt: Date;
  reviewedAt: Date | null;
}

// Real-enforcement correlation, Decision Journal enrichment (2026-10-03) — the real
// human-review lifecycle for this agent's own authorization-gated sends, now that the
// approval_requests FK-ordering bug is fixed (2026-10-02) and the approve/reject/
// replay pipeline is live. Deliberately excludes prepared_action/ticket_id/
// work_unit_id/run_id/event_id — internal-id-shaped or PII-adjacent fields, matching
// this file's own existing metadata-scoping discipline for authorization events.
export interface ExplainabilityApprovalRequest {
  action: string;
  verdict: 'would_allow' | 'would_require_approval' | 'would_block';
  riskTier: string;
  autonomyLevel: string | null;
  status: 'shadow_logged' | 'pending' | 'approved' | 'rejected' | 'expired';
  reasonCode: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionChannel: string | null;
  replayedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface AgentExplainabilityResult {
  agentId: string;
  agentName: string;
  events: ExplainabilityEvent[];
  proposedActions: ExplainabilityProposedAction[];
  approvalRequests: ExplainabilityApprovalRequest[];
}

const RECENT_LIMIT = 25;

function toExplainabilityApprovalRequest(row: ApprovalRequest): ExplainabilityApprovalRequest {
  return {
    action: row.action,
    verdict: row.verdict,
    riskTier: row.risk_tier,
    autonomyLevel: row.autonomy_level,
    status: row.status,
    reasonCode: row.reason_code,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionChannel: row.decision_channel,
    replayedAt: row.replayed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function toExplainabilityEvent(row: AiEvent): ExplainabilityEvent {
  const authorization =
    row.event_type === 'agent.authorization' && row.metadata
      ? {
          verdict: String(row.metadata.verdict ?? 'unknown'),
          reason: String(row.metadata.reason ?? ''),
          mode: String(row.metadata.mode ?? 'unknown'),
          enforced: Boolean(row.metadata.enforced),
        }
      : null;

  return {
    eventType: row.event_type,
    outcome: row.outcome,
    model: row.model,
    // Real, live-caught bug (2026-09-04): AiEvent.cost_usd is a Postgres
    // DECIMAL column, which Sequelize returns as a STRING on a plain model
    // query (no explicit ::float cast, unlike trustMetricsService.ts's raw
    // SQL cost queries) — the TS type here claimed `number` but the real
    // runtime value was a string, crashing the frontend's `.toFixed(4)`
    // call the moment a real cost-tracked event existed. Never fabricates a
    // 0 for a genuinely null cost — only converts a real numeric string.
    costUsd: row.cost_usd !== null && row.cost_usd !== undefined ? Number(row.cost_usd) : null,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    authorization,
  };
}

/** `null` return means the agent itself doesn't exist. An agent with zero
 * recorded events/proposals returns real empty arrays — the honest
 * "nothing recorded yet" state, not an error. */
export async function getAgentExplainability(agentId: string): Promise<AgentExplainabilityResult | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  // Authorization events historically write agent_id as either the real
  // UUID or the agent_name string (agentAuthorizationService.ts's own
  // countAbacChecks/getAgentAuthorizationSummary query both forms for the
  // same reason) — matched here for the same honesty: an agent whose
  // authorization events were recorded under its name shouldn't silently
  // show zero.
  const [eventRows, proposedActionRows, approvalRequestRows] = await Promise.all([
    AiEvent.findAll({
      where: { agent_id: { [Op.in]: [agent.id, agent.agent_name] } },
      order: [['created_at', 'DESC']],
      limit: RECENT_LIMIT,
    }),
    ProposedAgentAction.findAll({
      where: { agent_id: agent.id },
      order: [['created_at', 'DESC']],
      limit: RECENT_LIMIT,
    }),
    // approval_requests has no agent_id column — agent_name is the only real
    // match key (ApprovalRequest.ts), already indexed for this exact lookup.
    ApprovalRequest.findAll({
      where: { agent_name: agent.agent_name },
      order: [['created_at', 'DESC']],
      limit: RECENT_LIMIT,
    }),
  ]);

  return {
    agentId: agent.id,
    agentName: agent.agent_name,
    events: eventRows.map(toExplainabilityEvent),
    proposedActions: proposedActionRows.map((row) => ({
      actionType: row.action_type,
      reason: row.reason,
      status: row.status,
      confidence: row.confidence,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    })),
    approvalRequests: approvalRequestRows.map(toExplainabilityApprovalRequest),
  };
}
