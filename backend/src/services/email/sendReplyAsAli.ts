import { isDev } from '../../config/featureFlags';
import { isKillSwitchActive } from '../launchSafety';
import { lintAliEmail, normalizeAliEmailText, normalizeAliSubject } from './aliEmailStyle';
import {
  buildCampaignMessage,
  createMandrillTransport,
  sendCampaignMessage,
} from './campaignTransport';
import { sendOnce } from './idempotentSend';
import { computeIdempotencyKey } from './idempotencyKey';

/**
 * The one way a reply leaves as Ali from inside the application.
 *
 * ## Why this exists
 *
 * Every guard a send as Ali needs was already written, and the composition of them lived only
 * inside `scripts/`. Nothing a route could call put them together, so the admin draft-approval
 * path grew its own send instead: it assembled an RFC 2822 message by hand with `From`, `To`,
 * `Subject`, `In-Reply-To` and `References` and posted it straight to the Gmail API. Audited
 * 2026-10-27, that path had, in one file, NONE of the following:
 *
 *   - a BCC to Ali, so he received no copy of a reply sent in his name
 *   - the branded signature, which `normalizeAliEmailText` appends
 *   - the style lint, so an em dash or a double sign-off went out as written
 *   - the kill switch, which only `guardedSendMail` honors and which it bypassed
 *   - any idempotency, so a second click sent the email a second time
 *
 * This module is that composition, in one place, so the next surface that needs to reply as Ali
 * has somewhere to call instead of somewhere to copy.
 *
 * ## The order of the checks is load-bearing
 *
 * The kill switch and the environment check come BEFORE the ledger claim. A claim taken and then
 * abandoned marks the idempotency key as spoken for, and `sendOnce` would then refuse the real
 * send later as a duplicate of a send that never happened. Refusing before claiming is the
 * difference between "not sent yet" and "can never be sent".
 *
 * The subject handed to `sendOnce` is the NORMALIZED subject, because the idempotency key hashes
 * the subject and must describe the message that actually goes out.
 */

/** Raised when the body cannot be made compliant. The caller should show it, not retry it. */
export class StyleViolationError extends Error {
  readonly name = 'StyleViolationError';

  constructor(public readonly violations: Array<{ rule: string; detail: string }>) {
    super(`Refusing to send: ${violations.map((v) => `${v.rule} (${v.detail})`).join('; ')}`);
  }
}

export interface SendReplyAsAliInput {
  /** The mailbox being replied to. */
  recipient: string;
  /** Subject as drafted. Normalized before sending and before the key is derived. */
  subject: string;
  /** Plain-text body as drafted. The signature is appended here, not by the caller. */
  body: string;
  /** Stable id for the business event, e.g. `inbox-draft-<draftId>`. */
  businessEventId: string;
  /**
   * RFC822 Message-ID of the message being answered.
   *
   * Required, and refused when absent. Mandrill does not thread on subject, so a reply without
   * it opens a new conversation and leaves the original thread reading as unanswered to the next
   * inbox sweep. On 2026-08-25 that turned four answered emails into a four-day false backlog.
   * A reply that does not thread is not a reply.
   */
  inReplyTo: string;
  /** Prior Message-IDs, oldest first. Defaults to `[inReplyTo]` inside the transport. */
  references?: string[];
  /** Mandrill tag, for telling one surface's replies from another's. */
  tag?: string;
  correlationId?: string;
}

/**
 * There is deliberately no `html` input.
 *
 * An earlier draft of this accepted one. The signature is appended to the TEXT by
 * `normalizeAliEmailText`, so caller-supplied html has to carry the signature itself or go out
 * unsigned, and the first version of its test proved the footgun by supplying html with no
 * signature and expecting it to send. Nothing needs the option, so the html is always a render
 * of the normalized text and cannot disagree with it.
 */

