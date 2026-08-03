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
