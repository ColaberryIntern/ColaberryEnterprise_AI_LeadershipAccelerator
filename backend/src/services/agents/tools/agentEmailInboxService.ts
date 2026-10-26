import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { AGENT_DRAFT_STATUS, AGENT_EMAIL_TOOL } from './agentEmailTool';

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
 * ── APPROVAL NEVER SENDS ────────────────────────────────────────────────────
 *
 * `approveAgentDraft` flips the status and writes who approved it. It does not mail anybody. That
 * is not a limitation of this change, it is the repo's existing precedent, stated in
 * `growthJourney/execution/approvalApply.ts`: "APPROVAL NEVER SENDS. It flips
 * `pending_review -> approved` and writes the ledger row." Keeping the two acts separate is what
 * makes an approval auditable and a send revocable right up to the moment it leaves.
 *
 * ── ABSENCE IS REPORTED, NOT RENDERED AS ZERO ───────────────────────────────
 *
 * Inbound replies need an agent address that exists and is synced, and no agent has one yet. So
 * `inbound.reason` says `no_agent_address` rather than returning `[]`, because an empty list reads
 * as "nobody replied" when the truth is "she has no address to be replied to". Those lead to
 * opposite actions.
 */

export type DraftStatus = typeof AGENT_DRAFT_STATUS | 'agent_approved';

/** Set when a human approves a draft. Still not a send; see the docblock. */
export const AGENT_APPROVED_STATUS = 'agent_approved';

export interface AgentDraft {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
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

/** A panel that may be legitimately unavailable, as opposed to empty. */
export interface InboundPanel {
  items: never[];
  /** Null when the panel is genuinely available. Non-null names why it is not. */
  reason: 'no_agent_address' | null;
}

export interface AgentEmailInbox {
  agentName: string;
  drafts: AgentDraft[];
  sent: AgentSentItem[];
  inbound: InboundPanel;
}

interface DraftRow {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  created_at: Date | string;
  metadata: unknown;
}

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Everything this agent has drafted or sent.
 *
 * Scoped by `metadata->>'agent_name'`, which `agentEmailTool` writes on every draft. NOT by
 * sender address: addresses are per brand today and shared, so an address filter would show one
 * agent another's mail. The agent name is the only field that identifies the author.
 */
export async function getAgentEmailInbox(agentName: string): Promise<AgentEmailInbox> {
  const drafts = await readDrafts(agentName);
  const sent = await readSent(agentName);
  return {
    agentName,
    drafts,
    sent,
    // Hard-coded until an agent actually has an address. When sender profiles become per-agent
    // this reads the profile and matches `inbox_emails.to_addresses` on the threading token.
    inbound: { items: [], reason: 'no_agent_address' },
  };
}

async function readDrafts(agentName: string): Promise<AgentDraft[]> {
  try {
    const rows = await sequelize.query<DraftRow>(
      `SELECT id, to_email, subject, body, status, created_at, metadata
         FROM scheduled_emails
        WHERE status IN ($draftStatus, $approvedStatus)
          AND metadata->>'agent_name' = $agentName
          AND metadata->>'tool' = $tool
        ORDER BY created_at DESC
        LIMIT 200`,
      {
        bind: {
          draftStatus: AGENT_DRAFT_STATUS,
          approvedStatus: AGENT_APPROVED_STATUS,
          agentName,
          tool: AGENT_EMAIL_TOOL,
        },
        type: QueryTypes.SELECT,
      },
    );
    return rows.map((r) => ({
      id: r.id,
      toEmail: r.to_email,
      subject: r.subject,
      body: r.body,
      status: r.status,
      draftReason: metaString(r.metadata, 'draft_reason'),
      createdAt: new Date(r.created_at).toISOString(),
      approvedBy: metaString(r.metadata, 'approved_by'),
    }));
  } catch (err) {
    logFailure('agent_email_drafts_read_failed', err);
    return [];
  }
}

async function readSent(agentName: string): Promise<AgentSentItem[]> {
  try {
    const rows = await sequelize.query<{
      id: string; to_address: string; subject: string | null; status: string;
      sent_at: Date | string | null; error_message: string | null;
    }>(
      `SELECT id, to_address, subject, status, sent_at, error_message
         FROM communication_logs
        WHERE metadata->>'agent_name' = $agentName
        ORDER BY created_at DESC
        LIMIT 200`,
      { bind: { agentName }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => ({
      id: r.id,
      toAddress: r.to_address,
      subject: r.subject,
      status: r.status,
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      errorMessage: r.error_message,
    }));
  } catch (err) {
    logFailure('agent_email_sent_read_failed', err);
    return [];
  }
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
  return transition(draftId, AGENT_DRAFT_STATUS, 'cancelled', discardedBy);
}

async function transition(
  draftId: string,
  from: string,
  to: string,
  actor: string,
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
        WHERE id = $draftId
          AND status = $from
          AND metadata->>'tool' = $tool`,
      { bind: { to, from, draftId, actor, tool: AGENT_EMAIL_TOOL } },
    );
    const changed = typeof meta === 'number' ? meta : (meta as { rowCount?: number })?.rowCount ?? 0;
    if (!changed) return { ok: false, reason: 'not_in_expected_state' };
    return { ok: true, reason: null };
  } catch (err) {
    logFailure('agent_email_draft_transition_failed', err);
    return { ok: false, reason: 'transition_failed' };
  }
}

function logFailure(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event,
    error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
    outcome: 'failure',
    message: err instanceof Error ? err.message : String(err),
  }));
}

export default getAgentEmailInbox;
