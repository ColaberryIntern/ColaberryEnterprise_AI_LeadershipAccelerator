import api from '../utils/api';

// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — first frontend
// caller of the real, already-live GET /api/admin/agents/:id/explainability
// (agentExplainabilityService.ts). Every field here is copied verbatim from
// a real ai_events/ProposedAgentAction row — deliberately no LLM-generated
// narrative, no hidden reasoning trace. See backend service for the exact
// PII-scoping (metadata is never returned wholesale).

export interface ExplainabilityEvent {
  eventType: string;
  outcome: string;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  createdAt: string;
  authorization: { verdict: string; reason: string; mode: string; enforced: boolean } | null;
}

export interface ExplainabilityProposedAction {
  actionType: string;
  reason: string;
  status: string;
  confidence: number;
  createdAt: string;
  reviewedAt: string | null;
}

// Decision Journal enrichment (2026-10-03) — the real human-review lifecycle for this
// agent's own authorization-gated sends (approval_requests). Optional on
// AgentExplainability (not required) so every existing consumer/fixture of this type
// stays valid without modification — the real backend response always includes it;
// callers that render it should treat a missing value as an empty array.
export interface ExplainabilityApprovalRequest {
  action: string;
  verdict: string;
  riskTier: string;
  autonomyLevel: string | null;
  status: string;
  reasonCode: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionChannel: string | null;
  replayedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AgentExplainability {
  agentId: string;
  agentName: string;
  events: ExplainabilityEvent[];
  proposedActions: ExplainabilityProposedAction[];
  approvalRequests?: ExplainabilityApprovalRequest[];
}

export async function getAgentExplainability(agentId: string): Promise<AgentExplainability> {
  const res = await api.get<AgentExplainability>(`/api/admin/agents/${agentId}/explainability`);
  return res.data;
}
