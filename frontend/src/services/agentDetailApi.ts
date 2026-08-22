import api from '../utils/api';

// Agent Detail — the transparency page: real identity, real system prompt, real
// tools, live status, real ticket activity for one AiAgent (backend:
// GET /api/admin/agents/:id). Generic by design — works for any agent id, not
// hardcoded to Reese.

export interface AgentDetailIdentity {
  admin_user_id: string;
  email: string;
  display_name: string | null;
  is_ai_operated: boolean;
}

export interface AgentDetailTicket {
  id: string;
  ticket_number: number | null;
  title: string;
  status: string;
  priority: string;
  type: string;
  created_at: string | null;
  updated_at: string | null;
}

/** What this agent reads / produces — derived from its real, live tools_granted
 * (+ real, live observed ticket types it creates), never hand-written free text.
 * See backend/src/services/reese/agentToolCapabilities.ts. */
export interface AgentDetailCapabilities {
  reads: string[];
  produces: string[];
  undocumented_tools: string[];
  produced_ticket_types: string[];
}

/** This agent's own real reports_to chain (org-chart hierarchy build,
 * 2026-08-19) — `null` only when the agent has no reports_to_type configured
 * at all (the common case for many non-ticket-creating agents); never a
 * fabricated empty shape when it is set. */
export interface AgentDetailReportsTo {
  trail: string[];
  resolved_human: { id: string; name: string; email: string } | null;
}

export interface AgentDetail {
  agent: {
    id: string;
    agent_name: string;
    agent_type: string;
    category: string | null;
    description: string | null;
    system_prompt: string | null;
    tools_granted: string[] | null;
    persona_version: string | null;
    enabled: boolean;
    created_at: string | null;
  };
  identity: AgentDetailIdentity | null;
  live_status: 'online' | 'away' | 'offline' | 'unknown';
  /** The agent's TRUE open-ticket count (Ticket Count Sync fix, 2026-08-21) —
   * computed server-side via the same shared query the org chart's badges use,
   * NOT derived from `tickets` below (which is capped at 50, most-recent-first,
   * and can undercount for a high-volume agent). Use this field for any
   * "how many open tickets does this agent have" display. */
  open_ticket_count: number;
  tickets: AgentDetailTicket[];
  capabilities: AgentDetailCapabilities;
  reports_to: AgentDetailReportsTo | null;
}

export async function getAgentDetail(agentId: string): Promise<AgentDetail> {
  const res = await api.get<AgentDetail>(`/api/admin/agents/${agentId}`);
  return res.data;
}
