/**
 * agentRecipientRouter - mail addressed to an agent reaches that agent (agent comms tool, 2026-11-22).
 *
 * Ali: "a fake email that can be responded to by the agent. Maya would be maya@colaberry.com and be
 * recorded in the agent email communication dashboard." Replies come in at <slug>@reply.colaberry.ai
 * (Mandrill inbound). Three small hooks in mandrillWebhookController, nothing else changes there:
 *
 *  (a) routeUnknownSenderToAgent - BEFORE the lead lookup. Mail to an agent from someone with NO Lead
 *      row used to be dropped ("No lead found"). Now the agent owns it: loop guard, abuse caps, the
 *      inbound recorded on the agent's dashboard (deduped on Message-Id), and a draft queued for a
 *      person to approve.
 *  (b) agentStampFor - lead-matched mail keeps the whole existing flow; its inbound log just gains
 *      metadata.agent_name when it was addressed to an agent.
 *  (c) draftForAgentAddressedLead - after Maya's campaign drafter declines a lead-matched message, an
 *      agent-addressed one is drafted by that agent instead of getting the generic auto-reply.
 *
 * Every function here returns; none throws into the webhook. A failure is logged with error_class and
 * the existing flow carries on.
 *
 * Abuse caps (any internet sender can reach (a)): 3 inbound messages per sender per 24h across ALL
 * agents (so one sender cannot fan out over several agent addresses), 50
 * unknown-sender drafts per agent per Central day. Over a cap the inbound is still recorded, with
 * draft_reason 'rate_capped', and no model call is made.
 */
import type { AgentEmailIdentity } from '../agents/email/agentEmailIdentity';
import type { DraftResult, InboundForAgent } from '../agents/email/agentReplyDraftService';

export const PER_SENDER_DAILY_CAP = 3;
export const PER_AGENT_UNKNOWN_DAILY_CAP = 50;

export interface InboundMsg {
  email?: string;
  from_email?: string;
  from_name?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string | undefined>;
}

export interface RouterDeps {
  agentForRecipient: (address: unknown) => Promise<AgentEmailIdentity | null>;
  isAgentOwnAddress: (address: unknown, identity: AgentEmailIdentity) => boolean;
  leadExists: (email: string) => Promise<boolean>;
  inboundSeen: (messageId: string) => Promise<boolean>;
  /** Inbound mail from this address in the last 24h, to ANY agent. */
  recentFromSender: (address: string) => Promise<number>;
  unknownToday: (agentName: string) => Promise<number>;
  recordInbound: (row: { agentName: string; fromAddress: string; toAddress: string; subject: string; body: string; messageId: string | null; inReplyTo: string | null }) => Promise<string | null>;
  markInbound: (logId: string, meta: Record<string, unknown>) => Promise<void>;
  draft: (identity: AgentEmailIdentity, m: InboundForAgent) => Promise<DraftResult>;
}

const log = (event: string, outcome: 'success' | 'failure' | 'skipped', context: Record<string, unknown>, error_class?: string) =>
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify({
    level: outcome === 'failure' ? 'error' : 'info', service: 'agent-inbound', event, outcome, ...(error_class ? { error_class } : {}), context,
  }));

/**
 * A stable error_class. A generic `Error` is not a classification (CLAUDE.md Observability), so it
 * falls back to the site's own class; Sequelize errors collapse to DatabaseError.
 */
export function errorClassOf(err: unknown, fallback: string): string {
  const name = err instanceof Error ? err.name : '';
  if (/^Sequelize/.test(name)) return 'DatabaseError';
  return name && name !== 'Error' ? name : fallback;
}

const header = (msg: InboundMsg, name: string): string | null => {
  const h = msg.headers || {};
  const v = h[name] ?? h[name.toLowerCase()];
  return v ? String(v) : null;
};

const messageIdOf = (msg: InboundMsg): string | null => (header(msg, 'Message-Id') || '').replace(/[<>\s]/g, '') || null;

