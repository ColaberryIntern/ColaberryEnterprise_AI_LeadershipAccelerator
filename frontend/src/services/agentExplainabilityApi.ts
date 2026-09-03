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

export interface AgentExplainability {
  agentId: string;
  agentName: string;
  events: ExplainabilityEvent[];
  proposedActions: ExplainabilityProposedAction[];
}

export async function getAgentExplainability(agentId: string): Promise<AgentExplainability> {
  const res = await api.get<AgentExplainability>(`/api/admin/agents/${agentId}/explainability`);
  return res.data;
}
