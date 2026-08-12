/**
 * ticketReplyService — lets an allowlisted admin reply directly to the AI
 * Workforce approval email to approve/reject a ticket, instead of clicking
 * through to the dashboard. THREE independent checks gate every mutation
 * here: (1) a verified Mandrill signature on the inbound POST (enforced by
 * the caller, mandrillWebhookController, before this service is ever
 * invoked), (2) a per-ticket random token that's only ever transmitted in
 * the approval email itself — never rendered in the dashboard — so knowing
 * a ticket's UUID alone (visible to any admin who can browse the Tickets
 * board, a broader set than who may approve) is not enough to construct a
 * working reply address, and (3) the reply's From address matched against
 * the `admin_notification_emails` allowlist. Note: Mandrill's signature
 * proves the POST came from Mandrill's relay, not that the email's own
 * `From:` header is unspoofed — the token (2) is what actually closes that
 * gap for an external attacker who doesn't have the token.
 *
 * Intent parsing is deliberately keyword-based, not LLM-based: an approval
 * decision is binary, and running untrusted email content through an LLM to
 * decide whether to approve/reject a ticket would be a prompt-injection
 * surface for no real benefit over a simple, deterministic keyword match.
 */
import { Op } from 'sequelize';
import Ticket from '../../models/Ticket';
import TicketActivity from '../../models/TicketActivity';
import ProposedAgentAction from '../../models/ProposedAgentAction';
import { updateTicketStatus, addTicketComment } from '../ticketService';
import { getSetting } from '../settingsService';
import { sendTicketReplyConfirmation } from '../emailService';
import { topReplyText } from '../unsubscribeEnforcementService';
import { env } from '../../config/env';

export interface TicketReplyResult {
  handled: boolean;
  reason: string;
  newStatus?: string;
}

const APPROVE_KEYWORDS = ['approve', 'approved', 'yes', 'ok', 'okay', 'go ahead', 'lgtm', 'sounds good'];
const REJECT_KEYWORDS = ['reject', 'rejected', 'no', 'decline', 'declined', "don't", 'do not', 'stop', 'skip this'];

/** Same degrade path as emailService.getAdminRecipients() (single env.emailFrom address
 *  when the setting is unset) — so the send side and the reply-authorization side never
 *  silently disagree about who's allowed. */
async function isAuthorizedApprover(fromEmail: string): Promise<boolean> {
  const raw = (await getSetting('admin_notification_emails')) || '';
  const rawList = String(raw).trim() ? String(raw) : env.emailFrom;
  const allowlist = rawList.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(fromEmail.trim().toLowerCase());
}

type Intent = 'approve' | 'reject' | 'ambiguous';

function detectIntent(replyText: string): Intent {
  const lines = replyText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  for (const line of lines) {
    if (REJECT_KEYWORDS.some((kw) => line.includes(kw))) return 'reject';
    if (APPROVE_KEYWORDS.some((kw) => line.includes(kw))) return 'approve';
  }
  return 'ambiguous';
}

/** Mandrill can redeliver the same inbound event (e.g. after a batch-level failure
 *  elsewhere in the same POST) — the same sender posting the identical reply text for
 *  the same ticket within a few minutes is treated as a redelivery, not a second reply,
 *  so a retry can never produce a duplicate comment or a duplicate confirmation email. */
async function isDuplicateRedelivery(ticketId: string, fromEmail: string, replyText: string): Promise<boolean> {
  const recent = await TicketActivity.findOne({
    where: {
      ticket_id: ticketId,
      actor_id: fromEmail,
      action: 'commented',
      comment: replyText,
      created_at: { [Op.gte]: new Date(Date.now() - 5 * 60 * 1000) },
    },
    order: [['created_at', 'DESC']],
  });
  return !!recent;
}

/** Sync the linked ProposedAgentAction so the two records never drift — best-effort,
 *  the ticket status change above is the record of truth regardless of this outcome. */
