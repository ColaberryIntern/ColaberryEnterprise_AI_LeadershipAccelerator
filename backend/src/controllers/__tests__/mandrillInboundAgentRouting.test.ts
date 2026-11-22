/**
 * Agent comms (T7, 2026-11-22) - mail addressed to an agent (maya@reply.colaberry.ai) reaches that agent,
 * proven through the REAL webhook handler (real signature check, real routing order). The agent's identity
 * lookup, the draft service and the database are stubbed; everything in mandrillWebhookController runs.
 *
 *  (i)  a lead-matched message to Maya that Maya's campaign drafter declines is drafted BY THE AGENT, and
 *       the generic auto-reply never runs;
 *  (ii) a message to Maya from someone with no Lead row is recorded with lead_id null against Maya and
 *       drafted, where before it was dropped as "No lead found";
 *  (iii) mail to an address that is no agent's takes exactly the old path.
 */
import crypto from 'crypto';

const m = {
  generateMessage: jest.fn(),
  sendMail: jest.fn(),
  routing: jest.fn(),
  commFindOne: jest.fn(),
  maya: jest.fn(),
  agentDraft: jest.fn(),
  logComm: jest.fn(),
  query: jest.fn(),
  leadRows: jest.fn(),
};

const MAYA = { agentName: 'Maya', slug: 'maya', displayName: 'Maya', fromAddress: 'maya@colaberry.com', fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' };

jest.mock('../../config/env', () => ({
  env: {
    mandrillWebhookKey: 'test-webhook-key',
    mandrillWebhookUrl: 'https://enterprise.colaberry.ai/api/webhook/mandrill',
    mandrillInboundDomain: 'reply.colaberry.ai',
    mandrillApiKey: 'not-a-real-key',
    emailFrom: 'ali@colaberry.com',
    adminAlertPhone: '+10000000000',
    growthJourney: { growthJourneyEnabled: false, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false },
  },
}));
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => m.query(...a) } }));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: (...a: unknown[]) => m.sendMail(...a) }) }));
jest.mock('../../services/aiMessageService', () => ({
  generateMessage: (...a: unknown[]) => m.generateMessage(...a),
  buildConversationHistory: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/synthflowService', () => ({ triggerVoiceCall: jest.fn() }));
jest.mock('../../services/growthJourney/classificationService', () => ({ classifySubject: jest.fn().mockResolvedValue({ status: 'disabled' }) }));
jest.mock('../../services/growthJourney/handoffs/handoffService', () => ({ createHandoff: jest.fn(), assignHandoff: jest.fn() }));
jest.mock('../../services/workforce/ticketReplyService', () => ({ handleTicketReplyEmail: jest.fn() }));
jest.mock('../../services/interactionService', () => ({ recordWebhookOutcome: jest.fn() }));
jest.mock('../../services/explorerGrowth/explorerInboundRouter', () => ({ resolveExplorerReplyRouting: (...a: unknown[]) => m.routing(...a) }));
jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
  InteractionOutcome: { create: jest.fn() },
  CampaignLead: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulation: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulationStep: { findOne: jest.fn() },
  CommunicationLog: { findOne: (...a: unknown[]) => m.commFindOne(...a) },
  Campaign: { findOne: jest.fn().mockResolvedValue(null), findByPk: jest.fn().mockResolvedValue({ settings: { sender_name: 'Dhee - Colaberry Enterprise AI', sender_email: 'dhee@colaberry.com' } }) },
  FollowUpSequence: {},
}));
jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({
  logCommunication: (...a: unknown[]) => m.logComm(...a),
  getLeadComms: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({ processOptOut: jest.fn(), detectStopKeyword: () => false }));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/ghlService', () => ({ addContactNote: jest.fn().mockResolvedValue(undefined), sendSmsViaGhl: jest.fn() }));
jest.mock('../../services/communicationSafetyService', () => ({ checkLeadSendable: jest.fn().mockResolvedValue({ sendable: false, reason: 'test' }) }));
jest.mock('../../services/maya/mayaReplyDraftService', () => ({ maybeDraftMayaReply: (...a: unknown[]) => m.maya(...a) }));
jest.mock('../../services/agents/email/agentEmailIdentity', () => ({
  agentForRecipient: async (a: unknown) => (String(a).toLowerCase().startsWith('maya@reply.colaberry.ai') ? MAYA : null),
  isAgentOwnAddress: (a: unknown) => /@reply\.colaberry\.ai$|^maya@colaberry\.com$/i.test(String(a)),
}));
jest.mock('../../services/agents/email/agentReplyDraftService', () => ({
  draftAgentReply: (...a: unknown[]) => m.agentDraft(...a),
  defaultDraftDeps: () => ({}),
}));

import { Lead } from '../../models';
import { handleMandrillInbound } from '../mandrillWebhookController';

const WEBHOOK_KEY = 'test-webhook-key';
const INBOUND_URL = 'https://enterprise.colaberry.ai/api/webhook/mandrill/inbound';
const LEAD = { id: 501, name: 'A Person', email: 'person@example.com', company: 'Example Co', title: 'CTO', status: 'active' };

function signature(url: string, params: Record<string, string>): string {
  let signedData = url;
  for (const key of Object.keys(params).sort()) signedData += key + params[key];
  return crypto.createHmac('sha1', WEBHOOK_KEY).update(signedData).digest('base64');
}

function mandrillReq(to: string, from: string, text: string) {
  const body = { mandrill_events: JSON.stringify([{ event: 'inbound', msg: { email: to, from_email: from, from_name: 'A Person', subject: 'Question about the pilot', text, headers: { 'Message-Id': '<m-1@example.com>' } } }]) };
  const req: any = { body, headers: { 'x-mandrill-signature': signature(INBOUND_URL, body) }, protocol: 'https', get: () => 'enterprise.colaberry.ai', originalUrl: '/api/webhook/mandrill/inbound' };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
  return { req, res };
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  (Lead.findOne as jest.Mock).mockReset().mockResolvedValue(LEAD);
  m.leadRows.mockReturnValue('1');
  // The router's own reads: lead exists?, seen?, caps; and the metadata merge.
  m.query.mockImplementation(async (sql: string) => {
    if (/FROM leads/.test(sql)) return [{ n: m.leadRows() }];
    if (/^\s*UPDATE/.test(sql)) return [];
    return [{ n: '0' }];
  });
  m.routing.mockResolvedValue({ handled: false });
  m.maya.mockResolvedValue({ outcome: 'not_maya', handled: false });
  m.agentDraft.mockResolvedValue({ outcome: 'queued', queueId: 'q-7' });
  m.logComm.mockResolvedValue({ get: (k: string) => (k === 'id' ? 'log-1' : undefined) });
  m.generateMessage.mockResolvedValue({ body: '<p>Thanks for writing back.</p>' });
  m.sendMail.mockResolvedValue({ messageId: 'sent-1' });
  m.commFindOne.mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('(i) a lead writing to Maya, not on a Maya campaign, is drafted BY MAYA and gets no generic auto-reply', async () => {
  const { req, res } = mandrillReq('maya@reply.colaberry.ai', 'person@example.com', 'How long is a pilot?');
  await handleMandrillInbound(req, res);
  expect(m.agentDraft).toHaveBeenCalledTimes(1);
  expect(m.agentDraft.mock.calls[0][0]).toEqual(MAYA);
  expect(m.agentDraft.mock.calls[0][1]).toMatchObject({ fromAddress: 'person@example.com', leadId: 501, messageId: 'm-1@example.com' });
  expect(m.generateMessage).not.toHaveBeenCalled();
  expect(m.sendMail).not.toHaveBeenCalled();
  // the lead's inbound log carries the agent's name, so it shows on her dashboard
  expect(m.logComm).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 501, direction: 'inbound', metadata: expect.objectContaining({ agent_name: 'Maya' }) }));
  expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
});

