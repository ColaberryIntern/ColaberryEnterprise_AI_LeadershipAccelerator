/**
 * The one place an inbound reply address is built.
 *
 * ## Why this is extracted rather than formatted twice
 *
 * The format was assembled inline in `emailService.ts`, in the middle of a 2,500-line file, as a
 * template literal. Anything else that wanted a reply address had to retype it, and a retyped
 * format string is correct until the day the domain or the prefix changes and only one copy moves.
 * `ticketReplyService.ts` parses this shape on the way back in, so a drift between the two is an
 * email that reaches Mandrill and routes nowhere, with nothing failing anywhere a test would see.
 *
 * ## The three parts, and what each one is for
 *
 * `reply.colaberry.ai` is the only Mandrill-inbound-routed domain colaberry.com mail actually
 * reaches: colaberry.com addresses, where Ali's real inbox lives, are plain Google Workspace
 * mailboxes Mandrill has no visibility into.
 *
 * The TICKET ID routes the reply back to that exact ticket without needing Message-ID or
 * In-Reply-To correlation, which no mail client can be trusted to preserve.
 *
 * The TOKEN is what authorizes the reply. It is only ever sent in the one email and is never
 * rendered in the dashboard, which matters because the ticket UUID alone is visible to any admin
 * on the board — so the id identifies and the token authenticates, and neither does the other's
 * job.
 *
 * ## No token means no address
 *
 * `ticketReplyAddress` returns `null` when either part is missing, rather than building an address
 * with a blank segment. An address like `ticket-abc-@reply.colaberry.ai` would look like a working
 * reply path in a mail client, accept a reply, and drop it: the worst available outcome, because
 * the person who replied has no way to know. A caller with nothing to route to sets no `replyTo`
 * at all, and the recipient sees that replies are not expected.
 */

import { env } from '../config/env';

export interface TicketReplyAddressParts {
  readonly ticketId: string | null | undefined;
  readonly replyToken: string | null | undefined;
}

/** The display name every outbound Colaberry reply address carries. */
export const REPLY_DISPLAY_NAME = 'Colaberry AI Workforce';

/**
 * The bare address, or `null` when it cannot be built honestly.
 *
 * Both parts are trimmed and checked. A whitespace-only token is the same as none: it would pass a
 * truthiness check and fail the authorization it exists to perform.
 */
export function ticketReplyAddress(parts: TicketReplyAddressParts): string | null {
  const id = typeof parts.ticketId === 'string' ? parts.ticketId.trim() : '';
  const token = typeof parts.replyToken === 'string' ? parts.replyToken.trim() : '';
  const domain = (env.mandrillInboundDomain ?? '').trim();
  if (!id || !token || !domain) return null;
  return `ticket-${id}-${token}@${domain}`;
}

/**
 * The same address with its display name, ready for a `replyTo` header, or `null`.
 *
 * Kept beside the bare form rather than left to each caller, because two call sites quoting the
 * display name differently is the other half of the drift this module exists to remove.
 */
export function ticketReplyToHeader(parts: TicketReplyAddressParts): string | null {
  const addr = ticketReplyAddress(parts);
  return addr ? `"${REPLY_DISPLAY_NAME}" <${addr}>` : null;
}
