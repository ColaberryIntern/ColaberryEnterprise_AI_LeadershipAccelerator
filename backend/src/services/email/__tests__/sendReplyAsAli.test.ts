/**
 * The one enforced way a reply leaves as Ali.
 *
 * Each test here corresponds to a guard the path it replaced did not have. The point is not that
 * the guards exist somewhere in the repository - they always did - but that this composition
 * actually calls them, in an order where a refusal cannot cost the send its idempotency key.
 */

const mockKillSwitch = jest.fn(async () => false);
const mockSendOnce = jest.fn();
const mockSendCampaignMessage = jest.fn(async () => ({ ok: true, messageId: 'mandrill-1' }));
const mockBuildCampaignMessage = jest.fn((input: any) => ({ built: true, ...input }));
let mockIsDev = false;

jest.mock('../../../config/featureFlags', () => ({ get isDev() { return mockIsDev; } }));
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: () => mockKillSwitch() }));
jest.mock('../idempotentSend', () => ({
  sendOnce: (...args: unknown[]) => mockSendOnce(...args),
}));
jest.mock('../campaignTransport', () => ({
  buildCampaignMessage: (...args: any[]) => mockBuildCampaignMessage(args[0]),
  createMandrillTransport: jest.fn(() => ({ sendMail: jest.fn() })),
  sendCampaignMessage: (...args: unknown[]) => mockSendCampaignMessage(...(args as [])),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendReplyAsAli, StyleViolationError } = require('../sendReplyAsAli');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeIdempotencyKey } = require('../idempotencyKey');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hasBrandedSignature } = require('../aliEmailStyle');

const BASE = {
  recipient: 'someone@example.test',
  subject: 'Re: a question',
  body: 'Here is the answer.',
  businessEventId: 'inbox-draft-abc',
  inReplyTo: '<orig@mail.example.test>',
};

