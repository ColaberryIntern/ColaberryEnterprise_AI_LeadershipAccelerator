/**
 * coraAgentService tests — loop-guard regression for the 2026-07-14 mail-loop
 * incident (BC #10095332194): Cora replied to her own re-ingested sent mail
 * ~1,800 times in under 30 minutes. This pins the fix: reserve-then-send
 * dedup per thread, and a circuit breaker that stops real sends once a
 * volume ceiling is hit. No DB/OpenAI/Gmail I/O — everything mocked.
 */

jest.mock('../../kbService', () => ({
  getCourseBySlug: jest.fn().mockResolvedValue({ id: 'course-1' }),
  listEntries: jest.fn().mockResolvedValue([]),
  getActiveCohort: jest.fn().mockResolvedValue(null),
  resolveMergeTags: jest.fn((template: string) => template),
}));
jest.mock('../inboxAuditService', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../alertService', () => ({ emitAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }) }));
jest.mock('../../../models/CoraReplyLog', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/InboxAuditLog', () => ({ count: jest.fn() }));

const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

const mockGmailSend = jest.fn().mockResolvedValue({ data: {} });
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })) },
    gmail: jest.fn().mockReturnValue({ users: { messages: { send: mockGmailSend } } }),
  },
}));

import { handleCoraInquiry } from '../coraAgentService';
import CoraReplyLog from '../../../models/CoraReplyLog';
import InboxAuditLog from '../../../models/InboxAuditLog';
import { logAuditEvent } from '../inboxAuditService';
import { emitAlert } from '../../alertService';

const findOrCreateReplyLog = CoraReplyLog.findOrCreate as jest.Mock;
const countAuditLogs = InboxAuditLog.count as jest.Mock;
const mockEmitAlert = emitAlert as jest.Mock;

const baseEmail = {
  id: 'email-1',
  from_address: 'student@example.com',
  from_name: 'A Student',
  subject: 'Question about the program',
  body_text: 'Hi, I have a question about pricing.',
  provider: 'gmail',
  provider_message_id: 'msg-1',
  provider_thread_id: 'thread-1',
  headers: {},
};

function mockOpenAIReply(body = 'Thanks for reaching out! Here are the details.', needsHuman = false) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ subject: 'Re: Question', body, needs_human: needsHuman }) } }],
  });
}

const originalDryRun = process.env.CORA_DRY_RUN;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
  process.env.GMAIL_CLIENT_ID = 'test-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
  process.env.OPENAI_API_KEY = 'test-key';
  countAuditLogs.mockResolvedValue(0);
  mockOpenAIReply();
});

afterAll(() => {
  process.env.CORA_DRY_RUN = originalDryRun;
});

describe('handleCoraInquiry — live mode (CORA_DRY_RUN=false)', () => {
  beforeEach(() => {
    process.env.CORA_DRY_RUN = 'false';
  });

  it('happy path: a first-time thread is reserved, replied to, and sent', async () => {
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, true]);

    const result = await handleCoraInquiry(baseEmail);

    expect(findOrCreateReplyLog).toHaveBeenCalledWith({
      where: { thread_key: 'thread-1' },
      defaults: { thread_key: 'thread-1', email_id: 'email-1' },
    });
    expect(mockGmailSend).toHaveBeenCalledTimes(1);
    expect(result.archive).toBe(true);
  });

  it('regression (BC #10095332194): a duplicate thread — e.g. Cora\'s own reply re-ingested — is skipped, not re-sent', async () => {
    // created:false = the thread was already reserved by an earlier call.
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, false]);

    const result = await handleCoraInquiry(baseEmail);

    expect(mockCreate).not.toHaveBeenCalled(); // never even generates a reply
    expect(mockGmailSend).not.toHaveBeenCalled();
    expect(result).toEqual({ archive: true });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cora_reply_skipped_duplicate_thread' })
    );
  });

  it('boundary: falls back to provider_message_id as the dedup key when there is no thread id', async () => {
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, true]);

    await handleCoraInquiry({ ...baseEmail, provider_thread_id: null });

    expect(findOrCreateReplyLog).toHaveBeenCalledWith(
      expect.objectContaining({ where: { thread_key: 'msg-1' } })
    );
  });

  it('circuit breaker: trips once the send ceiling is hit, routing to a human without sending', async () => {
    countAuditLogs.mockResolvedValue(20); // at the default ceiling

    const result = await handleCoraInquiry(baseEmail);

    expect(findOrCreateReplyLog).not.toHaveBeenCalled(); // thread never reserved — free for a later real attempt
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockGmailSend).not.toHaveBeenCalled();
    expect(result).toEqual({ archive: false, handoffReason: 'cora_circuit_breaker_tripped' });
  });

  it('ops alerting (BC #10099862873): a trip emits a critical alert with a plain-English impact statement', async () => {
    countAuditLogs.mockResolvedValue(20);

    await handleCoraInquiry(baseEmail);

    expect(mockEmitAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'critical',
        title: 'Circuit Breaker Tripped: cora_circuit_breaker',
        description: expect.stringContaining('Cora has stopped auto-replying'),
        sourceType: 'system',
        impactArea: 'support_inbox',
      })
    );
  });

  it('ops alerting: a failure emitting the alert does not affect the circuit breaker\'s handoff decision', async () => {
    countAuditLogs.mockResolvedValue(20);
    mockEmitAlert.mockRejectedValueOnce(new Error('DB unavailable'));

    const result = await handleCoraInquiry(baseEmail);

    expect(result).toEqual({ archive: false, handoffReason: 'cora_circuit_breaker_tripped' });
  });

  it('circuit breaker: does not trip below the ceiling', async () => {
    countAuditLogs.mockResolvedValue(19);
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, true]);

    const result = await handleCoraInquiry(baseEmail);

    expect(mockGmailSend).toHaveBeenCalledTimes(1);
    expect(result.archive).toBe(true);
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  it('failure path: a send failure still leaves the thread reserved (no automatic re-send loop) and routes to a human', async () => {
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, true]);
    mockGmailSend.mockRejectedValueOnce(new Error('Gmail API down'));

    const result = await handleCoraInquiry(baseEmail);

    expect(result).toEqual({ archive: false, handoffReason: 'cora_send_failed' });
  });
});

describe('handleCoraInquiry — dry-run mode (CORA_DRY_RUN=true)', () => {
  beforeEach(() => {
    process.env.CORA_DRY_RUN = 'true';
  });

  it('boundary: the circuit breaker is not consulted in dry-run (no real send is at risk)', async () => {
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, true]);

    await handleCoraInquiry(baseEmail);

    expect(countAuditLogs).not.toHaveBeenCalled();
    expect(mockGmailSend).not.toHaveBeenCalled();
  });

  it('dedup still applies in dry-run: a duplicate thread is skipped', async () => {
    findOrCreateReplyLog.mockResolvedValue([{ id: 'log-1' }, false]);

    const result = await handleCoraInquiry(baseEmail);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ archive: true });
  });
});
