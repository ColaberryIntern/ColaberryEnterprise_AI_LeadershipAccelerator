/**
 * Approving a draft sends exactly one email, as Ali, or it refuses and says why.
 *
 * Audited 2026-10-27, this function loaded the draft, wrote its status, and handed the body to a
 * send assembled in the same file with no BCC to Ali, no signature, no style lint, no kill switch
 * and no idempotency. It also had no guard on the draft's current status, because writing
 * `status` is not the same as checking it: a second click re-sent the email.
 *
 * Every test here pins one of those holes shut. The double-click test is the important one.
 */

const mockSendReplyAsAli = jest.fn(async () => ({
  outcome: 'sent' as const, idempotencyKey: 'K', messageId: 'm1',
}));
const mockDraftUpdate = jest.fn(async () => [1]);
const mockDraftFindByPk = jest.fn();
const mockEmailFindByPk = jest.fn();
const mockLogAuditEvent = jest.fn(async () => undefined);

jest.mock('../../email/sendReplyAsAli', () => ({
  sendReplyAsAli: (...a: unknown[]) => mockSendReplyAsAli(...(a as [])),
  StyleViolationError: class extends Error {},
}));
jest.mock('../../../models/InboxReplyDraft', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => mockDraftFindByPk(...a),
    update: (...a: unknown[]) => mockDraftUpdate(...(a as [])),
  },
}));
jest.mock('../../../models/InboxEmail', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockEmailFindByPk(...a) },
}));
jest.mock('../../../models/InboxClassification', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/InboxStyleProfile', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/InboxAuditLog', () => ({ __esModule: true, default: {} }));
jest.mock('../inboxAuditService', () => ({
  logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...(a as [])),
}));
jest.mock('openai', () => ({ __esModule: true, default: class {} }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: () => ({}) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { approveDraft } = require('../replyDraftService');

/** A draft instance shaped like the Sequelize one, with the methods the code calls. */
function draftRow(over: Record<string, unknown> = {}) {
  const row: any = {
    id: 'd1',
    email_id: 'e1',
    reply_to_address: 'them@example.test',
    draft_subject: 'Re: hello',
    draft_body: 'Here is the answer.',
    status: 'pending_approval',
    save: jest.fn(async () => undefined),
    reload: jest.fn(async () => undefined),
    ...over,
  };
  return row;
}

const emailRow = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  provider: 'gmail_colaberry',
  provider_message_id: '<orig@mail.test>',
  subject: 'hello',
  headers: { 'Message-ID': '<orig@mail.test>' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftUpdate.mockResolvedValue([1]);
  mockDraftFindByPk.mockResolvedValue(draftRow());
  mockEmailFindByPk.mockResolvedValue(emailRow());
  mockSendReplyAsAli.mockResolvedValue({ outcome: 'sent', idempotencyKey: 'K', messageId: 'm1' });
});

describe('the double click', () => {
  it('refuses when the draft is no longer awaiting approval', async () => {
    // The claim is a conditional UPDATE; zero rows means another caller already took it.
    mockDraftUpdate.mockResolvedValue([0]);
    mockDraftFindByPk.mockResolvedValue(draftRow({ status: 'sent' }));

    await expect(approveDraft('d1', undefined, 'kes@colaberry.com'))
      .rejects.toThrow(/not awaiting approval \(status: sent\)/);
    expect(mockSendReplyAsAli).not.toHaveBeenCalled();
  });

  it('claims with a status predicate, not just an id', async () => {
    // Without `status: 'pending_approval'` in the WHERE, both clicks win and both send.
    await approveDraft('d1', undefined, 'kes@colaberry.com');

    const where = (mockDraftUpdate.mock.calls[0][1] as any).where;
    expect(where).toMatchObject({ id: 'd1', status: 'pending_approval' });
  });

  it('does not send when the claim is lost, even though the row exists', async () => {
    mockDraftUpdate.mockResolvedValue([0]);
    mockDraftFindByPk.mockResolvedValue(draftRow({ status: 'approved' }));

    await expect(approveDraft('d1')).rejects.toThrow();
    expect(mockSendReplyAsAli).not.toHaveBeenCalled();
  });
});

describe('refusals that happen before the draft changes state', () => {
  it('refuses a draft with no Message-ID to thread into', async () => {
    mockEmailFindByPk.mockResolvedValue(emailRow({ headers: {}, provider_message_id: '' }));

    await expect(approveDraft('d1')).rejects.toThrow(/no Message-ID/);
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });

  it('refuses a draft answering a non-Colaberry mailbox', async () => {
    // Mandrill pins the From to ali@colaberry.com. Answering a personal Hotmail thread from
    // there would change who the conversation is with, which is worse than not sending.
    mockEmailFindByPk.mockResolvedValue(emailRow({ provider: 'hotmail' }));

    await expect(approveDraft('d1')).rejects.toThrow(/sends only as ali@colaberry.com/);
    expect(mockDraftUpdate).not.toHaveBeenCalled();
    expect(mockSendReplyAsAli).not.toHaveBeenCalled();
  });

  it('refuses when the original email is missing', async () => {
    mockEmailFindByPk.mockResolvedValue(null);

    await expect(approveDraft('d1')).rejects.toThrow(/Original email not found/);
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });

  it('refuses when the draft is missing', async () => {
    mockDraftFindByPk.mockResolvedValue(null);

    await expect(approveDraft('nope')).rejects.toThrow(/Draft not found/);
  });
});

describe('who approved it', () => {
  it('records the caller, not the literal string ali', async () => {
    await approveDraft('d1', undefined, 'kes@colaberry.com');

    expect((mockDraftUpdate.mock.calls[0][0] as any).approved_by).toBe('kes@colaberry.com');
    expect(mockLogAuditEvent.mock.calls[0][0]).toMatchObject({ actor: 'kes@colaberry.com' });
  });

  it('falls back to unknown rather than naming him by default', async () => {
    await approveDraft('d1');

    expect((mockDraftUpdate.mock.calls[0][0] as any).approved_by).toBe('unknown');
  });
});

describe('the send', () => {
  it('goes through sendReplyAsAli, threaded, with a per-draft business event', async () => {
    await approveDraft('d1', undefined, 'kes@colaberry.com');

    expect(mockSendReplyAsAli).toHaveBeenCalledTimes(1);
    expect(mockSendReplyAsAli.mock.calls[0][0]).toMatchObject({
      recipient: 'them@example.test',
      subject: 'Re: hello',
      body: 'Here is the answer.',
      businessEventId: 'inbox-draft-d1',
      inReplyTo: '<orig@mail.test>',
    });
  });

  it('sends the edited body when one is supplied, and records the edit', async () => {
    await approveDraft('d1', 'My own words.', 'kes@colaberry.com');

    expect(mockSendReplyAsAli.mock.calls[0][0]).toMatchObject({ body: 'My own words.' });
    expect(mockDraftUpdate.mock.calls[0][0] as any).toMatchObject({
      status: 'edited', edited_body: 'My own words.',
    });
  });

  it('marks the draft sent only after the provider confirms', async () => {
    const row = draftRow();
    mockDraftFindByPk.mockResolvedValue(row);

    await approveDraft('d1');

    expect(row.status).toBe('sent');
    expect(row.sent_at).toBeInstanceOf(Date);
  });

  it('does NOT mark it sent when the send was skipped', async () => {
    // Kill switch, dev process, missing credentials, or the ledger already holding this send.
    // Reporting a skip as delivered is how an unsent email stops being chased.
    const row = draftRow();
    mockDraftFindByPk.mockResolvedValue(row);
    mockSendReplyAsAli.mockResolvedValue({
      outcome: 'skipped', reason: 'kill_switch_active',
    } as any);

    await approveDraft('d1');

    expect(row.status).not.toBe('sent');
    expect(row.sent_at).toBeUndefined();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('throws on a provider failure, carrying the error class', async () => {
    mockSendReplyAsAli.mockResolvedValue({
      outcome: 'failed', idempotencyKey: 'K', errorClass: 'BccNotAccepted', error: 'no bcc',
    } as any);

    await expect(approveDraft('d1')).rejects.toThrow(/BccNotAccepted/);
  });

  it('leaves no audit row claiming a send that failed', async () => {
    mockSendReplyAsAli.mockResolvedValue({
      outcome: 'failed', idempotencyKey: 'K', errorClass: 'X', error: 'y',
    } as any);

    await expect(approveDraft('d1')).rejects.toThrow();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});
