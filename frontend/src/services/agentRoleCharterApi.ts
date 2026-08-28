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