async function syncProposal(ticket: Ticket, status: 'approved' | 'rejected', reviewedBy: string, notes: string): Promise<void> {
  if (ticket.entity_type !== 'proposed_agent_action' || !ticket.entity_id) return;
  try {
    await ProposedAgentAction.update(
      { status, reviewed_by: reviewedBy, reviewed_at: new Date(), review_notes: notes },
      { where: { id: ticket.entity_id } },
    );
  } catch (err: any) {
    console.warn(`[ticketReplyService] Failed to sync ProposedAgentAction ${ticket.entity_id}:`, err.message);
  }
}

/** Best-effort — a failed confirmation never undoes the ticket mutation above. */
async function confirmByEmail(to: string, ticket: Ticket, outcome: 'done' | 'cancelled' | 'commented'): Promise<void> {
  try {
    await sendTicketReplyConfirmation({ to, ticketNumber: ticket.ticket_number, title: ticket.title, outcome });
  } catch (err: any) {
    console.warn(`[ticketReplyService] Confirmation email failed for ticket ${ticket.id}:`, err.message);
  }
}

/**
 * Handle one inbound email reply already routed to a specific ticket ID (by the
 * controller, via the ticket-<id>-<token>@ reply address) and already
 * signature-verified. Caller-supplied `fromEmail`/`rawBody` come straight from the
 * Mandrill payload.
 */
export async function handleTicketReplyEmail(params: {
  ticketId: string;
  replyToken: string;
  fromEmail: string;
  rawBody: string;
}): Promise<TicketReplyResult> {
  const authorized = await isAuthorizedApprover(params.fromEmail);
  if (!authorized) {
    console.warn(`[ticketReplyService] Reply from non-allowlisted sender ${params.fromEmail} for ticket ${params.ticketId} — ignored`);
    return { handled: false, reason: 'sender_not_authorized' };
  }

  const ticket = await Ticket.findByPk(params.ticketId);
  if (!ticket) {
    console.warn(`[ticketReplyService] Reply for unknown ticket ${params.ticketId}`);
    return { handled: false, reason: 'ticket_not_found' };
  }

  const expectedToken = ticket.metadata?.reply_token;
  if (!expectedToken || expectedToken !== params.replyToken) {
    console.warn(`[ticketReplyService] Reply token mismatch for ticket ${params.ticketId} from ${params.fromEmail} — ignored`);
    return { handled: false, reason: 'invalid_reply_token' };
  }

  // topReplyText() (shared with the Lead-reply unsubscribe-detection path) already
  // strips quoted history and lowercases the result.
  const replyText = topReplyText(params.rawBody);

  if (await isDuplicateRedelivery(ticket.id, params.fromEmail, replyText)) {
    console.log(`[ticketReplyService] Duplicate redelivery for ticket ${ticket.id} from ${params.fromEmail} — skipped`);
    return { handled: true, reason: 'duplicate_redelivery' };
  }

  // Only a ticket actually awaiting approval can be moved by a reply. For anything else
  // (already done/cancelled, or mid-progress with no approval pending), the reply is
  // recorded as a comment only — never silently discarded, but never used to force a
  // status transition that wasn't being asked for.
  if (ticket.status !== 'in_review') {
    await addTicketComment(ticket.id, `[email reply, no status change — ticket was "${ticket.status}"] ${replyText}`, 'human', params.fromEmail);
    await confirmByEmail(params.fromEmail, ticket, 'commented');
    return { handled: true, reason: 'ticket_not_awaiting_approval' };
  }

  const intent = detectIntent(replyText);

  if (intent === 'ambiguous') {
    await addTicketComment(ticket.id, `[email reply — could not determine approve/reject, left in_review] ${replyText}`, 'human', params.fromEmail);
    await confirmByEmail(params.fromEmail, ticket, 'commented');
    return { handled: true, reason: 'ambiguous_intent' };
  }

  const newStatus = intent === 'approve' ? 'done' : 'cancelled';
  await updateTicketStatus(ticket.id, newStatus, 'human', params.fromEmail);
  await addTicketComment(ticket.id, replyText, 'human', params.fromEmail);
  await syncProposal(ticket, intent === 'approve' ? 'approved' : 'rejected', params.fromEmail, replyText);
  await confirmByEmail(params.fromEmail, ticket, newStatus);

  return { handled: true, reason: intent, newStatus };
}
