const m = {
  generateMessage: jest.fn(),
  sendMail: jest.fn(),
  logCommunication: jest.fn(),
  commFindOne: jest.fn(),
  receiptFindOne: jest.fn(),
  ownershipFindOne: jest.fn(),
  envFlags: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true },
};
jest.mock('../../../config/env', () => ({
  env: { mandrillInboundDomain: 'reply.colaberry.ai', mandrillApiKey: 'not-a-real-key', emailFrom: 'ali@colaberry.com', get growthJourney() { return m.envFlags; } },
}));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: (...a: unknown[]) => m.sendMail(...a) }) }));
jest.mock('../../aiMessageService', () => ({ generateMessage: (...a: unknown[]) => m.generateMessage(...a), buildConversationHistory: jest.fn().mockResolvedValue([]) }));
jest.mock('../../communicationLogService', () => ({ logCommunication: (...a: unknown[]) => m.logCommunication(...a) }));
jest.mock('../../../models', () => ({
  CommunicationLog: { findOne: (...a: unknown[]) => m.commFindOne(...a) },
  Campaign: { findByPk: jest.fn().mockResolvedValue({ settings: { sender_name: 'Dhee - Colaberry Enterprise AI', sender_email: 'dhee@colaberry.com' } }) },
  GrowthJourneyExecution: { findOne: (...a: unknown[]) => m.receiptFindOne(...a) },
  GrowthJourneyConversationOwnership: { findOne: (...a: unknown[]) => m.ownershipFindOne(...a) },
}));
// The guard imports the open-status list as a value from the model file, whose Model.init needs the real database module.
jest.mock('../../../models/GrowthJourneyExecution', () => ({ OPEN_EXECUTION_STATUSES: ['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress'] }));

import { sendInboundAutoReply } from '../inboundAutoReply';

/**
 * T515b - the skip in the extracted auto-reply: a lead the journey is
 * mid-sequence with, or a human owns, never meets the generated reply. The
 * mailer and the model are spies; the receipt and ownership reads are the
 * injected boundary. The control case sends exactly as the characterization
 * suite pinned.
 */

const lead = { id: 515, name: 'A Person', email: 'person@example.com', company: null, title: null } as unknown as Parameters<typeof sendInboundAutoReply>[0]['lead'];
const args = () => ({ lead, campaignId: 'camp-1', body: 'Yes please', subject: 'Re: hi', fromEmail: 'person@example.com', inReplyTo: '<out-1>' });
const logs = () => (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));
const skipLine = () => logs().find((l) => l.includes('inbound_auto_reply_skipped'));

beforeEach(() => {
  for (const fn of [m.generateMessage, m.sendMail, m.logCommunication, m.commFindOne, m.receiptFindOne, m.ownershipFindOne]) fn.mockReset();
  m.envFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true };
  m.commFindOne.mockResolvedValue(null);
  m.receiptFindOne.mockResolvedValue(null);
  m.ownershipFindOne.mockResolvedValue(null);
  m.generateMessage.mockResolvedValue({ body: '<p>Thanks.</p>' });
  m.sendMail.mockResolvedValue({ messageId: 'sent-1' });
  m.logCommunication.mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('acceptance 2: an open receipt silences the auto-reply; without one it still sends', () => {
  it('an OPEN execution receipt for the lead -> nothing generated, nothing sent, one skip line with the reason and the lead id and no address', async () => {
    m.receiptFindOne.mockResolvedValue({ id: 'ex-1' });
    await sendInboundAutoReply(args());
    expect(m.generateMessage).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(m.logCommunication).not.toHaveBeenCalled();
    const line = skipLine()!;
    expect(JSON.parse(line)).toMatchObject({ level: 'info', service: 'growth-journey', event: 'inbound_auto_reply_skipped', context: { lead_id: 515, reason: 'open_receipt' } });
    expect(line).not.toContain('@');
    expect(m.receiptFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ lead_id: 515 }) }));
  });

  it('an open human-ownership row for the lead -> the same silence, reason open_ownership', async () => {
    m.ownershipFindOne.mockResolvedValue({ id: 'own-1' });
    await sendInboundAutoReply(args());
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(JSON.parse(skipLine()!)).toMatchObject({ context: { lead_id: 515, reason: 'open_ownership' } });
    expect(m.ownershipFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { lead_id: 515, cleared_at: null } }));
  });

  it('the control: neither -> the reply is generated and sent exactly as before, and no skip line is written', async () => {
    await sendInboundAutoReply(args());
    expect(m.generateMessage).toHaveBeenCalledTimes(1);
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.sendMail.mock.calls[0][0]).toMatchObject({ to: 'person@example.com', subject: 'Re: hi', html: '<p>Thanks.</p>' });
    expect(m.logCommunication).toHaveBeenCalledWith(expect.objectContaining({ direction: 'outbound', metadata: { auto_reply: true, in_reply_to: '<out-1>' } }));
    expect(skipLine()).toBeUndefined();
  });

  it('the Ali personal-outreach skip still stands after the guard: a clean guard, an Ali row -> no send, the old log line', async () => {
    m.commFindOne.mockImplementation(async (q: { where: { metadata?: { trigger?: string } } }) => (q.where.metadata?.trigger === 'ali_personal_outreach' ? { id: 'cl-ali' } : null));
    await sendInboundAutoReply(args());
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(logs()).toContain('[MandrillInbound] Skipping auto-reply — Ali personal outreach (Ali handles personally)');
  });
});

describe('the guard fails closed, and is inert with the master off', () => {
  it('a receipt read that throws -> skipped with guard_unavailable, one error line with the class; nothing sent', async () => {
    m.receiptFindOne.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    await sendInboundAutoReply(args());
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(JSON.parse(skipLine()!)).toMatchObject({ context: { lead_id: 515, reason: 'guard_unavailable' } });
    const err = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.auto_reply_guard_failed'))!;
    expect(JSON.parse(err)).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'SequelizeConnectionError', context: { lead_id: 515 } });
  });

  it('master flag off (production today): neither table is read and the reply sends exactly as before', async () => {
    // That the guard is not even REQUIRED with the master off is pinned where it can fail: the characterization suite
    // stubs env without a database URL, so a require of the guard there throws (its import chain constructs Sequelize),
    // and dropping the gate fails that suite (the T515 mutation run, M7). A factory-call spy cannot pin it: jest hands
    // an isolated registry the same mock instance, so the factory does not run again.
    m.envFlags = { ...m.envFlags, growthJourneyEnabled: false };
    m.receiptFindOne.mockResolvedValue({ id: 'ex-1' }); // would skip if consulted
    await sendInboundAutoReply(args());
    expect(m.receiptFindOne).not.toHaveBeenCalled();
    expect(m.ownershipFindOne).not.toHaveBeenCalled();
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(skipLine()).toBeUndefined();
  });
});
