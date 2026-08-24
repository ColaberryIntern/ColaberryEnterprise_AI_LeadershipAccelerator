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

/** One tool's own reads/produces, so the UI can show a per-tool drill-down
 * instead of only the flattened union below. */
export interface AgentDetailToolCapability {
  tool: string;
  reads: string[];
  produces: string[];
  documented: boolean;
}

/** What this agent reads / produces — derived from its real, live tools_granted
 * (+ real, live observed ticket types it creates), never hand-written free text.
 * See backend/src/services/reese/agentToolCapabilities.ts. */
export interface AgentDetailCapabilities {
  reads: string[];
  produces: string[];
  undocumented_tools: string[];
  produced_ticket_types: string[];
  by_tool: AgentDetailToolCapability[];
}

/** This agent's own real reports_to chain (org-chart hierarchy build,
 * 2026-08-19) — `null` only when the agent has no reports_to_type configured
 * at all (the common case for many non-ticket-creating agents); never a
 * fabricated empty shape when it is set. */
export interface AgentDetailReportsTo {
  trail: string[];
  resolved_human: { id: string; name: string; email: string } | null;
  /** The direct next hop, when it's another agent — real id/name so the UI
   * can link straight to that agent's own detail page. `null` when this
   * agent reports directly to a human, or the configured target doesn't
   * resolve to a real agent row. */
  immediate_agent: { id: string; name: string } | null;
}

/** Trust Contract, "Instant" dimension (2026-08-24) — grounded in Ram
 * Katamaraja's *Trust Before Intelligence* INPACT(tm) framework, per Ali's
 * explicit ask. Every field is a real, pre-existing `AiAgent` column that was
 * never surfaced on this page before. `null`/`0` for an agent invoked outside
 * the generic scheduler wrapper (e.g. Reese, InboxCaseEngine) is honest, not
 * a fabricated "no data yet" placeholder. */
export interface AgentDetailTrustContract {
  trigger_type: string | null;
  schedule: string | null;
  status: string;
  last_run_at: string | null;
  run_count: number;
  error_count: number;
  avg_duration_ms: number | null;
  last_error: string | null;
  last_error_at: string | null;
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
    /** AI Workforce Reset, Phase C (2026-08-24) — Permitted dimension of the
     * Trust Contract; `null` until this agent is reactivated through that flow. */
    autonomy_level: 'observe' | 'suggest' | 'act_audited' | 'communicate' | null;
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
  trust_contract: AgentDetailTrustContract;
}

export async function getAgentDetail(agentId: string): Promise<AgentDetail> {
  const res = await api.get<AgentDetail>(`/api/admin/agents/${agentId}`);
  return res.data;
}
