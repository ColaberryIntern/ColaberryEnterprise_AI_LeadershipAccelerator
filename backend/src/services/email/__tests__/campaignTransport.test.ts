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
  TRACK_HEADER,
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

/**
 * ── THE REGRESSION THESE TESTS EXIST FOR ────────────────────────────────────
 *
 * The canary was delivered with every URL rewritten to
 * `http://track.colaberry.com/track/click/30248114/...`. It redirected
 * correctly, but the message the student received was not the message the
 * verification gate approved, and an opaque `http://` redirect sent to somebody
 * who has been locked out for weeks reads as phishing.
 *
 * The reviewed harness (scripts/sendStudentUnblockEmails.js) suppressed
 * tracking. This module did not — the header was lost when the send path moved
 * off the harness and onto buildCampaignMessage().
 *
 * READ THIS BEFORE TRUSTING THE TESTS BELOW. They assert that we ASKED Mandrill
 * not to rewrite. They cannot assert that Mandrill obeyed, because the rewrite
 * happens at the relay, after these bytes leave. The previous version of this
 * file passed its own tests and still shipped rewritten links. The only
 * sufficient check is fetching a DELIVERED message and grepping it for
 * `track.colaberry.com`, which is why that is a required step in the runbook
 * and not an optional one.
 */
describe('tracking suppression: the links must arrive as they were written', () => {
  it('sets the suppression headers on the message object in Mandrill’s documented casing', () => {
    const { headers } = buildCampaignMessage(INPUT);

    // `none` is not a keyword Mandrill recognises. It works because the
    // documented rule is "if you provide any other values, open and click
    // tracking will be disabled" — an unrecognised token yields an empty flag
    // set. The value must stay NON-EMPTY: an empty header value is liable to be
    // stripped by a library or a relaying MTA, and a stripped header falls back
    // to the account default, which is tracking ON.
    expect(headers['X-MC-Track']).toBe('none');
    expect(headers['X-MC-AutoText']).toBe('false');
    // Documented casing is AutoHtml, not AutoHTML. It matters here beyond
    // tidiness: open tracking is only available on HTML mail, so AutoHtml
    // manufacturing an HTML part out of a text-only message is what would make
    // an otherwise pixel-immune send eligible for a tracking pixel.
    expect(headers['X-MC-AutoHtml']).toBe('false');
  });

  /**
   * DOCUMENTED TRAP, and the reason the test above is not sufficient on its own.
   *
   * nodemailer normalises header field names on the way to the wire:
   * `X-MC-Track` is emitted as `X-Mc-Track`. So the bytes Mandrill actually
   * parses are NOT the bytes this module wrote, and a test that only asserted
   * the canonical casing would be asserting a string that never ships — which
   * is precisely how the previous version passed its tests and still delivered
   * rewritten links.
   *
   * RFC 5322 §2.2 makes field names case-insensitive, so this is expected to be
   * equivalent, and the delivered-message check in the runbook is what proves
   * Mandrill agrees. Pinned here so that if nodemailer's normalisation ever
   * changes, it is this test that says so.
   */
  it('DOCUMENTED TRAP: nodemailer re-cases the field names on the wire', async () => {
    const { headers } = await compile(buildCampaignMessage(INPUT));

    expect(headers.match(/^X-Mc-Track: none$/gm)).toHaveLength(1);
    expect(headers.match(/^X-Mc-Autotext: false$/gm)).toHaveLength(1);
    expect(headers.match(/^X-Mc-Autohtml: false$/gm)).toHaveLength(1);
    // The canonical casing is gone by this point. If this ever fails, nodemailer
    // stopped normalising and the assertions above need revisiting.
    expect(headers).not.toMatch(/^X-MC-Track:/m);
  });

  it('leaves the portal URL byte-for-byte as drafted in both parts', async () => {
    const url = 'https://enterprise.colaberry.ai/portal/login';
    const { raw } = await compile(buildCampaignMessage({
      ...INPUT,
      text: `Request a fresh link at ${url} and use the newest one.`,
      html: `<p>Request a fresh link at <a href="${url}">${url}</a>.</p>`,
    }));

    // The needles to grep a DELIVERED message for. `/track/click/` and
    // `/track/open.php` are the stable paths; the hostname varies with the
    // account's custom tracking domain, so the path is the better needle.
    expect(raw).not.toMatch(/\/track\/click\//);
    expect(raw).not.toMatch(/\/track\/open\.php/);
    expect(raw).not.toMatch(/track\.colaberry\.com/);

    // Undo quoted-printable soft line breaks before counting: the HTML part is
    // QP-encoded and a long href gets wrapped mid-URL, which is a transfer
    // encoding artefact and not a rewrite.
    const unwrapped = raw.replace(/=\r?\n/g, '');
    // Once in the text part, twice in the HTML part (href plus link text).
    expect(unwrapped.match(/https:\/\/enterprise\.colaberry\.ai\/portal\/login/g)).toHaveLength(3);
  });

  it('THROWS when the suppression header has been dropped, rather than sending rewritten links', () => {
    const msg: any = buildCampaignMessage(INPUT);
    delete msg.headers[TRACK_HEADER];

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(SendSafetyError);
    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/rewrite every link/);
  });

  it('THROWS when the suppression header has been weakened to enable tracking', () => {
    const msg: any = buildCampaignMessage(INPUT);
    msg.headers[TRACK_HEADER] = 'opens,clicks';

    expect(() => assertSendSafety(msg, RECIPIENT)).toThrow(/rewrite every link/);
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
