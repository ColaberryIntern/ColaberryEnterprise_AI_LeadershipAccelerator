import { coraAutoReplySkipReason, normalizeEmailAddress } from '../coraAgentService';
import { identifyOutbound, OutboundLedgerView, InboundMessageIdentity } from './outboundIdentity';

/**
 * The composed "may this message be auto-replied to?" decision.
 *
 * The self-address, bounce, no-reply and RFC-3834 guards are NOT reimplemented
 * here. They are imported from coraAgentService, where they were written and
 * unit-pinned after the 2026-07-14 self-reply storm, so that this watcher
 * inherits every loop shape that incident taught us instead of rediscovering
 * them at 3am. A second implementation would be a second thing to keep correct,
 * and the two would drift.
 *
 * What is genuinely new here, and specific to a watcher running alongside a
 * 25-message BCC'd campaign:
 *
 *   1. our own outbound copies, identified by the send ledger and the
 *      outbound-copy header rather than by anything about the text;
 *   2. our own replies, so a reply that gets re-ingested is not answered;
 *   3. no proactive nudges — a thread in which the student has not written
 *      is never replied to, however overdue that student is.
 *
 * Checks run in order of how specific their explanation is. Outbound
 * identification comes before the generic self-address guard so the log says
 * "this was our BCC copy, matched in the ledger" rather than the vaguer "from
 * our own address" — and so the ledger path is load-bearing rather than
 * decorative behind a guard that would have caught it anyway.
 */

export type WatcherSkipReason =
  | 'our_own_reply'
  | 'our_own_outbound_ledger'
  | 'our_own_outbound_header'
  | 'no_sender'
  | 'self_address'
  | 'automated_sender'
  | 'auto_submitted'
  | 'bulk_precedence'
  | 'x_autoreply'
  | 'no_student_reply';

export interface ThreadMessage extends InboundMessageIdentity {
  fromAddress: string | null | undefined;
}

export interface GuardInput {
  /** The message being considered for a reply. */
  candidate: ThreadMessage;
  /** Every message in the candidate's thread, including the candidate. */
  threadMessages: ThreadMessage[];
  ledger: OutboundLedgerView;
  ownReplyIds: Set<string>;
}

export interface GuardVerdict {
  skip: WatcherSkipReason | null;
  /** Set when the ledger and the header disagree about the same message. */
  seamDisagreement: boolean;
  detail?: string;
}

const VIA_TO_REASON: Record<string, WatcherSkipReason> = {
  ledger_message_id: 'our_own_outbound_ledger',
  outbound_copy_header: 'our_own_outbound_header',
  watcher_own_reply: 'our_own_reply',
};

/**
 * Is this message one a student actually wrote? Used both to reject our own
 * mail and to establish that a thread contains a genuine inbound reply.
 */
export function isStudentAuthored(
  msg: ThreadMessage,
  ledger: OutboundLedgerView,
  ownReplyIds: Set<string>,
): boolean {
  const outbound = identifyOutbound(msg, ledger, ownReplyIds);
  if (outbound.isOurs) return false;
  return coraAutoReplySkipReason({ from_address: msg.fromAddress, headers: msg.headers }) === null;
}

export function watcherSkipReason(input: GuardInput): GuardVerdict {
  const { candidate, threadMessages, ledger, ownReplyIds } = input;

  // 1. Ours? Checked first so the reason names the actual mechanism.
  const outbound = identifyOutbound(candidate, ledger, ownReplyIds);
  if (outbound.isOurs) {
    return {
      skip: VIA_TO_REASON[outbound.via],
      seamDisagreement: outbound.seamDisagreement,
      detail: outbound.detail,
    };
  }

  // 2. The guards pinned by the 2026-07-14 incident: self address, bounces,
  //    no-reply senders, RFC 3834 auto-mail, bulk precedence, missing sender.
  const cora = coraAutoReplySkipReason({
    from_address: candidate.fromAddress,
    headers: candidate.headers,
  });
  if (cora) {
    return { skip: cora as WatcherSkipReason, seamDisagreement: false };
  }

  // 3. No proactive nudges. The thread must contain at least one message the
  //    student actually wrote. A thread holding only our campaign email — the
  //    common case for the 24 people who will not reply at all — is left alone.
  const hasStudentReply = threadMessages.some((m) => isStudentAuthored(m, ledger, ownReplyIds));
  if (!hasStudentReply) {
    return {
      skip: 'no_student_reply',
      seamDisagreement: false,
      detail: 'Thread contains no student-authored message. The watcher answers, it does not nudge.',
    };
  }

  return { skip: null, seamDisagreement: false };
}

/** Stable per-thread key. Falls back to the message id for a single-message thread. */
export function threadKeyFor(providerThreadId: string | null | undefined, messageId: string): string {
  const t = (providerThreadId ?? '').trim();
  return t !== '' ? t : messageId;
}

export { normalizeEmailAddress };
