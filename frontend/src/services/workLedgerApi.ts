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
