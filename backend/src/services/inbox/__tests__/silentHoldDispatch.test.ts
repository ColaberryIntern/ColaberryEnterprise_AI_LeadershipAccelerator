/**
 * SILENT_HOLD must take the message out of the inbox (it was a no-op until
 * 2026-11-23, so 46 of 189 inbox messages were "hidden" mail that never left),
 * EXCEPT Ali's own BCC receipts, which his standing instruction keeps visible.
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn(), where: jest.fn(), fn: jest.fn(), col: jest.fn() },
}));
jest.mock('../../../models/InboxEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/InboxClassification', () => ({
  __esModule: true,
  default: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
}));
jest.mock('../hardRuleEngine', () => ({ evaluateHardRules: jest.fn() }));
jest.mock('../llmClassificationService', () => ({ classifyWithLLM: jest.fn() }));
jest.mock('../inboxAuditService', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../autoArchiveService', () => ({ archiveEmail: jest.fn() }));
jest.mock('../smsAlertService', () => ({ alertVipEmail: jest.fn(), detectUrgentKeywords: jest.fn(), alertUrgentEmail: jest.fn() }));
jest.mock('../calendarIntelligenceService', () => ({ detectMeetingIntent: jest.fn(() => false) }));
jest.mock('../../unsubscribeEnforcementService', () => ({ detectInboxUnsubscribeIntent: jest.fn(() => ({ matched: false })) }));

import { processNewEmails } from '../inboxStateManager';
import { shouldArchiveSilentHold } from '../silentHoldPolicy';
import { sequelize } from '../../../config/database';
import { classifyWithLLM } from '../llmClassificationService';
import { evaluateHardRules } from '../hardRuleEngine';
import { archiveEmail } from '../autoArchiveService';

const query = sequelize.query as unknown as jest.Mock;
const llm = classifyWithLLM as jest.Mock;
const hard = evaluateHardRules as jest.Mock;
const archive = archiveEmail as jest.Mock;

function email(from: string, id = 'e1') {
  return {
    id, provider: 'gmail_colaberry', provider_message_id: `pm-${id}`,
    from_address: from, from_name: null, to_addresses: [], cc_addresses: [],
    subject: 'Something', body_text: 'body', headers: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  hard.mockResolvedValue({ matched: false });
  llm.mockResolvedValue({ suggested_state: 'SILENT_HOLD', confidence: 30, reasoning: 'r', reply_needed: false });
});

describe('shouldArchiveSilentHold', () => {
  it('archives ordinary senders', () => {
    expect(shouldArchiveSilentHold('discussions@school.colaberry.com')).toBe(true);
    expect(shouldArchiveSilentHold('order-update@amazon.com')).toBe(true);
  });
  it('keeps Ali\'s own BCC receipts, in any casing or display form', () => {
    expect(shouldArchiveSilentHold('ali@colaberry.com')).toBe(false);
    expect(shouldArchiveSilentHold('ALI@Colaberry.com')).toBe(false);
    expect(shouldArchiveSilentHold('Ali Muwwakkil <ali@colaberry.com>')).toBe(false);
  });
  it('does not treat look-alikes or empty input as Ali', () => {
    expect(shouldArchiveSilentHold('ali@colaberry.com.evil.io')).toBe(true);
    expect(shouldArchiveSilentHold('notali@colaberry.com')).toBe(true);
    expect(shouldArchiveSilentHold('')).toBe(true);
    expect(shouldArchiveSilentHold(null)).toBe(true);
  });
});

describe('processNewEmails: SILENT_HOLD dispatch', () => {
  it('archives a SILENT_HOLD message from an ordinary sender', async () => {
    query.mockResolvedValue([email('order-update@amazon.com')]);
    await processNewEmails();
    expect(archive).toHaveBeenCalledWith({ id: 'e1', provider: 'gmail_colaberry', provider_message_id: 'pm-e1' });
  });

  it('leaves Ali\'s own SILENT_HOLD receipt in the inbox', async () => {
    query.mockResolvedValue([email('ali@colaberry.com')]);
    await processNewEmails();
    expect(archive).not.toHaveBeenCalled();
  });

  it('still does not archive INBOX or ASK_USER mail', async () => {
    query.mockResolvedValue([email('a@x.com', 'e1'), email('b@x.com', 'e2')]);
    llm
      .mockResolvedValueOnce({ suggested_state: 'INBOX', confidence: 90, reasoning: 'r', reply_needed: false })
      .mockResolvedValueOnce({ suggested_state: 'ASK_USER', confidence: 50, reasoning: 'r', reply_needed: false });
    await processNewEmails();
    expect(archive).not.toHaveBeenCalled();
  });

  it('an archive failure on one message does not stop the batch', async () => {
    query.mockResolvedValue([email('a@x.com', 'e1'), email('b@x.com', 'e2')]);
    archive.mockRejectedValueOnce(new Error('Gmail 503'));
    const r = await processNewEmails();
    expect(archive).toHaveBeenCalledTimes(2);
    expect(r.processed).toBe(2);
  });
});
