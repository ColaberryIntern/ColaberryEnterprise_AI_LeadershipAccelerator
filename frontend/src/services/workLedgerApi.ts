import api from '../utils/api';

// ProofDesk Work Ledger — Milestone 1 (Foundation). Read-only ingestion-health
// stats for the admin panel that proves the shadow-mode ledger is firing on real
// ticket/agent traffic (backend: GET /api/admin/dashboard/work-ledger-health).

export interface WorkLedgerHealthBreakdownRow {
  action: string;
  total: number;
  matched: number;
  orphan: number;
}

export interface WorkLedgerHealth {
  window_hours: number;
  total_actions: number;
  matched_actions: number;
  orphan_count: number;
  completeness_pct: number;
  breakdown: WorkLedgerHealthBreakdownRow[];
}

export async function getWorkLedgerHealth(windowHours = 24): Promise<WorkLedgerHealth> {
  const res = await api.get<WorkLedgerHealth>('/api/admin/dashboard/work-ledger-health', {
    params: { window_hours: windowHours },
  });
  return res.data;
}

// ProofDesk Governance — Milestone 4 (Governance Enforcement, SHADOW MODE ONLY).
// Read-only would-allow/would-require-approval/would-block breakdown from real
// ledger data. Nothing this page reads ever blocks a real action - see the backend
// service's own header (workLedgerHealthService.getGovernanceShadowSummary()) for
// the full shadow-mode invariant.

export interface GovernanceShadowBreakdownRow {
  action: string;
  risk_tier: string;
  verdict: 'would_allow' | 'would_require_approval' | 'would_block';
  count: number;
}

export interface GovernanceShadowSummary {
  window_hours: number;
  total_decisions: number;
  would_allow: number;
  would_require_approval: number;
  would_block: number;
  breakdown: GovernanceShadowBreakdownRow[];
}

export async function getGovernanceShadowSummary(windowHours = 24): Promise<GovernanceShadowSummary> {
  const res = await api.get<GovernanceShadowSummary>('/api/admin/dashboard/governance-shadow', {
    params: { window_hours: windowHours },
  });
  return res.data;
}

// ProofDesk Outcomes & Learning — Milestone 5. Read-only additions, same fetch
// pattern as the two functions above (plain GET, no params other than what the
// backend route defines).

export type AgentTrustDataStatus = 'sufficient_data' | 'insufficient_data';

export interface AgentTrustEntry {
  agent_name: string;
  capability: string;
  risk_tier: string;
  total: number;
  succeeded: number;
  failed: number;
  success_rate: number | null;
  status: AgentTrustDataStatus;
}

export async function getAgentTrust(): Promise<AgentTrustEntry[]> {
  const res = await api.get<{ agents: AgentTrustEntry[] }>('/api/admin/dashboard/agent-trust');
  return res.data.agents;
}

export interface CostToProofEntry {
  capability: string;
  verified_count: number;
  avg_duration_to_proof_ms: number | null;
  status: 'sufficient_data' | 'insufficient_data';
  cost_usd_note: string;
}

export async function getCostToProof(): Promise<CostToProofEntry[]> {
  const res = await api.get<{ capabilities: CostToProofEntry[] }>('/api/admin/dashboard/cost-to-proof');
  return res.data.capabilities;
}

export interface EntityCluster {
  entity_type: string;
  entity_id: string;
  ticket_ids: string[];
}

export interface ResourceCluster {
  target_id: string;
  ticket_ids: string[];
}

export interface RelatedWorkClusters {
  entity_clusters: EntityCluster[];
  resource_clusters: ResourceCluster[];
}

export async function getRelatedWorkClusters(): Promise<RelatedWorkClusters> {
  const res = await api.get<RelatedWorkClusters>('/api/admin/dashboard/related-work-clusters');
  return res.data;
}

export interface OutcomeMeasurementsSummary {
  scheduled: number;
  observed: number;
  stable: number;
  recurrence_detected: number;
  insufficient_data: number;
}

export async function getOutcomeMeasurementsSummary(): Promise<OutcomeMeasurementsSummary> {
  const res = await api.get<OutcomeMeasurementsSummary>('/api/admin/dashboard/outcome-measurements');
  return res.data;
}
