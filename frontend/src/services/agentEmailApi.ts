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

/** One message someone sent to the agent's address (agent comms, 2026-11-22). */
export interface AgentInboundItem {
  id: string;
  fromAddress: string | null;
  subject: string | null;
  preview: string;
  leadId: number | null;
  receivedAt: string;
  /** What happened to it: queued (a reply draft is waiting), blocked, rate_capped, ... */
  draftOutcome: string | null;
  draftReason: string | null;
}

/**
 * Inbound mail.
 *
 * `reason` is non-null when the panel is UNAVAILABLE rather than empty: `no_agent_address` when
 * the agent has no email identity. The UI must say so instead of rendering an empty list:
 * "nobody replied" and "she has no address to be replied to" lead to opposite actions.
 */
export interface AgentInboundPanel {
  items: AgentInboundItem[];
  /** `identity_unavailable`: the address could not be read right now (not "she has none"). */
  reason: 'no_agent_address' | 'identity_unavailable' | null;
}

/** A reply the agent drafted to someone who wrote to her. Approving it SENDS it, from her address. */
export interface AgentPendingReply {
  id: string;
  toAddress: string;
  subject: string | null;
  /** The exact HTML that will be sent. */
  body: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

/** A call the agent placed with place_ai_call. The number is never sent to the browser in full. */
export interface AgentCall {
  id: string;
  leadId: number | null;
  phoneLast4: string | null;
  status: string;
  purpose: string | null;
  outcome: string | null;
  summary: string | null;
  summaryState: string | null;
  createdAt: string;
}

export interface AgentEmailInbox {
  agentName: string;
  /** From and Reply-To the agent sends with; null when she has no email identity. */
  identity?: { fromHeader: string; replyTo: string } | null;
  drafts: AgentEmailDraft[];
  sent: AgentSentItem[];
  inbound: AgentInboundPanel;
  pendingReplies?: { items: AgentPendingReply[]; reason: 'no_agent_address' | 'identity_unavailable' | null };
  calls?: AgentCall[];
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

/**
 * Decide a reply draft. These go through the ONE outbound review doorway
 * (POST /api/admin/maya/outbound/:id/approve|reject), not an agent-scoped route: approving SENDS
 * the reply, and that endpoint is the one gated to Ali or a super_admin. A 403 means "not you".
 */
export { approveOutboundMessage as approveAgentReply, rejectOutboundMessage as rejectAgentReply } from './mayaConsoleApi';
