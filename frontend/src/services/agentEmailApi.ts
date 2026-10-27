import api from '../utils/api';

// An agent's own correspondence (Ali, 2026-10-26: "Maya's inbox should go in her Agent dashboard
// that also has her decision making and tickets"). Backend: agentEmailInboxController.ts,
// GET /api/admin/agents/:id/email.
//
// SIBLING OF `managerInboxApi`, NOT A REPLACEMENT. That client serves the DECISION inbox
// (`/inbox`: pending proposals and the Decision Journal). This one serves mail (`/email`). The
// two are deliberately separate paths and separate clients so neither reads as the other.

/** A message the agent composed that has not been sent. */
export interface AgentEmailDraft {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  /** `agent_draft` while it awaits a decision, `agent_approved` once a human said yes. */
  status: string;
  /**
   * WHY it is a draft rather than a send: `tool_not_granted`,
   * `autonomy_insufficient:observe`, `no_brand_scope`, `agent_disabled`,
   * `transport_not_wired` and so on. This is the most useful column on the screen - it is the
   * difference between "waiting on a decision" and "waiting on configuration".
   */
  draftReason: string | null;
  createdAt: string;
  approvedBy: string | null;
}

export interface AgentSentItem {
  id: string;
  toAddress: string;
  subject: string | null;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
}

/**
 * Inbound replies.
 *
 * `reason` is non-null when the panel is UNAVAILABLE rather than empty - today always
 * `no_agent_address`, because no agent has a real address yet. The UI must say so instead of
 * rendering an empty list: "nobody replied" and "she has no address to be replied to" lead to
 * opposite actions.
 */
export interface AgentInboundPanel {
  items: never[];
  reason: 'no_agent_address' | null;
}

export interface AgentEmailInbox {
  agentName: string;
  drafts: AgentEmailDraft[];
  sent: AgentSentItem[];
  inbound: AgentInboundPanel;
}

export async function getAgentEmailInbox(agentId: string): Promise<AgentEmailInbox> {
  const res = await api.get<AgentEmailInbox>(`/api/admin/agents/${agentId}/email`);
  return res.data;
}

/**
 * Approve a draft. DOES NOT SEND.
 *
 * The response carries `sent: false` and says so, because the word "approve" invites exactly that
 * assumption. Separating the approval from the send is the repo's existing pattern
 * (`approvalApply.ts`: "APPROVAL NEVER SENDS").
 */
export async function approveAgentEmailDraft(
  agentId: string, draftId: string,
): Promise<{ success: boolean; sent: boolean }> {
  const res = await api.post<{ success: boolean; sent: boolean }>(
    `/api/admin/agents/${agentId}/email/${draftId}/approve`, {},
  );
  return res.data;
}

export async function discardAgentEmailDraft(
  agentId: string, draftId: string,
): Promise<{ success: boolean }> {
  const res = await api.post<{ success: boolean }>(
    `/api/admin/agents/${agentId}/email/${draftId}/discard`, {},
  );
  return res.data;
}
