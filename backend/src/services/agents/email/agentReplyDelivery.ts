/**
 * agentReplyDelivery - which identity an approved reply goes out as, and how it is recorded
 * (agent comms tool, 2026-11-22). Called lazily from maya/mayaOutboundDelivery.ts so the approve
 * path's import graph (mayaOutboundContainment.test.ts) stays as pinned.
 *
 *   composed_by 'agent_reply:<slug>:<ref>'  an agent's answer to mail addressed to it (any agent)
 *   composed_by 'maya_reply:<leadId>'       Maya's answer to a reply on one of her campaigns
 *
 * Both go out as the agent (From "Maya" <maya@colaberry.com>, Reply-To maya@reply.colaberry.ai).
 * A Maya campaign reply whose identity cannot be resolved falls back to the old sender rather than
 * failing; an agent_reply row cannot (it has no other sender) and fails loudly instead.
 */
import type MayaOutboundApproval from '../../../models/MayaOutboundApproval';
import { identityForSlug, resolveAgentEmailIdentity, type AgentEmailIdentity } from './agentEmailIdentity';

export const AGENT_REPLY_PREFIX = 'agent_reply:';

export function isAgentReplyRow(row: Pick<MayaOutboundApproval, 'composed_by'>): boolean {
  return String(row.composed_by || '').startsWith(AGENT_REPLY_PREFIX);
}

/** 'agent_reply:<slug>:<ref>' -> slug. */
export function slugOfAgentRow(row: Pick<MayaOutboundApproval, 'composed_by'>): string | null {
  const m = /^agent_reply:([a-z][a-z0-9-]{1,30}):/.exec(String(row.composed_by || ''));
  return m ? m[1] : null;
}

export async function identityForRow(row: Pick<MayaOutboundApproval, 'composed_by'>): Promise<AgentEmailIdentity | null> {
  if (isAgentReplyRow(row)) {
    const slug = slugOfAgentRow(row);
    return slug ? identityForSlug(slug) : null;
  }
  if (String(row.composed_by || '').startsWith('maya_reply:')) return resolveAgentEmailIdentity('Maya');
  return null;
}

/**
 * The original message an agent_reply answers, for In-Reply-To/References: the ref in
 * 'agent_reply:<slug>:<ref>' is the inbound Message-Id when there was one (it has an @).
 */
export function inReplyToOfRow(row: Pick<MayaOutboundApproval, 'composed_by'>): string | null {
  const m = /^agent_reply:[a-z][a-z0-9-]{1,30}:(.+)$/.exec(String(row.composed_by || ''));
  const ref = m ? m[1].trim().replace(/^<|>$/g, '') : '';
  return ref.includes('@') && /^[^\s<>]+$/.test(ref) ? `<${ref}>` : null;
}

const leadIdOf = (recipientRef: unknown): number | null => {
  const m = /^lead:(\d+)$/.exec(String(recipientRef || ''));
  return m ? Number(m[1]) : null;
};

/**
 * Record a delivered agent_reply on the unified communication log, attributed to the agent so the
 * dashboard shows it under Sent. A recording failure is logged and never turns a delivered message
 * into a failed one (the person has the email; reporting otherwise would invite a second send).
 */
export async function recordAgentReply(row: MayaOutboundApproval, identity: AgentEmailIdentity, providerMessageId: string | null): Promise<void> {
  try {
    const { logCommunication } = await import('../../communicationLogService');
    await logCommunication({
      lead_id: leadIdOf(row.recipient_ref), channel: 'email', direction: 'outbound', delivery_mode: 'live', status: 'sent',
      to_address: row.recipient_address, from_address: identity.fromAddress, subject: row.subject ?? null, body: row.body,
      provider: 'mandrill', provider_message_id: providerMessageId,
      metadata: { agent_name: identity.agentName, agent_reply: true, outbound_approval_id: row.id, decided_by: row.decided_by ?? null },
    });
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', service: 'agent-email', event: 'agent_reply_record_failed', outcome: 'failure',
      error_class: (err as Error)?.name || 'UnknownError', context: { id: row.id, agent: identity.agentName } }));
  }
}
