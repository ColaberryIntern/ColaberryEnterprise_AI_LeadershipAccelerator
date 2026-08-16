import nodemailer from 'nodemailer';

/**
 * Message construction and the send-safety assertion for the student-unblock
 * campaign. Every message is BCC'd to Ali, and that is enforced here rather
 * than at each call site, because "remember to add the BCC" is not a control.
 *
 * ── WHY AN EXPLICIT ENVELOPE INSTEAD OF nodemailer's `bcc` FIELD ────────────
 *
 * Measured against the installed nodemailer, not assumed:
 *
 *   { to, bcc: 'ali@colaberry.com' }              -> emits a `Bcc:` HEADER
 *   { to, bcc, hideBcc: true }                    -> STILL emits a `Bcc:` header
 *   { to, envelope: { to: [student, ali] } }      -> no Bcc header, both delivered
 *
 * The first two put `Bcc: ali@colaberry.com` in the message the STUDENT
 * receives. These people are writing to Ali about being locked out and being
 * ignored; a visible Bcc line tells them their private reply is being copied
 * somewhere. So the address goes in the SMTP envelope only, and the `bcc`
 * message field is banned outright by assertSendSafety below.
 *
 * CC is banned for the same reason and more strongly: a Cc is visible by
 * definition. If true BCC ever becomes unavailable on this path, the correct
 * move is to stop and say so, never to substitute Cc.
 *
 * ── THE SEAM WITH THE 30-HOUR INBOX WATCHER ─────────────────────────────────
 *
 * Twenty-five BCC copies land in ali@colaberry.com within minutes of each
 * other, and a watcher looking for student replies could read them as inbound
 * mail and answer our own emails. Every message therefore carries:
 *
 *   X-Colaberry-Outbound-Copy: <business_event_id>
 *   X-Colaberry-Idempotency-Key: <key>
 *
 * plus `From: ali@colaberry.com`. The watcher must treat a message carrying
 * X-Colaberry-Outbound-Copy as OUR OWN outbound copy and never as a reply. The
 * send ledger independently records each provider message id, so the same
 * messages can be identified a second way if header access proves awkward
 * through the Gmail API.
 */

export const CAMPAIGN_BCC = 'ali@colaberry.com';
export const CAMPAIGN_FROM_NAME = 'Ali Muwwakkil';
export const CAMPAIGN_FROM_EMAIL = 'ali@colaberry.com';
/** The header the inbox watcher must key on to skip our own copies. */
export const OUTBOUND_COPY_HEADER = 'X-Colaberry-Outbound-Copy';
export const IDEMPOTENCY_HEADER = 'X-Colaberry-Idempotency-Key';

export interface CampaignMessageInput {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  businessEventId: string;
  idempotencyKey: string;
}

export interface CampaignMessage {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  envelope: { from: string; to: string[] };
}

export function buildCampaignMessage(input: CampaignMessageInput): CampaignMessage {
  const recipient = input.recipient.trim();
  return {
    from: `"${CAMPAIGN_FROM_NAME}" <${CAMPAIGN_FROM_EMAIL}>`,
    to: recipient,
    replyTo: CAMPAIGN_FROM_EMAIL,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: {
      [OUTBOUND_COPY_HEADER]: input.businessEventId,
      [IDEMPOTENCY_HEADER]: input.idempotencyKey,
      'X-MC-Tags': 'student-unblock',
      // Pinned rather than left to Mandrill's SMTP default, so the header the
      // student receives is the header the verification gate reviewed.
      'X-MC-PreserveRecipients': 'true',
    },
    // The BCC. Envelope-only: delivered to, never printed in the message.
    envelope: { from: CAMPAIGN_FROM_EMAIL, to: [recipient, CAMPAIGN_BCC] },
  };
}

export class SendSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendSafetyError';
  }
}

/**
 * The last gate before the wire. Throws rather than sending, so a message that
 * has lost its BCC fails loudly and is recorded as a failure instead of going
 * out quietly and correct-looking.
 */
export function assertSendSafety(msg: any, expectedRecipient: string): void {
  const recipient = expectedRecipient.trim().toLowerCase();

  if (msg?.cc) {
    throw new SendSafetyError(
      'CC is never permitted on this campaign: it is visible to the student. Use the envelope BCC.',
    );
  }
  if (msg?.bcc) {
    throw new SendSafetyError(
      "The nodemailer `bcc` field emits a visible `Bcc:` header on this version. " +
      'Put the address in envelope.to instead.',
    );
  }
  const envelopeTo: string[] = (msg?.envelope?.to ?? []).map((a: string) => String(a).trim().toLowerCase());
  if (envelopeTo.length !== 2) {
    throw new SendSafetyError(
      `Envelope must carry exactly the student and the BCC, got ${envelopeTo.length}: ${envelopeTo.join(', ')}`,
    );
  }
  if (!envelopeTo.includes(CAMPAIGN_BCC)) {
    throw new SendSafetyError(`Missing BCC to ${CAMPAIGN_BCC}. Refusing to send.`);
  }
  if (!envelopeTo.includes(recipient)) {
    throw new SendSafetyError(`Envelope does not address ${expectedRecipient}. Refusing to send.`);
  }
  if (String(msg?.to ?? '').trim().toLowerCase() !== recipient) {
    throw new SendSafetyError(
      `To header is "${msg?.to}" but the message is for ${expectedRecipient}. Refusing to send.`,
    );
  }
  if (!msg?.headers?.[OUTBOUND_COPY_HEADER]) {
    throw new SendSafetyError(
      `Missing ${OUTBOUND_COPY_HEADER}. Without it the 30-hour inbox watcher cannot tell ` +
      "Ali's BCC copy from a genuine student reply, and may answer our own email.",
    );
  }
}

/** Mandrill SMTP relay. Explicit timeouts, per the Failure-First rules. */
export function createMandrillTransport(apiKey: string): nodemailer.Transporter {
  if (!apiKey) throw new Error('MANDRILL_API_KEY is not set; refusing to build a transport');
  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: { user: 'apikey', pass: apiKey },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
}

export async function sendCampaignMessage(
  transport: Pick<nodemailer.Transporter, 'sendMail'>,
  msg: CampaignMessage,
  expectedRecipient: string,
): Promise<{ ok: boolean; messageId?: string; error?: string; errorClass?: string }> {
  // Asserted immediately before the wire, not at construction time: the point
  // is to catch anything that mutated the message in between.
  assertSendSafety(msg, expectedRecipient);
  try {
    const info: any = await transport.sendMail(msg as any);
    const accepted: string[] = info?.accepted ?? [];
    if (!accepted.map((a) => String(a).toLowerCase()).includes(CAMPAIGN_BCC)) {
      // The relay took the student but not the BCC. Reported as a failure so
      // the run aborts: a half-delivered send is not a success.
      return {
        ok: false,
        errorClass: 'BccNotAccepted',
        error: `relay accepted ${JSON.stringify(accepted)} without ${CAMPAIGN_BCC}`,
        messageId: info?.messageId,
      };
    }
    return { ok: true, messageId: info?.messageId };
  } catch (err: any) {
    return { ok: false, errorClass: err?.name || 'TransportError', error: String(err?.message ?? err) };
  }
}