/** Machine-sent mail (auto-replies, bounces) never gets an agent answer: that is how loops start. */
export function isAutomated(msg: InboundMsg): boolean {
  const auto = (header(msg, 'Auto-Submitted') || '').trim().toLowerCase();
  return Boolean(auto && auto !== 'no') || /^(mailer-daemon|postmaster)@/i.test(String(msg.from_email || ''));
}

async function safeAgent(msg: InboundMsg, deps: Pick<RouterDeps, 'agentForRecipient'>): Promise<AgentEmailIdentity | null> {
  try {
    return await deps.agentForRecipient(msg.email);
  } catch (err) {
    log('agent_recipient_lookup_failed', 'failure', { message: String((err as Error)?.message || err).slice(0, 200) }, errorClassOf(err, 'AgentLookupError'));
    return null;
  }
}

/** (a) Mail to an agent from someone with no Lead row. handled=true means the webhook is done with it. */
export async function routeUnknownSenderToAgent(msg: InboundMsg, fromEmail: string, subject: string, body: string, deps: RouterDeps): Promise<{ handled: boolean; outcome?: string }> {
  try {
    const identity = await safeAgent(msg, deps);
    if (!identity) return { handled: false };
    if (await deps.leadExists(fromEmail)) return { handled: false }; // the existing lead flow runs, with (b) and (c)

    if (deps.isAgentOwnAddress(fromEmail, identity) || isAutomated(msg)) {
      log('agent_inbound_loop_dropped', 'skipped', { agent: identity.agentName });
      return { handled: true, outcome: 'loop_dropped' };
    }

    const messageId = messageIdOf(msg);
    if (messageId && await deps.inboundSeen(messageId)) return { handled: true, outcome: 'replay' };

    const [fromSender, today] = await Promise.all([deps.recentFromSender(fromEmail), deps.unknownToday(identity.agentName)]);
    const logId = await deps.recordInbound({
      agentName: identity.agentName, fromAddress: fromEmail, toAddress: identity.replyTo, subject, body,
      messageId, inReplyTo: header(msg, 'In-Reply-To'),
    });
    if (fromSender >= PER_SENDER_DAILY_CAP || today >= PER_AGENT_UNKNOWN_DAILY_CAP) {
      if (logId) await deps.markInbound(logId, { draft_reason: 'rate_capped' });
      log('agent_inbound_rate_capped', 'skipped', { agent: identity.agentName, from_sender_24h: fromSender, unknown_today: today });
      return { handled: true, outcome: 'rate_capped' };
    }

    const r = await deps.draft(identity, { fromAddress: fromEmail, fromName: msg.from_name ?? null, subject, body, messageId, leadId: null });
    if (logId) await deps.markInbound(logId, { draft_outcome: r.outcome, ...(r.reason ? { draft_reason: r.reason } : {}), ...(r.queueId ? { outbound_approval_id: r.queueId } : {}) });
    log('agent_inbound_routed', 'success', { agent: identity.agentName, outcome: r.outcome });
    return { handled: true, outcome: r.outcome };
  } catch (err) {
    log('agent_inbound_route_failed', 'failure', { message: String((err as Error)?.message || err).slice(0, 200) }, errorClassOf(err, 'AgentInboundRouteError'));
    return { handled: false };
  }
}

/** (b) Extra inbound-log metadata for a lead-matched message addressed to an agent. */
export async function agentStampFor(msg: InboundMsg, deps: Pick<RouterDeps, 'agentForRecipient'>): Promise<Record<string, string>> {
  const identity = await safeAgent(msg, deps);
  return identity ? { agent_name: identity.agentName } : {};
}