/** sendOnce, faithfully: runs the provider callback and reports what it returned. */
function sendOnceRunsProvider() {
  mockSendOnce.mockImplementation(async (_id: any, send: () => Promise<any>) => {
    const r = await send();
    return r.ok
      ? { outcome: 'sent', ledgerId: 'L1', idempotencyKey: 'K', messageId: r.messageId }
      : { outcome: 'failed', ledgerId: 'L1', idempotencyKey: 'K', errorClass: r.errorClass, error: r.error };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDev = false;
  mockKillSwitch.mockResolvedValue(false);
  process.env.MANDRILL_API_KEY = 'test-key';
  sendOnceRunsProvider();
});

describe('refusals that must happen BEFORE the ledger is claimed', () => {
  // A claim taken and then abandoned marks the key as spoken for, and the real send would later
  // be refused as a duplicate of something that never went out. So each of these asserts that
  // sendOnce was never reached, not merely that nothing was sent.

  it('skips on an active kill switch without claiming', async () => {
    mockKillSwitch.mockResolvedValue(true);

    await expect(sendReplyAsAli(BASE)).resolves.toEqual({
      outcome: 'skipped', reason: 'kill_switch_active',
    });
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('skips in a dev process without claiming', async () => {
    mockIsDev = true;

    const out = await sendReplyAsAli(BASE);

    expect(out).toEqual({ outcome: 'skipped', reason: 'dev_environment' });
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('skips with no Mandrill credentials without claiming', async () => {
    delete process.env.MANDRILL_API_KEY;

    const out = await sendReplyAsAli(BASE);

    expect(out).toEqual({ outcome: 'skipped', reason: 'mandrill_not_configured' });
    expect(mockSendOnce).not.toHaveBeenCalled();
  });
});

describe('threading', () => {
  it('refuses a reply with no In-Reply-To', async () => {
    // Mandrill does not thread on subject. An unthreaded reply leaves the original conversation
    // reading as unanswered, which is how four answered emails became a four-day false backlog.
    await expect(sendReplyAsAli({ ...BASE, inReplyTo: '' })).rejects.toThrow(/In-Reply-To/);
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('refuses whitespace as an In-Reply-To', async () => {
    await expect(sendReplyAsAli({ ...BASE, inReplyTo: '   ' })).rejects.toThrow(/In-Reply-To/);
  });

  it('carries In-Reply-To and References to the transport', async () => {
    await sendReplyAsAli({ ...BASE, references: ['<a@x>', '<b@x>'] });

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.inReplyTo).toBe('<orig@mail.example.test>');
    expect(built.references).toEqual(['<a@x>', '<b@x>']);
  });
});

describe('the Ali style kit is actually applied', () => {
  it('appends the branded signature', async () => {
    await sendReplyAsAli(BASE);

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(hasBrandedSignature(built.text)).toBe(true);
  });

  it('turns a dash in the body into a hyphen rather than refusing it', async () => {
    await sendReplyAsAli({ ...BASE, body: 'One thing — then another.' });

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.text).not.toMatch(/[—–]/);
    expect(built.text).toContain('One thing - then another.');
  });

  it('normalizes a dash in the subject too', async () => {
    await sendReplyAsAli({ ...BASE, subject: 'Re: a — question' });

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.subject).not.toMatch(/[—–]/);
  });

  it('strips a trailing sign-off so the signature does not name him twice', async () => {
    await sendReplyAsAli({ ...BASE, body: 'The answer.\n\nThanks,\nAli' });

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.text).not.toMatch(/Thanks,\s*\nAli\s*\n/);
  });

  it('builds an HTML body that escapes the text rather than interpolating it', async () => {
    await sendReplyAsAli({ ...BASE, body: 'Look at <script>alert(1)</script> here.' });

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.html).not.toContain('<script>');
    expect(built.html).toContain('&lt;script&gt;');
  });

  it('renders the HTML from the normalized text, so the two cannot disagree', async () => {
    // There is no html input. An earlier version accepted one, and this test in its first form
    // supplied html with no signature and expected it to send, which is exactly the footgun
    // that removing the option closed: the signature is appended to the text, so any html the
    // caller writes has to carry it separately or go out unsigned.
    await sendReplyAsAli(BASE);

    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.html).toContain('Here is the answer.');
    expect(built.html).toContain('Ali Muwwakkil');
    expect(hasBrandedSignature(built.text)).toBe(true);
  });
});

describe('idempotency', () => {
  it('derives the key from the NORMALIZED subject, so it describes what is sent', async () => {
    // The key hashes the subject. Keyed on the raw subject it would describe a message that
    // never existed, and a retry would compute a different key and send a second copy.
    await sendReplyAsAli({ ...BASE, subject: 'Re: a — question' });

    const identity = mockSendOnce.mock.calls[0][0] as any;
    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(identity.subject).toBe(built.subject);
    expect(identity.idempotencyKey).toBe(
      computeIdempotencyKey(BASE.recipient, built.subject, BASE.businessEventId),
    );
  });

  it('puts the same key on the message as in the ledger identity', async () => {
    await sendReplyAsAli(BASE);

    const identity = mockSendOnce.mock.calls[0][0] as any;
    const built = mockBuildCampaignMessage.mock.calls[0][0] as any;
    expect(built.idempotencyKey).toBe(identity.idempotencyKey);
  });

  it('reports a ledger skip as skipped rather than as sent', async () => {
    mockSendOnce.mockResolvedValue({
      outcome: 'skipped', reason: 'already_sent', idempotencyKey: 'K',
    });

    await expect(sendReplyAsAli(BASE)).resolves.toEqual({
      outcome: 'skipped', reason: 'already_sent', idempotencyKey: 'K',
    });
  });

  it('does not call the provider at all when the ledger refuses', async () => {
    mockSendOnce.mockResolvedValue({
      outcome: 'skipped', reason: 'in_flight', idempotencyKey: 'K',
    });

    await sendReplyAsAli(BASE);

    expect(mockSendCampaignMessage).not.toHaveBeenCalled();
  });
});

describe('outcomes', () => {
  it('returns sent with the provider message id', async () => {
    const out = await sendReplyAsAli(BASE);

    expect(out).toEqual({ outcome: 'sent', idempotencyKey: 'K', messageId: 'mandrill-1' });
  });

  it('surfaces a provider refusal as failed, with its error class', async () => {
    mockSendCampaignMessage.mockResolvedValue({
      ok: false, errorClass: 'BccNotAccepted', error: 'relay took the recipient but not the BCC',
    } as any);

    const out = await sendReplyAsAli(BASE);

    expect(out).toMatchObject({ outcome: 'failed', errorClass: 'BccNotAccepted' });
  });

  it('sends through sendCampaignMessage, which re-asserts the envelope before the wire', async () => {
    await sendReplyAsAli(BASE);

    expect(mockSendCampaignMessage).toHaveBeenCalledTimes(1);
    // Third argument is the expected recipient the assertion checks the envelope against.
    expect(mockSendCampaignMessage.mock.calls[0][2]).toBe(BASE.recipient);
  });

  it('trims the recipient before it is hashed or addressed', async () => {
    await sendReplyAsAli({ ...BASE, recipient: '  someone@example.test  ' });

    const identity = mockSendOnce.mock.calls[0][0] as any;
    expect(identity.recipient).toBe('someone@example.test');
  });
});

describe('StyleViolationError', () => {
  it('is exported so a caller can tell a refusal from a transport failure', () => {
    const e = new StyleViolationError([{ rule: 'r', detail: 'd' }]);
    expect(e.name).toBe('StyleViolationError');
    expect(e.message).toContain('r');
  });
});
