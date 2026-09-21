/**
 * T515a - the Mandrill inbound auto-reply, CHARACTERIZED before it moves.
 *
 * Four cases drive the real webhook controller (the harness of
 * `replyClassificationHook.test.ts`: real signature, real routing order) and
 * pin what the auto-reply block does today: the Explorer-routed skip, the Ali
 * personal-outreach skip, a normal reply that generates and sends, and the
 * error path that warns and moves on. This file is byte-identical before and
 * after the block's extraction into `services/inbound/inboundAutoReply.ts`;
 * passing on both sides is the extraction's proof. Nothing here reaches a
 * mailer, a model or a dialler: all three are spies.
 */
import crypto from 'crypto';

const m = {
  generateMessage: jest.fn(),
  sendMail: jest.fn(),
  logCommunication: jest.fn(),
  routing: jest.fn(),
  commFindOne: jest.fn(),
  voiceCall: jest.fn(),
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
jest.mock('../../services/synthflowService', () => ({ triggerVoiceCall: (...a: unknown[]) => m.voiceCall(...a) }));
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
jest.mock('../../services/communicationLogService', () => ({ logCommunication: (...a: unknown[]) => m.logCommunication(...a), getLeadComms: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({ processOptOut: jest.fn(), detectStopKeyword: () => false }));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/ghlService', () => ({ addContactNote: jest.fn().mockResolvedValue(undefined), sendSmsViaGhl: jest.fn() }));
jest.mock('../../services/communicationSafetyService', () => ({ checkLeadSendable: jest.fn().mockResolvedValue({ sendable: false, reason: 'test' }) }));

import { Lead } from '../../models';
import { handleMandrillInbound } from '../mandrillWebhookController';

const WEBHOOK_KEY = 'test-webhook-key';
const INBOUND_URL = 'https://enterprise.colaberry.ai/api/webhook/mandrill/inbound';
const LEAD = { id: 501, name: 'A Person', email: 'person@example.com', company: 'Example Co', title: 'CTO', status: 'active' };

function realMandrillSignature(url: string, params: Record<string, string>): string {
  let signedData = url;
  for (const key of Object.keys(params).sort()) signedData += key + params[key];
  return crypto.createHmac('sha1', WEBHOOK_KEY).update(signedData).digest('base64');
}

function mandrillReq(text: string) {
  const body = { mandrill_events: JSON.stringify([{ event: 'inbound', msg: { email: 'someone@reply.colaberry.ai', from_email: 'person@example.com', subject: 'Re: hi', text, headers: { 'Message-Id': '<m-1>', 'In-Reply-To': '<out-1>' } } }]) };
  const req: any = { body, headers: { 'x-mandrill-signature': realMandrillSignature(INBOUND_URL, body) }, protocol: 'https', get: () => 'enterprise.colaberry.ai', originalUrl: '/api/webhook/mandrill/inbound' };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
  return { req, res };
}

/** The In-Reply-To lookup finds the outbound row (campaign camp-1); the Ali personal-outreach check finds `aliRow`. */
function commLogWorld(aliRow: unknown) {
  m.commFindOne.mockImplementation(async (q: { where: Record<string, unknown> }) => {
    if (q.where && 'provider_message_id' in q.where) return { campaign_id: 'camp-1' };
    if (q.where && (q.where.metadata as { trigger?: string } | undefined)?.trigger === 'ali_personal_outreach') return aliRow;
    return null;
  });
}

const logs = () => (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));
const warns = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  (Lead.findOne as jest.Mock).mockReset().mockResolvedValue(LEAD);
  m.routing.mockResolvedValue({ handled: false });
  m.generateMessage.mockResolvedValue({ body: '<p>Thanks for writing back.</p>' });
  m.sendMail.mockResolvedValue({ messageId: 'sent-1' });
  m.logCommunication.mockResolvedValue(undefined);
  m.voiceCall.mockResolvedValue(undefined);
  commLogWorld(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the auto-reply block, characterized', () => {
  it('case 1 - the Explorer-routed skip: nothing generated, nothing sent, the skip logged, the event counted as processed', async () => {
    m.routing.mockResolvedValue({ handled: true, suppressAutoReply: true, classification: { class: 'question', route: 'HUMAN_TASK', source: 'rules' } });
    const { req, res } = mandrillReq('When does the next cohort start?');
    await handleMandrillInbound(req, res);
    expect(m.generateMessage).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(logs()).toContain('[MandrillInbound] Skipping auto-reply — Explorer reply routed to the classifier');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
  });

  it('case 2 - the Ali personal-outreach skip: nothing generated, nothing sent, the skip logged; the Cory call to Ali still fires', async () => {
    commLogWorld({ id: 'cl-ali', metadata: { trigger: 'ali_personal_outreach' } });
    const { req, res } = mandrillReq('Sure, let us talk');
    await handleMandrillInbound(req, res);
    expect(m.generateMessage).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(logs()).toContain('[MandrillInbound] Skipping auto-reply — Ali personal outreach (Ali handles personally)');
    expect(m.voiceCall).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
  });

  it('case 3 - a normal reply: one generated message, one send with the campaign sender and the reply-to on the inbound domain, one outbound log row flagged auto_reply', async () => {
    const { req, res } = mandrillReq('Yes, tell me more about automation');
    await handleMandrillInbound(req, res);
    expect(m.generateMessage).toHaveBeenCalledTimes(1);
    const gen = m.generateMessage.mock.calls[0][0] as { channel: string; tone: string; ai_instructions: string; lead: { email: string } };
    expect(gen.channel).toBe('email');
    expect(gen.tone).toBe('warm');
    expect(gen.ai_instructions).toContain('The lead said: "Yes, tell me more about automation"');
    expect(gen.ai_instructions).toContain('Sign off as Dhee.');
    expect(gen.lead.email).toBe('person@example.com');
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.sendMail.mock.calls[0][0]).toEqual({
      from: '"Dhee - Colaberry Enterprise AI" <dhee@colaberry.com>',
      replyTo: '"Dhee - Colaberry Enterprise AI" <dhee@reply.colaberry.ai>',
      to: 'person@example.com',
      subject: 'Re: hi',
      html: '<p>Thanks for writing back.</p>',
    });
    expect(m.logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: 501, campaign_id: 'camp-1', channel: 'email', direction: 'outbound', delivery_mode: 'live', status: 'sent',
      to_address: 'person@example.com', from_address: 'dhee@colaberry.com', subject: 'Re: hi', body: '<p>Thanks for writing back.</p>', provider: 'mandrill',
      metadata: { auto_reply: true, in_reply_to: '<out-1>' },
    }));
    expect(logs().some((l) => l.startsWith('[MandrillInbound] Auto-replied to'))).toBe(true);
    expect(m.voiceCall).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
  });

  it('case 4 - the error path: a generator that throws is one warn line naming the lead id; nothing is sent; the webhook still answers 200 and counts the event', async () => {
    m.generateMessage.mockRejectedValue(new Error('model unavailable'));
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(m.logCommunication).not.toHaveBeenCalledWith(expect.objectContaining({ direction: 'outbound' }));
    expect(warns()).toContain('[MandrillInbound] Auto-reply failed for lead 501: model unavailable');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ processed: 1, skipped: 0 });
  });
});
