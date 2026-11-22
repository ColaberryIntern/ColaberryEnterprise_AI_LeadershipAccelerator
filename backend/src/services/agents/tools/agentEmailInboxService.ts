import { sequelize } from '../../../config/database';
import { AGENT_DRAFT_STATUS, AGENT_EMAIL_TOOL } from './agentEmailTool';
import { resolveAgentEmailIdentity, type AgentEmailIdentity } from '../email/agentEmailIdentity';
import {
  AGENT_APPROVED_STATUS, logFailure, readCalls, readDrafts, readInbound, readPendingReplies, readSent,
  type AgentCall, type AgentDraft, type AgentSentItem, type InboundItem, type PendingReply,
} from './agentEmailInboxReaders';

/**
 * An agent's email, for her own dashboard.
 *
 * Ali, 2026-10-26: "Maya's inbox should go in her Agent dashboard that also has her decision
 * making and tickets."
 *
 * ── WHY THIS IS NOT OPTIONAL POLISH ────────────────────────────────────────
 *
 * `agentEmailTool` fails closed: every uncertainty becomes a row in `scheduled_emails` with status
 * `agent_draft`. Those rows currently have NOWHERE TO BE SEEN. A review queue nobody can open is
 * not a review queue - it is a silent accumulation, and the whole safety argument for drafting
 * instead of sending depends on a human actually seeing them.
 *
 * The page already has a `decisions` inbox (`getManagerInboxItems` - pending approvals and the
 * Decision Journal). That is a DIFFERENT inbox: it holds decisions, not correspondence. This is
 * her mail, sitting beside it.
 *
 * ── APPROVAL NEVER SENDS (agentEmailTool drafts) ────────────────────────────
 *
 * `approveAgentDraft` flips the status and writes who approved it. It does not mail anybody. That
 * is not a limitation of this change, it is the repo's existing precedent, stated in
 * `growthJourney/execution/approvalApply.ts`: "APPROVAL NEVER SENDS. It flips
 * `pending_review -> approved` and writes the ledger row." Keeping the two acts separate is what
 * makes an approval auditable and a send revocable right up to the moment it leaves.
 *
 * ── REPLY DRAFTS ARE DIFFERENT: APPROVING ONE SENDS IT, AS THE AGENT ─────────
 *
 * Agent comms (Ali, 2026-11-22: "draft, a person approves"). A reply to mail sent to the agent's
 * address lives in maya_outbound_approvals. This service only READS those rows (pendingReplies).
 * Deciding one goes through the ONE existing doorway, routes/admin/mayaOutboundRoutes.ts
 * (approve: requireCoryAuthorized, Ali or a super_admin; reject: any admin), which
 * mayaOutboundContainment.test.ts pins as the only caller of approveOutbound/rejectOutbound.
 * A second, manager-level approve route was considered and refused: it would widen who may send.
 *
 * ── ABSENCE IS REPORTED, NOT RENDERED AS ZERO ───────────────────────────────
 *
 * An agent with no email identity (no ai_agents.email_slug) gets `reason: 'no_agent_address'` on
 * inbound and pending replies rather than `[]`, because an empty list reads as "nobody replied"
 * when the truth is "she has no address to be replied to". Those lead to opposite actions.
 *
 * The readers live in agentEmailInboxReaders.ts.
 */

export type DraftStatus = typeof AGENT_DRAFT_STATUS | 'agent_approved';
export { AGENT_APPROVED_STATUS };
export type { AgentDraft, AgentSentItem, InboundItem, PendingReply, AgentCall };

/** A panel that may be legitimately unavailable, as opposed to empty. */
export interface InboundPanel {
  items: InboundItem[];
  /**
   * Null when the panel is genuinely available. Non-null names why it is not:
   * `no_agent_address` (she has none) or `identity_unavailable` (we could not read it right now).
   */
  reason: PanelReason;
}

/** Why a panel is unavailable. A read failure is never reported as "she has no address". */
export type PanelReason = 'no_agent_address' | 'identity_unavailable' | null;

export interface AgentReplyPanel {
  items: PendingReply[];
  reason: PanelReason;
}

export interface AgentEmailInbox {
  agentName: string;
  /** Null when the agent has no email identity. */
  identity: { fromHeader: string; replyTo: string } | null;
  drafts: AgentDraft[];
  sent: AgentSentItem[];
  inbound: InboundPanel;
  pendingReplies: AgentReplyPanel;
  calls: AgentCall[];
}

