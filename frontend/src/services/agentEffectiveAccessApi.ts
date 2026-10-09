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
