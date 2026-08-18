import fs from 'fs';
import path from 'path';

/**
 * Telling OUR OWN mail apart from a student's reply.
 *
 * ── THE PROBLEM ─────────────────────────────────────────────────────────────
 *
 * Ali is BCC'd on all 25 student-unblock emails, so 25 copies of our own
 * outbound land in ali@colaberry.com within minutes of each other, in the same
 * mailbox the watcher reads. Every one of them is addressed to a student, is
 * about being locked out, and quotes the student's own words. A watcher that
 * classifies on subject text or body content will read them as 25 students
 * reporting 25 problems and answer all of them.
 *
 * ── THE SEAM, AND WHY IT IS CHECKED RATHER THAN TRUSTED ─────────────────────
 *
 * The send harness (services/email/campaignTransport.ts) stamps every message
 * with `X-Colaberry-Outbound-Copy` and records the provider's message id in
 * `send-ledger.jsonl`. Two independent identifications, deliberately.
 *
 * They can each pass their own tests and still not meet. The ledger stores
 * nodemailer's `info.messageId`; the watcher reads the RFC822 `Message-ID`
 * header out of Gmail. Those agree only if the relay preserved the id, and
 * they compare equal only if both sides normalise the angle brackets and case.
 * Custom `X-*` headers likewise survive only if the relay passes them through
 * and only if the mail is fetched with a format that returns headers at all.
 *
 * So this module does not assume the seam holds — it MEASURES it. When a
 * message carries the outbound header but its Message-ID is absent from the
 * ledger, that is the seam broken in the middle, and it is reported as a
 * disagreement rather than quietly resolved by whichever side happened to
 * answer. The runner drops to escalate-only when that happens.
 *
 * ── FAIL-CLOSED ─────────────────────────────────────────────────────────────
 *
 * No ledger, an unreadable ledger, or a corrupt line all yield
 * `available: false`. A corrupt line is not skipped: a half-written record is
 * exactly where a message id goes missing, and a missing message id is how the
 * watcher ends up answering its own email.
 */

export const OUTBOUND_COPY_HEADER = 'x-colaberry-outbound-copy';
export const IDEMPOTENCY_HEADER = 'x-colaberry-idempotency-key';
export const SEND_LEDGER_FILENAME = 'send-ledger.jsonl';

export interface OutboundLedgerView {
  /** False means: do not auto-reply to anything. Escalate-only. */
  available: boolean;
  unavailableReason?: 'missing' | 'unreadable' | 'corrupt';
  detail?: string;
  /** Normalised provider message ids of everything we sent. */
  messageIds: Set<string>;
  businessEventIds: Set<string>;
  sentCount: number;
  /**
   * THE CAMPAIGN ROSTER: lower-cased addresses the send harness actually mailed.
   *
   * Derived from the ledger rather than typed by hand, so it cannot drift from
   * who really received the campaign. Without it the watcher considered every
   * message in the mailbox — and what it actually escalated on its first live
   * run was Basecamp standup notifications.
   */
  recipients: Set<string>;
}

/**
 * `<AbC@host>` and `abc@host` are the same id. nodemailer returns the bracketed
 * form; Gmail's header carries the bracketed form; a hand-written ledger entry
 * might carry neither. Compare on the bare, lower-cased address form.
 */
export function normalizeMessageId(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/^<+/, '').replace(/>+$/, '').trim().toLowerCase();
}

export function sendLedgerPath(runDir: string): string {
  return path.join(runDir, SEND_LEDGER_FILENAME);
}

function empty(
  reason: OutboundLedgerView['unavailableReason'],
  detail: string,
): OutboundLedgerView {
  return {
    available: false,
    unavailableReason: reason,
    detail,
    messageIds: new Set(),
    businessEventIds: new Set(),
    sentCount: 0,
    recipients: new Set(),
  };
}

/**
 * Replay the send harness's JSONL ledger and collect the ids of everything it
 * actually put on the wire.
 */
