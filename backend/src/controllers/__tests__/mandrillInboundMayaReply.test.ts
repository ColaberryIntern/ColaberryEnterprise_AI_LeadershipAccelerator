/**
 * OH1h (T2) - the inbound webhook hands a reply to a MAYA campaign to mayaReplyDraftService, and the generic
 * ("Dhee") auto-reply never runs for it. A non-Maya campaign takes exactly the path it took before. The harness is
 * mandrillInboundAutoReply.characterization.test.ts (real signature, real routing order); the draft service is a spy.
 */
import crypto from 'crypto';

const m = {
  generateMessage: jest.fn(),
  sendMail: jest.fn(),
  routing: jest.fn(),
  commFindOne: jest.fn(),
  maya: jest.fn(),
};

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
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn().mockResolvedValue(undefined), getLeadComms: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({ processOptOut: jest.fn(), detectStopKeyword: () => false }));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/ghlService', () => ({ addContactNote: jest.fn().mockResolvedValue(undefined), sendSmsViaGhl: jest.fn() }));
jest.mock('../../services/communicationSafetyService', () => ({ checkLeadSendable: jest.fn().mockResolvedValue({ sendable: false, reason: 'test' }) }));
jest.mock('../../services/maya/mayaReplyDraftService', () => ({ maybeDraftMayaReply: (...a: unknown[]) => m.maya(...a) }));

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

function mandrillReq(text: string) {
  const body = { mandrill_events: JSON.stringify([{ event: 'inbound', msg: { email: 'maya@reply.colaberry.ai', from_email: 'person@example.com', subject: 'Re: See you Thursday', text, headers: { 'Message-Id': '<m-1>', 'In-Reply-To': '<out-1>' } } }]) };
  const req: any = { body, headers: { 'x-mandrill-signature': signature(INBOUND_URL, body) }, protocol: 'https', get: () => 'enterprise.colaberry.ai', originalUrl: '/api/webhook/mandrill/inbound' };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
  return { req, res };
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  (Lead.findOne as jest.Mock).mockReset().mockResolvedValue(LEAD);
  m.routing.mockResolvedValue({ handled: false });
  m.generateMessage.mockResolvedValue({ body: '<p>Thanks for writing back.</p>' });
  m.sendMail.mockResolvedValue({ messageId: 'sent-1' });
  m.commFindOne.mockImplementation(async (q: { where: Record<string, unknown> }) => (q.where && 'provider_message_id' in q.where ? { campaign_id: 'camp-maya' } : null));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('a Maya campaign reply goes to the draft service with the Message-Id, and the generic auto-reply never runs', async () => {
  m.maya.mockResolvedValue({ outcome: 'queued', handled: true, queueId: 'q-1' });
  const { req, res } = mandrillReq('Will it be recorded?');
  await handleMandrillInbound(req, res);
  expect(m.maya).toHaveBeenCalledWith(expect.objectContaining({
    leadId: 501, fromEmail: 'person@example.com', subject: 'Re: See you Thursday', body: 'Will it be recorded?',
    messageId: '<m-1>', inReplyTo: '<out-1>', campaignId: 'camp-maya', explorer: false,
  }));
  expect(m.generateMessage).not.toHaveBeenCalled();
  expect(m.sendMail).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
});

it('an Explorer reply on a Maya campaign is still offered to Maya (draft only), flagged as an Explorer', async () => {
  m.routing.mockResolvedValue({ handled: true, suppressAutoReply: true, classification: { class: 'question', route: 'HUMAN_TASK', source: 'rules' } });
  m.maya.mockResolvedValue({ outcome: 'queued', handled: true });
  const { req, res } = mandrillReq('When is it?');
  await handleMandrillInbound(req, res);
  expect(m.maya).toHaveBeenCalledWith(expect.objectContaining({ explorer: true }));
  expect(m.sendMail).not.toHaveBeenCalled();
});

it('a non-Maya campaign (handled=false) takes exactly the old path', async () => {
  m.maya.mockResolvedValue({ outcome: 'not_maya', handled: false });
  const { req, res } = mandrillReq('Tell me more');
  await handleMandrillInbound(req, res);
  expect(m.generateMessage).toHaveBeenCalledTimes(1);
  expect(m.sendMail).toHaveBeenCalledTimes(1);
});

it('a draft service that throws falls back to the old path and the webhook still answers 200', async () => {
  m.maya.mockRejectedValue(new Error('boom'));
  const { req, res } = mandrillReq('Tell me more');
  await handleMandrillInbound(req, res);
  expect(m.sendMail).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(200);
});

it('an unsubscribe reply never reaches Maya', async () => {
  const { req, res } = mandrillReq('Please unsubscribe me');
  await handleMandrillInbound(req, res);
  expect(m.maya).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ status: 'unsubscribed' });
});
