import api from '../utils/api';

// AI Workforce Management, Checkpoint A (2026-09-01) — thin client for the
// real, already-live per-agent Manager Inbox (backend:
// GET /api/admin/agents/:id/inbox, managerInboxService.ts). Same shape as
// ManagerInboxItemView on the backend.
//
// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — approve/reject
// added (real, agent-scoped executors, backend: managerInboxController.ts),
// plus targetTable/targetId so the UI can tell a real executor
// (target_table === 'scheduled_emails') apart from a decorative one before
// the manager clicks Approve.

export interface ManagerInboxItem {
  id: string;
  actionType: string;
  reason: string;
  confidence: number;
  priorityScore: number | null;
  riskScore: number | null;
  impactScore: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'applied';
  createdAt: string;
  expiresAt: string | null;
  targetTable: string | null;
  targetId: string | null;
}

interface ManagerInboxResponse {
  agentId: string;
  items: ManagerInboxItem[];
}

interface InboxDecisionResponse {
  success: boolean;
  applied?: boolean;
  item: ManagerInboxItem;
}

/** An agent with nothing pending returns `[]` — the honest empty state, never
 * an error. A 404 (agent not found) surfaces as a thrown error, same as
 * every other call through the shared `api` client — the caller already
 * knows the agent exists by the time it asks for its inbox. */
export async function getManagerInboxItems(agentId: string): Promise<ManagerInboxItem[]> {
  const res = await api.get<ManagerInboxResponse>(`/api/admin/agents/${agentId}/inbox`);
  return res.data.items;
}

/** `applied` mirrors the real executor outcome — true only when
 * `targetTable === 'scheduled_emails'` triggered a real downstream write.
 * Every other proposal type returns `applied: false`, matching what the
 * backend actually did (a status flip, nothing more). */
export async function approveInboxItem(agentId: string, proposalId: string, notes?: string): Promise<InboxDecisionResponse> {
  const res = await api.post<InboxDecisionResponse>(`/api/admin/agents/${agentId}/inbox/${proposalId}/approve`, { notes });
  return res.data;
}

export async function rejectInboxItem(agentId: string, proposalId: string, notes?: string): Promise<InboxDecisionResponse> {
  const res = await api.post<InboxDecisionResponse>(`/api/admin/agents/${agentId}/inbox/${proposalId}/reject`, { notes });
  return res.data;
}
