import api from '../utils/api';

// Real-enforcement scoping, Phase 1 (2026-09-20) — the first real UI for the
// already-real backend routes (approvalRequestRoutes.ts). Same shape as
// managerInboxApi.ts's established client pattern.

export interface ApprovalRequestItem {
  id: string;
  agent_name: string;
  action: string;
  risk_tier: string;
  verdict: 'would_allow' | 'would_require_approval' | 'would_block';
  reason_code: string | null;
  prepared_action: Record<string, any> | null;
  status: 'shadow_logged' | 'pending' | 'approved' | 'rejected' | 'expired';
  expires_at: string | null;
  created_at: string;
}

interface ListResponse {
  items: ApprovalRequestItem[];
}

interface DecisionResponse {
  success: boolean;
  row: ApprovalRequestItem;
}

interface BulkApproveResponse {
  approved: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export async function listApprovalRequests(): Promise<ApprovalRequestItem[]> {
  const res = await api.get<ListResponse>('/api/admin/approval-requests');
  return res.data.items;
}

export async function approveApprovalRequestItem(id: string): Promise<DecisionResponse> {
  const res = await api.post<DecisionResponse>(`/api/admin/approval-requests/${id}/approve`);
  return res.data;
}

export async function rejectApprovalRequestItem(id: string): Promise<DecisionResponse> {
  const res = await api.post<DecisionResponse>(`/api/admin/approval-requests/${id}/reject`);
  return res.data;
}

export async function bulkApproveApprovalRequestItems(ids: string[]): Promise<BulkApproveResponse> {
  const res = await api.post<BulkApproveResponse>('/api/admin/approval-requests/bulk-approve', { ids });
  return res.data;
}
