import api from '../utils/api';

// Reese manager-growth mission, Phase 3 (T09/T10) — the Admin Tools page's
// API client. Mirrors backend/src/services/workforce/agentEffectiveAccessService.ts's
// real report shape field for field (GET /api/admin/tools,
// GET /api/admin/agents/:id/effective-access) — a frontend type-only module
// can't import the backend service directly, so this is a deliberate,
// documented mirror, same convention as workforceOrgChartApi.ts.

export type AutonomyProvenance = 'auto' | 'manual' | 'unknown' | 'never_set';
export type AbacMode = 'off' | 'shadow' | 'enforce';

export interface ToolAccessReport {
  toolName: string;
  registered: boolean;
  grantedVia: string[];
  mismatches: string[];
  reads: string[];
  produces: string[];
  documented: boolean;
  usable: boolean;
}

export interface EnabledRowReport {
  agentName: string;
  enabled: boolean;
  role: 'main' | 'sibling';
}

export interface AgentEffectiveAccessReport {
  agentId: string;
  agentName: string;
  permissionTier: string;
  autonomyLevel: string | null;
  autonomyProvenance: AutonomyProvenance;
  abacMode: AbacMode;
  enabledRows: EnabledRowReport[];
  tools: ToolAccessReport[];
  charterNote: string;
  mismatches: string[];
}

export interface DriftFinding {
  agentName: string;
  agentId: string | null;
  description: string;
}

export interface ToolCatalogAssignedAgent {
  agentId: string;
  agentName: string;
  registered: boolean;
  grantedVia: string[];
  usable: boolean;
}

export interface ToolCatalogEntry {
  toolName: string;
  reads: string[];
  produces: string[];
  documented: boolean;
  assignedAgents: ToolCatalogAssignedAgent[];
}

/** GET /api/admin/tools's real combined response — the tool-centric
 * catalog (T10's search/filter/assigned-agents ask) merged with the
 * agent-centric drift report (T09's inventory-drift ask), same endpoint. */
export interface AdminToolsOverview {
  generatedAt: string;
  tools: ToolCatalogEntry[];
  driftFindings: DriftFinding[];
}

export async function getAdminToolsOverview(): Promise<AdminToolsOverview> {
  const res = await api.get<AdminToolsOverview>('/api/admin/tools');
  return res.data;
}

export async function getAgentEffectiveAccess(agentId: string): Promise<AgentEffectiveAccessReport> {
  const res = await api.get<AgentEffectiveAccessReport>(`/api/admin/agents/${agentId}/effective-access`);
  return res.data;
}

// Agent Tools section, Phase 1 (2026-11-11). Mirrors
// backend/src/services/workforce/agentToolGovernanceService.ts field for field, same deliberate
// mirror convention as the types above.
//
// Kept separate from AgentEffectiveAccessReport on purpose: that report says what the RUNTIME
// would do, this one says what the GOVERNANCE records. They disagree for every agent in
// production today, and one blended type would hide the disagreement the section exists to show.

export interface ToolGovernanceRow {
  toolName: string;
  held: boolean;
  granted: boolean;
  capabilityId: string | null;
  capabilityName: string | null;
  capabilityDomain: string | null;
  /** null means there was no capability to check, which is not the same as false. */
  capabilityRequiresThisTool: boolean | null;
  approvedByIdentity: string | null;
  approvedAt: string | null;
  findings: string[];
}

export interface ToolGovernanceSummary {
  held: number;
  granted: number;
  heldWithoutGrant: number;
  grantedWithoutHolding: number;
  capabilityMismatch: number;
  capabilityUnknown: number;
  clean: number;
}

export interface AgentToolGovernanceReport {
  agentId: string;
  agentName: string;
  generatedAt: string;
  rows: ToolGovernanceRow[];
  summary: ToolGovernanceSummary;
  posture: string;
}

export async function getAgentToolGovernance(agentId: string): Promise<AgentToolGovernanceReport> {
  const res = await api.get<AgentToolGovernanceReport>(`/api/admin/agents/${agentId}/tool-governance`);
  return res.data;
}

// Agent Tools Phase 2 (2026-11-11) — the request pipeline for one agent, and the conversation on
// a request. Mirrors backend/src/services/agentDomain/toolRequestConversationService.ts.

export interface ToolRequestMessageView {
  id: string;
  author_identity: string;
  posted_at: string;
  body: string;
}

export interface ToolRequestDecisionView {
  verb: string;
  decided_by_identity: string;
  decided_at: string;
  reason: string | null;
  missing_field: string | null;
  assigned_tool_name: string | null;
}

export interface AgentToolRequestView {
  change_request_id: string;
  title: string;
  status: string;
  requested_by_identity: string | null;
  requested_at: string | null;
  tool_name: string | null;
  purpose: string | null;
  capability_id: string | null;
  needed_by: string | null;
  writes: boolean | null;
  decisions: ToolRequestDecisionView[];
  messages: ToolRequestMessageView[];
  /** Derived server-side from status plus the decision log, so it cannot drift from them. */
  where_it_stands: string;
}

export interface AgentToolRequestsReport {
  agentId: string;
  generatedAt: string;
  requests: AgentToolRequestView[];
  summary: { total: number; open: number; approved: number; declined: number };
}

export async function getAgentToolRequests(agentId: string): Promise<AgentToolRequestsReport> {
  const res = await api.get<AgentToolRequestsReport>(`/api/admin/agents/${agentId}/tool-requests`);
  return res.data;
}

/**
 * Posts one message. `author_identity` is deliberately NOT a parameter: the server reads the
 * author off the verified session, and its body schema is strict, so sending one would be
 * refused by name rather than quietly ignored.
 */
export async function postToolRequestMessage(
  changeRequestId: string,
  body: string,
): Promise<ToolRequestMessageView> {
  const res = await api.post<ToolRequestMessageView>(
    `/api/admin/agent-domain-tool-requests/${changeRequestId}/messages`,
    { body },
  );
  return res.data;
}