export type SendReplyAsAliOutcome =
  | { outcome: 'sent'; idempotencyKey: string; messageId?: string }
  | { outcome: 'skipped'; reason: string; idempotencyKey?: string }
  | { outcome: 'failed'; idempotencyKey: string; errorClass: string; error: string };

const escapeHtml = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * Minimal HTML for a plain-text reply: escaped, one paragraph per blank-line-separated block,
 * at the body font the signature already uses so the two do not disagree.
 */
function textToHtml(text: string): string {
  const blocks = String(text).split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const paras = blocks
    .map((b) => `<p style="margin:0 0 1em 0">${escapeHtml(b).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
  return `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6">\n${paras}\n</div>`;
}

export async function sendReplyAsAli(
  input: SendReplyAsAliInput,
): Promise<SendReplyAsAliOutcome> {
  if (!input.inReplyTo || !String(input.inReplyTo).trim()) {
    throw new Error(
      'Refusing to send a reply with no In-Reply-To. Mandrill does not thread on subject, so '
      + 'this would start a new conversation and leave the original thread reading as unanswered.',
    );
  }

  // Before the claim. See the docblock: a claim without a send poisons the key.
  if (await isKillSwitchActive()) {
    return { outcome: 'skipped', reason: 'kill_switch_active' };
  }

  // Refuse rather than redirect in dev. `guardedSendMail` reroutes to a sink, which is right for
  // a transactional notice and wrong for a threaded reply: the copy would be addressed to the
  // sink while still carrying In-Reply-To into a real person's conversation.
  if (isDev) {
    return { outcome: 'skipped', reason: 'dev_environment' };
  }

  const apiKey = process.env.MANDRILL_API_KEY;
  if (!apiKey) {
    return { outcome: 'skipped', reason: 'mandrill_not_configured' };
  }

  const subject = normalizeAliSubject(input.subject);
  const text = normalizeAliEmailText(input.body);
  const html = textToHtml(text);

  // Lint the TEXT, not the pair.
  //
  // `lintAliEmail` concatenates html and text before testing, and one of the hard rules fails a
  // body that names him more than once. The html here is a mechanical render of the text, so
  // linting both together counts the signature twice and refuses every correctly signed email.
  // Caught by the tests for this file, and it is also what `caseActionExecutors` does.
  const lint = lintAliEmail({ subject, text });
  if (!lint.ok) {
    throw new StyleViolationError(lint.hardFails);
  }

  const recipient = input.recipient.trim();

  // Derived once and handed to both, so the header on the message is the same string as the
  // ledger row that authorized it. `sendOnce` re-derives and throws on a mismatch, which turns
  // the duplication into a consistency check rather than a second source of truth.
  const idempotencyKey = computeIdempotencyKey(recipient, subject, input.businessEventId);

  const result = await sendOnce(
    {
      recipient,
      subject,
      businessEventId: input.businessEventId,
      idempotencyKey,
      correlationId: input.correlationId,
    },
    async () => {
      const msg = buildCampaignMessage({
        recipient,
        subject,
        text,
        html,
        businessEventId: input.businessEventId,
        idempotencyKey,
        inReplyTo: input.inReplyTo,
        references: input.references,
        tag: input.tag ?? 'inbox-reply',
      });
      // sendCampaignMessage re-asserts the envelope immediately before the wire, and fails the
      // send if the relay accepted the recipient but not Ali's BCC.
      return sendCampaignMessage(createMandrillTransport(apiKey), msg, recipient);
    },
  );

  if (result.outcome === 'sent') {
    return { outcome: 'sent', idempotencyKey: result.idempotencyKey, messageId: result.messageId };
  }
  if (result.outcome === 'skipped') {
    return { outcome: 'skipped', reason: result.reason, idempotencyKey: result.idempotencyKey };
  }
  return {
    outcome: 'failed',
    idempotencyKey: result.idempotencyKey,
    errorClass: result.errorClass,
    error: result.error,
  };
}
