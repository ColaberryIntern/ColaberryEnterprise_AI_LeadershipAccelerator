import { env } from '../../config/env';
import { guardedSendMail } from '../emailService';
import type { ProviderResult } from './idempotentSend';

/**
 * The transport behind Maya's `sendEmail` capability (MR2).
 *
 * ── WHY THIS IS A SEPARATE FILE ─────────────────────────────────────────────
 *
 * `emailService.ts` is 3,043 lines. CLAUDE.md's Modular Composition Rule says the next change
 * to a file past the 500-line hard ceiling must split it before adding new code, and splitting a
 * 30-sender module is a refactor nobody asked for in this change. So this rides on the one
 * primitive that module already exports - `guardedSendMail`, the single chokepoint every one of
 * those senders passes through, which is also where the kill switch is enforced.
 *
 * ── THE BODY IS PLAIN TEXT, NOT HTML ────────────────────────────────────────
 *
 * Standing rule for outbound body copy on this project (C122). It also happens to be the right
 * call for this message: there is nothing in it that needs layout, and a plain-text part is what
 * makes "no price, no date, no link that could rot" easy to verify by reading the source.
 *
 * ── AND IT MUST NOT TRUST A SUCCESS-SHAPED ANSWER ───────────────────────────
 *
 * `guardedSendMail` returns a `SentMessageInfo`-SHAPED STUB rather than throwing when a send is
 * refused, in two cases: the kill switch (`response: 'blocked_by_kill_switch'`) and the dev
 * environment backstop (`response: 'blocked_by_dev_email_guard'`). Both carry
 * `messageId: ''` and `accepted: []`.
 *
 * That is the same shape of trap as the voice path fixed in MR1 T001, where
 * `triggerVoiceCall` returned `{ success: true, data: { skipped: true } }` and the caller read
 * only `success` - so Maya told two real visitors a call was coming when none had been placed.
 * Reading a stub here as a send would put the same lie in writing, and would also mark an
 * `email_send_ledger` row `sent` for mail that never left, which permanently blocks the retry
 * that would have delivered it.
 *
 * So every refusal is detected positively, and the three signals are checked separately because
 * they mean different things:
 *   - `response` beginning `blocked_by_` - a deliberate refusal, with a named reason;
 *   - `accepted` empty - the relay took nothing, whatever it said;
 *   - `messageId` empty - nothing to reconcile a bounce or a complaint against later.
 */

/** The display name on the envelope. The body's first sentence discloses she is an AI. */
const FROM_NAME = 'Maya at Colaberry';

export interface MayaEmailTransportArgs {
  to: string;
  subject: string;
  /** Plain text. Not HTML - see the docblock. */
  body: string;
}

export async function sendMayaEmail(args: MayaEmailTransportArgs): Promise<ProviderResult> {
  const from = (env.emailFrom || '').trim();
  if (!from) {
    // `guardedSendMail` would default this and log it, but with an empty `env.emailFrom` the
    // relay silently discards a message it cannot attribute to a sending domain - the exact
    // failure three Marketing bug reports hit on 2026-11-11, where all three returned success
    // and none was delivered. Refusing here is cheaper than a ledger row that lies.
    return { ok: false, error: 'no_from_address', errorClass: 'MissingFromAddress' };
  }

  let info: { messageId?: string; accepted?: unknown; response?: string };
  try {
    info = await guardedSendMail({
      from: `"${FROM_NAME}" <${from}>`,
      replyTo: from,
      to: args.to,
      subject: args.subject,
      text: args.body,
    });
  } catch (err: unknown) {
    // A throw includes the case where no transporter is configured at all: `guardedSendMail`
    // ends in `transporter!.sendMail(...)`, a non-null assertion, so an unconfigured
    // environment raises a TypeError rather than returning anything.
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorClass: err instanceof Error ? err.constructor.name : 'UnknownError',
    };
  }

  const response = String(info?.response ?? '');
  if (response.startsWith('blocked_by_')) {
    return { ok: false, error: response, errorClass: 'SendRefused' };
  }

  const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
  if (accepted.length === 0) {
    return { ok: false, error: 'relay_accepted_nothing', errorClass: 'RelayAcceptedNothing' };
  }

  const messageId = String(info?.messageId ?? '');
  if (!messageId) {
    return { ok: false, error: 'no_message_id', errorClass: 'NoMessageId' };
  }

  return { ok: true, messageId };
}

export default sendMayaEmail;
