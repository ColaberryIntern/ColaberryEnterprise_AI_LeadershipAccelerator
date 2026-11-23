/**
 * agentEmailTransport - send an APPROVED agent email as the agent (agent comms tool, 2026-11-22).
 *
 * Ali: "Maya would be maya@colaberry.com". The message goes From "Maya" <maya@colaberry.com> with
 * Reply-To maya@reply.colaberry.ai (Mandrill receives that domain), so the person's reply comes back
 * to Maya. It is only ever called from the approval queue's delivery step, after a person approved
 * the exact bytes; it transmits what it is given and renders nothing.
 *
 * Uses emailService's one transport chokepoint (guardedSendMail: kill switch, dev guard) and its
 * normal test-mode redirect (resolveEmailRecipient). emailService.ts is over the size ceiling, so
 * this lives here instead of growing it.
 *
 * Returns the sendOnce callback shape: { ok, messageId } or { ok:false, error, errorClass }. A
 * blocked send (kill switch, dev guard, no SMTP) is ok:false, never reported as sent.
 */
import type { AgentEmailIdentity } from './agentEmailIdentity';

export interface AgentSendResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  errorClass?: string;
}

export async function sendAgentEmail(input: { identity: AgentEmailIdentity; to: string; subject: string; html: string; inReplyTo?: string | null }): Promise<AgentSendResult> {
  // The queue refuses empty bodies too; this keeps the guard sendPreRenderedEmail had on this path.
  if (!String(input.html || '').trim()) return { ok: false, error: 'refusing to send an empty body', errorClass: 'ContractViolation' };
  const { env } = await import('../../../config/env');
  if (!env.mandrillApiKey) return { ok: false, error: 'SMTP not configured', errorClass: 'UpstreamUnavailable' };
  const { guardedSendMail, resolveEmailRecipient, htmlToPlainText, emailHeaders } = await import('../../emailService');
  try {
    const r = await resolveEmailRecipient(input.to, input.subject);
    const info = await guardedSendMail({
      from: input.identity.fromHeader,
      replyTo: `"${input.identity.displayName}" <${input.identity.replyTo}>`,
      to: r.to,
      subject: r.subject,
      html: input.html,
      text: htmlToPlainText(input.html),
      // Threads the reply under the message it answers, in the person's mail client.
      headers: { ...emailHeaders(`agent-email-${input.identity.slug}`), ...(input.inReplyTo ? { 'In-Reply-To': input.inReplyTo, References: input.inReplyTo } : {}) },
    });
    const response = String((info as { response?: string })?.response || '');
    if (response.startsWith('blocked_')) return { ok: false, error: response, errorClass: 'SendBlocked' };
    const rejected = (info as { rejected?: unknown[] })?.rejected;
    if (Array.isArray(rejected) && rejected.length && !(info as { accepted?: unknown[] })?.accepted?.length) {
      return { ok: false, error: 'recipient rejected', errorClass: 'ProviderRejected' };
    }
    return { ok: true, messageId: String((info as { messageId?: string })?.messageId || '').replace(/[<>]/g, '') || null };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err).slice(0, 200), errorClass: (err as Error)?.name || 'UpstreamUnavailable' };
  }
}