export function loadOutboundLedger(runDir: string): OutboundLedgerView {
  const file = sendLedgerPath(runDir);
  let raw: string;
  try {
    if (!fs.existsSync(file)) {
      return empty('missing', `No send ledger at ${file}.`);
    }
    raw = fs.readFileSync(file, 'utf8');
  } catch (err: any) {
    return empty('unreadable', `Cannot read ${file}: ${err?.message ?? err}`);
  }

  const messageIds = new Set<string>();
  const businessEventIds = new Set<string>();
  const recipients = new Set<string>();
  let sentCount = 0;

  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      return empty(
        'corrupt',
        `${file} line ${i + 1} is not valid JSON. A half-written record is where a sent ` +
        'message id goes missing, and a missing id is how the watcher answers its own email. ' +
        'Refusing to auto-reply until a human has read the ledger.',
      );
    }
    if (rec?.type !== 'sent') continue;
    sentCount++;
    const id = normalizeMessageId(rec.message_id);
    if (!id) {
      return empty(
        'corrupt',
        `${file} line ${i + 1} records a send with no message_id. The watcher cannot ` +
        'identify that outbound copy, so it cannot safely reply to anything.',
      );
    }
    messageIds.add(id);
    if (typeof rec.business_event_id === 'string') businessEventIds.add(rec.business_event_id);
    // The roster. A send with no recipient is not fatal the way a missing
    // message id is — the id is what stops us answering ourselves, while a
    // missing address only narrows the roster, which fails toward silence.
    if (typeof rec.recipient === 'string' && rec.recipient.trim()) {
      recipients.add(rec.recipient.trim().toLowerCase());
    }
  }

  return { available: true, messageIds, businessEventIds, sentCount, recipients };
}

/**
 * Is this sender one of the people the campaign actually mailed?
 *
 * `null` means WE CANNOT TELL — there is no roster to check against, because the
 * ledger is unavailable. That is deliberately different from `false`.
 *
 * The pull here is real and worth stating. This module's existing contract is
 * that an unavailable ledger degrades to escalate-only rather than to silence:
 * the watcher stops sending and still tells a human about every message, because
 * degrading to a human beats degrading to nobody. Making a missing roster mean
 * "match nothing" would have quietly reversed that.
 *
 * So the roster narrows the field only when there IS a roster. What makes
 * "escalate everything" safe in the other case is the per-thread escalation
 * record — one message, one escalation, ever. The flood was never caused by a
 * missing ledger; it happened with the ledger present, because nothing bounded
 * repeats and nothing bounded WHO was considered. The two guards are one fix.
 */
export function isCampaignRecipient(
  ledger: OutboundLedgerView,
  fromAddress: string | null | undefined,
): boolean | null {
  if (!ledger.available) return null;
  const addr = (fromAddress ?? '').trim().toLowerCase();
  if (!addr) return false;
  // Gmail hands back `Name <addr@host>` as often as a bare address.
  const bare = addr.replace(/^.*<([^>]+)>\s*$/, '$1').trim();
  return ledger.recipients.has(addr) || ledger.recipients.has(bare);
}

export interface InboundMessageIdentity {
  /** RFC822 Message-ID header of the fetched message. */
  messageIdHeader?: string | null;
  /** All headers, lower-cased keys not required — lookup is case-insensitive. */
  headers?: Record<string, unknown> | null;
}

export type OutboundMatch =
  | { isOurs: false }
  | {
      isOurs: true;
      via: 'ledger_message_id' | 'outbound_copy_header' | 'watcher_own_reply';
      /** True when the two identifications disagree: the seam is broken. */
      seamDisagreement: boolean;
      detail?: string;
    };

function headerValue(headers: Record<string, unknown> | null | undefined, name: string): string {
  if (!headers) return '';
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name);
  return (hit?.[1] ?? '').toString().trim();
}

/**
 * Is this fetched message something WE put on the wire?
 *
 * `ownReplyIds` carries the message ids of replies this watcher has itself
 * sent, replayed from its own log, so a reply of ours that gets re-ingested is
 * recognised as ours and not as a student writing back.
 */
export function identifyOutbound(
  msg: InboundMessageIdentity,
  ledger: OutboundLedgerView,
  ownReplyIds: Set<string> = new Set(),
): OutboundMatch {
  const id = normalizeMessageId(msg.messageIdHeader);
  const stamped = headerValue(msg.headers, OUTBOUND_COPY_HEADER);

  const inLedger = id !== '' && ledger.messageIds.has(id);
  const inOwnReplies = id !== '' && ownReplyIds.has(id);

  if (inOwnReplies) {
    return { isOurs: true, via: 'watcher_own_reply', seamDisagreement: false };
  }

  if (inLedger) {
    // Both identifications agree only if the header is also present.
    return {
      isOurs: true,
      via: 'ledger_message_id',
      seamDisagreement: stamped === '',
      detail: stamped === ''
        ? 'In the send ledger but carrying no outbound-copy header: header stripped in transit.'
        : undefined,
    };
  }

  if (stamped !== '') {
    return {
      isOurs: true,
      via: 'outbound_copy_header',
      seamDisagreement: ledger.available,
      detail: ledger.available
        ? `Stamped ${OUTBOUND_COPY_HEADER}="${stamped}" but Message-ID "${id}" is not among the ` +
          `${ledger.sentCount} sends in the ledger. The ledger's provider id and the delivered ` +
          'Message-ID are not the same value, so ledger matching is not protecting anything.'
        : undefined,
    };
  }

  return { isOurs: false };
}