async function identityFor(agentName: string): Promise<{ identity: AgentEmailIdentity | null; failed: boolean }> {
  try {
    return { identity: await resolveAgentEmailIdentity(agentName), failed: false };
  } catch (err) {
    logFailure('agent_email_identity_read_failed', err);
    return { identity: null, failed: true };
  }
}

/**
 * Everything this agent has drafted, sent, received and dialed.
 *
 * Scoped by `metadata->>'agent_name'` (and, for reply drafts, the composed_by prefix), NOT by
 * sender address, so one agent never sees another's mail.
 */
export async function getAgentEmailInbox(agentName: string): Promise<AgentEmailInbox> {
  const { identity, failed } = await identityFor(agentName);
  const [drafts, sent, calls, inbound, pending] = await Promise.all([
    readDrafts(agentName), readSent(agentName), readCalls(agentName),
    identity ? readInbound(agentName) : Promise.resolve([] as InboundItem[]),
    identity ? readPendingReplies(agentName, identity.slug) : Promise.resolve([] as PendingReply[]),
  ]);
  const reason: PanelReason = identity ? null : failed ? 'identity_unavailable' : 'no_agent_address';
  return {
    agentName,
    identity: identity ? { fromHeader: identity.fromHeader, replyTo: identity.replyTo } : null,
    drafts, sent, calls,
    inbound: { items: inbound, reason },
    pendingReplies: { items: pending, reason },
  };
}

export interface DraftActionResult {
  ok: boolean;
  reason: string | null;
}

/**
 * Approve a draft. DOES NOT SEND.
 *
 * Only a row still in `agent_draft` may be approved, so a second click cannot re-approve and a
 * discarded draft cannot be revived. The approver is recorded on the row because "who said yes"
 * is the one fact an approval exists to capture.
 */
export async function approveAgentDraft(
  draftId: string,
  approvedBy: string,
): Promise<DraftActionResult> {
  if (!approvedBy) return { ok: false, reason: 'approver_required' };
  return transition(draftId, AGENT_DRAFT_STATUS, AGENT_APPROVED_STATUS, approvedBy);
}

/**
 * Discard a draft.
 *
 * Uses `cancelled`, the status this table already uses for "will not be sent", rather than
 * inventing a fourth agent-specific status. A discarded draft is not claimable either way.
 */
export async function discardAgentDraft(
  draftId: string,
  discardedBy: string,
): Promise<DraftActionResult> {
  return transition(draftId, AGENT_DRAFT_STATUS, 'cancelled', discardedBy, 'agent_draft_discarded');
}

/**
 * @param reason Recorded as `metadata.blocked_reason` when this transition is a cancellation.
 *   It is a parameter rather than a constant because this one function serves BOTH approve
 *   and discard, and an approval must not be stamped with a cancellation reason. The reason
 *   is written here instead of through services/scheduling/cancelScheduledMessage because the
 *   guarded single UPDATE below is what resolves two reviewers clicking at once — the
 *   affected-row count is the answer, and the helper cannot express that.
 */
async function transition(
  draftId: string,
  from: string,
  to: string,
  actor: string,
  reason?: string,
): Promise<DraftActionResult> {
  try {
    // Guarded on the CURRENT status inside the UPDATE, not read-then-write: two reviewers
    // clicking at once must not both succeed. The affected-row count is the answer.
    const [, meta] = await sequelize.query(
      `UPDATE scheduled_emails
          SET status = $to,
              metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('approved_by', $actor::text,
                                               'decided_at', now()::text)
                         || CASE WHEN $reason::text IS NULL THEN '{}'::jsonb
                                 ELSE jsonb_build_object('blocked_reason', $reason::text,
                                                         'cancelled_at', now()::text)
                            END
        WHERE id = $draftId
          AND status = $from
          AND metadata->>'tool' = $tool`,
      { bind: { to, from, draftId, actor, tool: AGENT_EMAIL_TOOL, reason: reason ?? null } },
    );
    const changed = typeof meta === 'number' ? meta : (meta as { rowCount?: number })?.rowCount ?? 0;
    if (!changed) return { ok: false, reason: 'not_in_expected_state' };
    return { ok: true, reason: null };
  } catch (err) {
    logFailure('agent_email_draft_transition_failed', err);
    return { ok: false, reason: 'transition_failed' };
  }
}

export default getAgentEmailInbox;
