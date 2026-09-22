import api from '../utils/api';

// AgentRoleCharter — an agent's manager-editable business-facing job
// description (backend: GET/PUT /api/admin/agents/:id/charter). Separate
// from agentDetailApi.ts since this one has a real write path, gated by
// requireAgentManagerOrAdmin (not every admin who can view an agent can
// necessarily edit its charter).

export interface AgentRoleCharter {
  roleTitle: string;
  mission: string;
  responsibilities: string[];
  kpis: string[];
  updatedByEmail: string;
  updatedAt: string;
  /** Track A2 (2026-09-22) — the real authority tiers the backend has served
   * since R4/R5 but no frontend consumer read until now. null means the
   * charter predates versioned authority (version < 2) or was never given
   * one — the honest empty state, never a fabricated tier. */
  authorityAutonomous: string[] | null;
  authorityApprovalRequired: string[] | null;
  authorityForbidden: string[] | null;
}

export interface AgentRoleCharterView {
  agentId: string;
  /** null means no charter has been written for this agent yet — the honest
   * empty state, never a fabricated default. */
  charter: AgentRoleCharter | null;
}

export interface AgentRoleCharterInput {
  roleTitle: string;
  mission: string;
  responsibilities: string[];
  kpis: string[];
}

export async function getAgentRoleCharter(agentId: string): Promise<AgentRoleCharterView> {
  const res = await api.get<AgentRoleCharterView>(`/api/admin/agents/${agentId}/charter`);
  return res.data;
}

export async function saveAgentRoleCharter(agentId: string, input: AgentRoleCharterInput): Promise<AgentRoleCharterView> {
  const res = await api.put<AgentRoleCharterView>(`/api/admin/agents/${agentId}/charter`, input);
  return res.data;
}
