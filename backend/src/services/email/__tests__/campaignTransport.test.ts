/**
 * The BCC requirement, and the send-safety gate that enforces it.
 *
 * The compiled-message tests use nodemailer's stream transport so they assert
 * against the ACTUAL bytes that would go on the wire. That matters here: the
 * obvious implementation (`bcc: 'ali@colaberry.com'`) produces a visible
 * `Bcc:` header on this version of nodemailer, and the only way to know that
 * is to compile a message and look. `hideBcc: true` does not suppress it
 * either — both facts are pinned below so a future refactor to the "cleaner"
 * field is caught here rather than by a student.
 */
import nodemailer from 'nodemailer';
import {
  CAMPAIGN_BCC,
  IDEMPOTENCY_HEADER,
  OUTBOUND_COPY_HEADER,
  SendSafetyError,
  assertSendSafety,
  buildCampaignMessage,
  sendCampaignMessage,
} from '../campaignTransport';

const RECIPIENT = 'bitania3@gmail.com';
const INPUT = {
  recipient: RECIPIENT,
  subject: 'Your Daily Priority Assistant, and a fresh sign in link',
  text: 'Britiana,\n\nGo to the portal.\n\nAli',
  html: '<p>Britiana,</p>',
  businessEventId: 'story000-unblock-2026-08-17',
  idempotencyKey: '9602f29db9d97f1feed0a10ca2202951',
};

/** Compile a message to raw bytes exactly as the SMTP transport would. */
function compile(msg: any): Promise<{ raw: string; headers: string; envelopeTo: string[] }> {
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  return new Promise((resolve, reject) => {
    t.sendMail(msg, (err, info: any) => {
      if (err) return reject(err);
      const raw = info.message.toString();
      resolve({ raw, headers: raw.split(/\n\n/)[0], envelopeTo: info.envelope.to });
    });
  });
}

describe('buildCampaignMessage — the compiled bytes', () => {
  it('delivers to the student AND to Ali', async () => {
    const { envelopeTo } = await compile(buildCampaignMessage(INPUT));

    expect(envelopeTo).toEqual([RECIPIENT, CAMPAIGN_BCC]);
  });

  it('the student sees only their own address: no Bcc header, no Cc header', async () => {
    const { headers } = await compile(buildCampaignMessage(INPUT));

    expect(headers).toMatch(/^To: bitania3@gmail\.com$/m);
    expect(/^bcc:/im.test(headers)).toBe(false);
    expect(/^cc:/im.test(headers)).toBe(false);
    // Ali's address appears exactly once, as the sender they already expect.
    expect(headers.match(/ali@colaberry\.com/g)).toHaveLength(2); // From + Reply-To
  });

  it('carries the header the inbox watcher keys on, so 25 self-copies are not read as replies', async () => {
    const { headers } = await compile(buildCampaignMessage(INPUT));

    expect(headers).toMatch(
      new RegExp(`^${OUTBOUND_COPY_HEADER}: story000-unblock-2026-08-17$`, 'm'),
    );
    expect(headers).toMatch(
      new RegExp(`^${IDEMPOTENCY_HEADER}: 9602f29db9d97f1feed0a10ca2202951$`, 'm'),
    );
  });

  /**
   * The trap this design exists to avoid, pinned as an executable fact. If a
   * future edit "simplifies" the envelope back to a bcc field, this test is the
   * one that explains why not.
   */
  it('DOCUMENTED TRAP: nodemailer bcc, with or without hideBcc, leaks a visible Bcc header', async () => {
    const withBcc = await compile({
      from: 'ali@colaberry.com', to: RECIPIENT, subject: 'x', text: 'x', bcc: CAMPAIGN_BCC,
    });
    const withHideBcc = await compile({
      from: 'ali@colaberry.com', to: RECIPIENT, subject: 'x', text: 'x', bcc: CAMPAIGN_BCC, hideBcc: true,
    });

    expect(/^bcc:/im.test(withBcc.headers)).toBe(true);
    expect(/^bcc:/im.test(withHideBcc.headers)).toBe(true);
  });
});

describe('assertSendSafety', () => {
  it('passes a correctly built message', () => {
    expect(() => assertSendSafety(buildCampaignMessage(INPUT), RECIPIENT)).not.toThrow();
  });

  it('THROWS when the BCC has been dropped — a send without it must fail, not go out quietly', () => {
    const msg: any = buildCampaignMessage(INPUT);
    msg.envelope.to = [RECIPIENT];

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(SendSafetyError);
  });

  it('THROWS on a bcc message field, because that is the version that leaks the header', () => {
    const msg: any = { ...buildCampaignMessage(INPUT), bcc: CAMPAIGN_BCC };

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/emits a visible `Bcc:` header/);
  });

  it('THROWS on any cc, rather than quietly substituting a visible copy', () => {
    const msg: any = { ...buildCampaignMessage(INPUT), cc: CAMPAIGN_BCC };

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/CC is never permitted/);
  });

  it('THROWS when a third address has crept into the envelope', () => {
    const msg: any = buildCampaignMessage(INPUT);
    msg.envelope.to = [RECIPIENT, CAMPAIGN_BCC, 'someone.else@gmail.com'];

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/exactly the student and the BCC/);
  });

  it('THROWS when the To header and the intended recipient disagree', () => {
    const msg: any = buildCampaignMessage(INPUT);
    msg.to = 'someone.else@gmail.com';

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/To header is/);
  });

  it('THROWS when the watcher header is missing', () => {
    const msg: any = buildCampaignMessage(INPUT);
    delete msg.headers[OUTBOUND_COPY_HEADER];

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/inbox watcher/);
  });
});

describe('sendCampaignMessage', () => {
  it('never reaches the transport when the BCC is missing', async () => {
    const sendMail = jest.fn();
    const msg: any = buildCampaignMessage(INPUT);
    msg.envelope.to = [RECIPIENT];

    await expect(sendCampaignMessage({ sendMail } as any, msg, RECIPIENT))
      .rejects.toThrow(SendSafetyError);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('happy path: returns the provider message id', async () => {
    const sendMail = jest.fn().mockResolvedValue({
      messageId: 'mandrill-1', accepted: [RECIPIENT, CAMPAIGN_BCC],
    });

    const result = await sendCampaignMessage({ sendMail } as any, buildCampaignMessage(INPUT), RECIPIENT);

    expect(result).toEqual({ ok: true, messageId: 'mandrill-1' });
  });

  it('a relay that takes the student but NOT the BCC is a failure, not a success', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'mandrill-2', accepted: [RECIPIENT] });

    const result = await sendCampaignMessage({ sendMail } as any, buildCampaignMessage(INPUT), RECIPIENT);

    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('BccNotAccepted');
  });

  it('a transport error is reported, not thrown', async () => {
    const sendMail = jest.fn().mockRejectedValue(
      Object.assign(new Error('connection timeout'), { name: 'TimeoutError' }));

    const result = await sendCampaignMessage({ sendMail } as any, buildCampaignMessage(INPUT), RECIPIENT);

    expect(result).toEqual({ ok: false, errorClass: 'TimeoutError', error: 'connection timeout' });
  });
});