/** (c) A lead-matched message to an agent that Maya's campaign drafter did not take: the agent drafts. */
export async function draftForAgentAddressedLead(msg: InboundMsg, lead: { id: number; name?: string | null }, fromEmail: string, subject: string, body: string,
  deps: Pick<RouterDeps, 'agentForRecipient' | 'isAgentOwnAddress' | 'draft'>): Promise<{ handled: boolean; outcome?: string }> {
  try {
    const identity = await safeAgent(msg, deps);
    if (!identity) return { handled: false };
    if (deps.isAgentOwnAddress(fromEmail, identity) || isAutomated(msg)) return { handled: true, outcome: 'loop_dropped' };
    const r = await deps.draft(identity, { fromAddress: fromEmail, fromName: lead.name ?? null, subject, body, messageId: messageIdOf(msg), leadId: lead.id });
    log('agent_inbound_lead_drafted', 'success', { agent: identity.agentName, lead_id: lead.id, outcome: r.outcome });
    return { handled: true, outcome: r.outcome };
  } catch (err) {
    log('agent_inbound_lead_draft_failed', 'failure', { message: String((err as Error)?.message || err).slice(0, 200) }, errorClassOf(err, 'AgentInboundDraftError'));
    return { handled: false };
  }
}

/* ── production dependencies, all lazily imported ─────────────────────────── */

export function defaultRouterDeps(): RouterDeps {
  const q = async <T extends object>(sql: string, replacements: Record<string, unknown>): Promise<T[]> => {
    const { sequelize } = await import('../../config/database');
    const { QueryTypes } = await import('sequelize');
    return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  };
  return {
    agentForRecipient: async (a) => (await import('../agents/email/agentEmailIdentity')).agentForRecipient(a),
    isAgentOwnAddress: (a, id) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isAgentOwnAddress } = require('../agents/email/agentEmailIdentity');
      return isAgentOwnAddress(a, id);
    },
    leadExists: async (email) => (await q<{ n: string }>('SELECT count(*) AS n FROM leads WHERE lower(email) = :email', { email: email.toLowerCase() }))[0]?.n !== '0',
    inboundSeen: async (messageId) => (await q<{ n: string }>(
      "SELECT count(*) AS n FROM communication_logs WHERE direction = 'inbound' AND metadata->>'message_id' = :messageId", { messageId }))[0]?.n !== '0',
    recentFromSender: async (address) => Number((await q<{ n: string }>(
      `SELECT count(*) AS n FROM communication_logs WHERE direction = 'inbound' AND metadata->>'agent_name' IS NOT NULL
         AND lower(from_address) = :address AND created_at > now() - interval '24 hours'`, { address: address.toLowerCase() }))[0]?.n || 0),
    unknownToday: async (agentName) => Number((await q<{ n: string }>(
      `SELECT count(*) AS n FROM communication_logs WHERE direction = 'inbound' AND metadata->>'agent_name' = :agentName AND lead_id IS NULL
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'`, { agentName }))[0]?.n || 0),
    recordInbound: async (row) => {
      const { logCommunication } = await import('../communicationLogService');
      const created = await logCommunication({
        lead_id: null, channel: 'email', direction: 'inbound', delivery_mode: 'live', status: 'delivered',
        to_address: row.toAddress, from_address: row.fromAddress, subject: row.subject, body: row.body,
        provider: 'mandrill', provider_message_id: row.messageId,
        metadata: { agent_name: row.agentName, message_id: row.messageId, in_reply_to: row.inReplyTo },
      });
      const id: unknown = created?.get('id');
      return id == null ? null : String(id);
    },
    markInbound: async (logId, meta) => {
      await q('UPDATE communication_logs SET metadata = coalesce(metadata, \'{}\'::jsonb) || CAST(:meta AS jsonb) WHERE id = :logId RETURNING id', { logId, meta: JSON.stringify(meta) });
    },
    draft: async (identity, m) => {
      const { draftAgentReply, defaultDraftDeps } = await import('../agents/email/agentReplyDraftService');
      const { FREE_WORD_RULE } = await import('../content/bannedCopyRule');
      return draftAgentReply(identity, m, new RegExp(`\\b${FREE_WORD_RULE.word}\\b`, 'i'), defaultDraftDeps());
    },
  };
}
