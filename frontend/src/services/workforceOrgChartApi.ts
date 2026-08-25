import api from '../utils/api';

// Org-chart hierarchy build (2026-08-19) — real Human Employees -> AI
// Leadership -> AI Staff tree (backend: GET /api/admin/workforce/org-chart).
// Mirrors backend/src/services/workforce/orgChartService.ts's OrgChartResponse
// (and its Zod contract, backend/src/schemas/workforceOrgChartSchema.ts) field
// for field.

// Mirrors backend/src/services/workforce/orgChartService.ts's
// NAMED_DEPARTMENTS/OTHER_DEPARTMENT exactly (order matters — this is the
// section render order) — a frontend type-only module can't import the
// backend service directly, so this is a deliberate, documented mirror, same
// as the interfaces below.
export const NAMED_DEPARTMENTS = ['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing'] as const;
export const OTHER_DEPARTMENT = 'Other';

export interface OrgChartTask {
  id: string;
  ticket_number: number | null;
  title: string;
  status: string;
  priority: string;
  type: string;
  created_at: string | null;
}

export interface OrgChartHuman {
  id: string;
  name: string;
  email: string;
  team: string | null;
  /** One of the 6 named departments, or "Other" — always present. */
  department: string;
  role: 'manager' | 'member';
  leadership_agent_ids: string[];
  staff_count: number;
  /** The one throttled, most-recent OPEN task for this human, or null when
   * they genuinely have none yet — an honest empty state, never fabricated. */
  task: OrgChartTask | null;
  /** Org Chart v3 (2026-08-19) — present only when this human has >=1 AI
   * Leadership agent reporting to them; null for everyone else (fallback
   * color is this frontend's own decision, not the API's). */
  hierarchy_color: string | null;
}

export interface OrgChartLeadershipAgent {
  id: string;
  agent_name: string;
  display_name: string;
  reports_to_human_id: string;
  /** "Reports to: <human name>" — real, present before any click. */
  reports_to_summary: string;
  staff_ids: string[];
  open_ticket_count: number;
  /** Org Chart v3 (2026-08-19) — same color as the human this agent reports
   * to; never null in practice (every resolved leadership agent has one). */
  hierarchy_color: string | null;
  /** AI Workforce Reset (2026-08-24) — real `AiAgent.enabled`. */
  enabled: boolean;
}

export interface OrgChartStaffAgent {
  id: string;
  agent_name: string;
  display_name: string;
  reports_to_agent_id: string;
  /** "Reports to: <leadership agent name>" — real, present before any click. */
  reports_to_summary: string;
  open_ticket_count: number;
  /** Org Chart v3 (2026-08-19) — same color as the leadership agent this
   * staff agent reports through. */
  hierarchy_color: string | null;
  /** AI Workforce Reset (2026-08-24) — real `AiAgent.enabled`. */
  enabled: boolean;
}

export interface OrgChartUnresolvedAgent {
  id: string;
  agent_name: string;
  reason: string;
}

export interface OrgChartResponse {
  organization: { id: string; name: string };
  humans: OrgChartHuman[];
  leadership: OrgChartLeadershipAgent[];
  staff: OrgChartStaffAgent[];
  unresolved: OrgChartUnresolvedAgent[];
  generated_at: string;
}

export async function getOrgChart(): Promise<OrgChartResponse> {
  const res = await api.get<OrgChartResponse>('/api/admin/workforce/org-chart');
  return res.data;
}

// Org Chart v3 (2026-08-19) — Ali: "Give me the ability to switch the
// people between teams." `team: null` clears the department (buckets into
// "Other" on next load).
export async function updateOrgMemberTeam(id: string, team: string | null): Promise<OrgChartHuman> {
  const res = await api.patch<OrgChartHuman>(`/api/admin/workforce/org-chart/members/${id}/team`, { team });
  return res.data;
}

export interface AssignHierarchyTaskInput {
  agentId: string;
  title: string;
  description?: string;
  idempotencyKey: string;
}

export interface AssignedTask {
  id: string;
  title: string;
}

// Org Chart v3 (2026-08-19) — Ali: "The human has the ability to create and
// assign tasks to any agent in it's hierarchy even if they report to
// another AI Agent."
export async function assignHierarchyTask(orgMemberId: string, input: AssignHierarchyTaskInput): Promise<AssignedTask> {
  const res = await api.post<AssignedTask>(`/api/admin/workforce/org-chart/members/${orgMemberId}/tasks`, {
    agent_id: input.agentId,
    title: input.title,
    description: input.description,
    idempotency_key: input.idempotencyKey,
  });
  return res.data;
}

export interface AgentResetResult {
  agentId: string;
  agentName: string;
  found: boolean;
  deactivated: boolean;
  ticketsCancelled: number;
  error: string | null;
}

// AI Workforce Reset (2026-08-24) — Ali, live: deactivate a specific,
// explicit set of AI-generated agents and cancel their open tickets. Real,
// reversible (enabled:false), never a silent bulk operation — see
// backend/src/services/workforce/agentResetService.ts.
export async function resetAgents(agentIds: string[]): Promise<AgentResetResult[]> {
  const res = await api.post<{ results: AgentResetResult[] }>('/api/admin/workforce/agents/reset', { agent_ids: agentIds });
  return res.data.results;
}

// AI Workforce Reset, Phase C (2026-08-24) — Ali, live: "add new ones slowly
// in a way so I can see how they perform." docs/ai-governance/abac-design.md's
// already-proposed 4-level ladder, reused verbatim rather than a second,
// competing governance vocabulary — see agentReactivationService.ts.
export const AUTONOMY_LEVELS = ['observe', 'suggest', 'act_audited', 'communicate'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const AUTONOMY_LEVEL_DESCRIPTIONS: Record<AutonomyLevel, string> = {
  observe: 'Read only — the safest starting point for any agent coming back online.',
  suggest: 'May propose actions for human review, never executes them directly.',
  act_audited: 'May write to an allowlisted set of tables; every write is audited.',
  communicate: 'May send outbound email/SMS/voice/social, within scope + consent + approval rules.',
};

export interface AgentReactivationResult {
  agentId: string;
  agentName: string;
  found: boolean;
  reactivated: boolean;
  autonomyLevel: AutonomyLevel | null;
  error: string | null;
}

// Real, reversible (enabled:true + a real autonomy_level stamped in the same
// update) — reactivation is deliberate, never a silent flip back to
// unlimited trust.
export async function reactivateAgent(agentId: string, autonomyLevel: AutonomyLevel): Promise<AgentReactivationResult> {
  const res = await api.post<{ result: AgentReactivationResult }>(`/api/admin/workforce/agents/${agentId}/reactivate`, {
    autonomy_level: autonomyLevel,
  });
  return res.data.result;
}