it('(ii) someone with NO lead row writing to Maya is recorded against her with lead_id null and drafted', async () => {
  (Lead.findOne as jest.Mock).mockResolvedValue(null);
  m.leadRows.mockReturnValue('0');
  const { req, res } = mandrillReq('maya@reply.colaberry.ai', 'stranger@acme.com', 'Is the program right for me?');
  await handleMandrillInbound(req, res);
  expect(m.logComm).toHaveBeenCalledWith(expect.objectContaining({
    lead_id: null, direction: 'inbound', from_address: 'stranger@acme.com', to_address: 'maya@reply.colaberry.ai',
    metadata: expect.objectContaining({ agent_name: 'Maya', message_id: 'm-1@example.com' }),
  }));
  expect(m.agentDraft.mock.calls[0][1]).toMatchObject({ fromAddress: 'stranger@acme.com', leadId: null });
  expect(m.query.mock.calls.some(([sql]) => /^\s*UPDATE communication_logs/.test(String(sql)))).toBe(true);
  expect(m.sendMail).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
});

it('(ii-b) an auto-reply to Maya from an unknown sender is dropped: no draft, no loop', async () => {
  (Lead.findOne as jest.Mock).mockResolvedValue(null);
  m.leadRows.mockReturnValue('0');
  const { req, res } = mandrillReq('maya@reply.colaberry.ai', 'mailer-daemon@acme.com', 'Undeliverable');
  await handleMandrillInbound(req, res);
  expect(m.agentDraft).not.toHaveBeenCalled();
  expect(m.sendMail).not.toHaveBeenCalled();
});

it('(iii) mail to an address that is no agent\'s takes exactly the old path', async () => {
  const { req, res } = mandrillReq('dhee@reply.colaberry.ai', 'person@example.com', 'Tell me more');
  await handleMandrillInbound(req, res);
  expect(m.agentDraft).not.toHaveBeenCalled();
  expect(m.generateMessage).toHaveBeenCalledTimes(1);
  expect(m.sendMail).toHaveBeenCalledTimes(1);
});

it('(iii-b) no lead and no agent is still "No lead found", skipped', async () => {
  (Lead.findOne as jest.Mock).mockResolvedValue(null);
  const { req, res } = mandrillReq('dhee@reply.colaberry.ai', 'stranger@acme.com', 'hi');
  await handleMandrillInbound(req, res);
  expect(m.agentDraft).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ processed: 0, skipped: 1 });
});
