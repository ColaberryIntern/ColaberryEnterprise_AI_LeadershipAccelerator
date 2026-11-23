import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { AGENT_DRAFT_STATUS, AGENT_EMAIL_TOOL } from './agentEmailTool';

/**
 * The read side of an agent's dashboard (split out of agentEmailInboxService, T11 agent comms).
 *
 * Every reader is scoped by the agent, never by a shared sender address, and every reader fails to
 * an EMPTY list with a structured error log rather than throwing, so one broken panel never takes
 * the page down. The panels:
 *   drafts          scheduled_emails agent_draft / agent_approved rows (agentEmailTool)
 *   sent            outbound EMAIL rows in communication_logs attributed to the agent
 *   inbound         inbound email rows attributed to the agent (mail to <slug>@reply...)
 *   pendingReplies  reply drafts waiting on a person (maya_outbound_approvals, composed_by
 *                   'agent_reply:<slug>:%', and Maya's older 'maya_reply:%')
 *   calls           voice rows attributed to the agent, with the call summary (T10)
 */

export const AGENT_APPROVED_STATUS = 'agent_approved';

export interface AgentDraft { id: string; toEmail: string; subject: string; body: string; status: string; draftReason: string | null; createdAt: string; approvedBy: string | null }
export interface AgentSentItem { id: string; toAddress: string; subject: string | null; status: string; sentAt: string | null; errorMessage: string | null }
export interface InboundItem { id: string; fromAddress: string | null; subject: string | null; preview: string; leadId: number | null; receivedAt: string; draftOutcome: string | null; draftReason: string | null }
export interface PendingReply { id: string; toAddress: string; subject: string | null; body: string; status: string; createdAt: string; expiresAt: string | null }
export interface AgentCall { id: string; leadId: number | null; phoneLast4: string | null; status: string; purpose: string | null; outcome: string | null; summary: string | null; summaryState: string | null; createdAt: string }

const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);

export function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

export function logFailure(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    error_class: err instanceof Error ? err.constructor.name : 'UnknownError', outcome: 'failure',
    message: err instanceof Error ? err.message : String(err),
  }));
}

async function read<T extends object, R>(event: string, sql: string, bind: Record<string, unknown>, map: (r: T) => R): Promise<R[]> {
  try {
    const rows = await sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });
    return rows.map(map);
  } catch (err) {
    logFailure(event, err);
    return [];
  }
}

export function readDrafts(agentName: string): Promise<AgentDraft[]> {
  return read<{ id: string; to_email: string; subject: string; body: string; status: string; created_at: Date | string; metadata: unknown }, AgentDraft>(
    'agent_email_drafts_read_failed',
    `SELECT id, to_email, subject, body, status, created_at, metadata
       FROM scheduled_emails
      WHERE status IN ($draftStatus, $approvedStatus) AND metadata->>'agent_name' = $agentName AND metadata->>'tool' = $tool
      ORDER BY created_at DESC LIMIT 200`,
    { draftStatus: AGENT_DRAFT_STATUS, approvedStatus: AGENT_APPROVED_STATUS, agentName, tool: AGENT_EMAIL_TOOL },
    (r) => ({ id: r.id, toEmail: r.to_email, subject: r.subject, body: r.body, status: r.status,
      draftReason: metaString(r.metadata, 'draft_reason'), createdAt: new Date(r.created_at).toISOString(), approvedBy: metaString(r.metadata, 'approved_by') }),
  );
}

/** communication_logs has no sent_at column; the row is written when the message goes out. */
export function readSent(agentName: string): Promise<AgentSentItem[]> {
  return read<{ id: string; to_address: string; subject: string | null; status: string; sent_at: Date | string | null; error_message: string | null }, AgentSentItem>(
    'agent_email_sent_read_failed',
    `SELECT id, to_address, subject, status, created_at AS sent_at, error_message
       FROM communication_logs
      WHERE metadata->>'agent_name' = $agentName AND direction = 'outbound' AND channel = 'email'
      ORDER BY created_at DESC LIMIT 200`,
    { agentName },
    (r) => ({ id: r.id, toAddress: r.to_address, subject: r.subject, status: r.status, sentAt: iso(r.sent_at), errorMessage: r.error_message }),
  );
}

export function readInbound(agentName: string): Promise<InboundItem[]> {
  return read<{ id: string; from_address: string | null; subject: string | null; preview: string | null; lead_id: number | null; created_at: Date | string; metadata: unknown }, InboundItem>(
    'agent_email_inbound_read_failed',
    `SELECT id, from_address, subject, left(coalesce(body, ''), 600) AS preview, lead_id, created_at, metadata
       FROM communication_logs
      WHERE metadata->>'agent_name' = $agentName AND direction = 'inbound' AND channel = 'email'
      ORDER BY created_at DESC LIMIT 100`,
    { agentName },
    (r) => ({ id: r.id, fromAddress: r.from_address, subject: r.subject, preview: r.preview || '', leadId: r.lead_id,
      receivedAt: new Date(r.created_at).toISOString(), draftOutcome: metaString(r.metadata, 'draft_outcome'), draftReason: metaString(r.metadata, 'draft_reason') }),
  );
}

/** The composed_by prefixes a reply draft BY this agent carries. Maya also owns her older 'maya_reply:' rows. */
export function replyPrefixesFor(agentName: string, slug: string): string[] {
  return [`agent_reply:${slug}:`, ...(agentName === 'Maya' ? ['maya_reply:'] : [])];
}

export function readPendingReplies(agentName: string, slug: string): Promise<PendingReply[]> {
  const [own, legacy] = replyPrefixesFor(agentName, slug);
  return read<{ id: string; recipient_address: string; subject: string | null; body: string; status: string; created_at: Date | string; expires_at: Date | string | null }, PendingReply>(
    'agent_email_pending_replies_read_failed',
    `SELECT id, recipient_address, subject, body, status, created_at, expires_at
       FROM maya_outbound_approvals
      WHERE status = 'pending_approval' AND channel = 'email'
        AND (starts_with(composed_by, $own) OR ($legacy::text IS NOT NULL AND starts_with(composed_by, $legacy::text)))
      ORDER BY created_at DESC LIMIT 100`,
    { own, legacy: legacy ?? null },
    (r) => ({ id: r.id, toAddress: r.recipient_address, subject: r.subject, body: r.body, status: r.status, createdAt: new Date(r.created_at).toISOString(), expiresAt: iso(r.expires_at) }),
  );
}

/** A 'reserving' row is a call being dialed right now (agentCallTool's reservation). */
export function readCalls(agentName: string): Promise<AgentCall[]> {
  return read<{ id: string; lead_id: number | null; to_address: string | null; status: string; created_at: Date | string; metadata: unknown }, AgentCall>(
    'agent_calls_read_failed',
    `SELECT id, lead_id, to_address, status, created_at, metadata
       FROM communication_logs
      WHERE metadata->>'agent_name' = $agentName AND channel = 'voice'
      ORDER BY created_at DESC LIMIT 100`,
    { agentName },
    (r) => {
      const digits = String(r.to_address || '').replace(/\D/g, '');
      return {
        id: r.id, leadId: r.lead_id, phoneLast4: digits.length >= 4 ? digits.slice(-4) : null,
        status: r.status === 'reserving' ? 'dialing' : r.status,
        purpose: metaString(r.metadata, 'purpose'), outcome: metaString(r.metadata, 'outcome'),
        summary: metaString(r.metadata, 'summary'), summaryState: metaString(r.metadata, 'summary_state'),
        createdAt: new Date(r.created_at).toISOString(),
      };
    },
  );
}
