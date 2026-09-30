/**
 * T225 — the reply hooks in the two inbound webhooks. Proves: the hook runs
 * AFTER the existing opt-out processing, it is fire-and-forget (a rejected
 * classification cannot change the response), it carries the campaign the
 * webhook resolved, and nothing about the existing path changed. Signatures
 * are real (the harness from mandrillInboundTicketReply.test.ts).
 */
import crypto from 'crypto';

const calls: string[] = [];
const classifySubject = jest.fn();
const processOptOut = jest.fn(async () => { calls.push('processOptOut'); });

jest.mock('../../config/env', () => ({
  env: {
    mandrillWebhookKey: 'test-webhook-key',
    mandrillWebhookUrl: 'https://enterprise.colaberry.ai/api/webhook/mandrill',
    mandrillInboundDomain: 'reply.colaberry.ai',
    emailFrom: 'ali@colaberry.com',
    growthJourney: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyExecution: false },
  },
}));
jest.mock('../../services/growthJourney/classificationService', () => ({
  classifySubject: (...a: unknown[]) => { calls.push('classifySubject'); return classifySubject(...a); },
}));
jest.mock('../../services/workforce/ticketReplyService', () => ({ handleTicketReplyEmail: jest.fn() }));
jest.mock('../../services/interactionService', () => ({ recordWebhookOutcome: jest.fn() }));
jest.mock('../../services/explorerGrowth/explorerInboundRouter', () => ({ resolveExplorerReplyRouting: jest.fn(async () => ({ handled: false })) }));
jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
  InteractionOutcome: { create: jest.fn() },
  CampaignLead: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulation: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulationStep: { findOne: jest.fn() },
  // Returned for BOTH the In-Reply-To campaign lookup and the "Ali personal outreach" check,
  // so campaignId resolves to camp-1 and the auto-reply block is skipped.
  CommunicationLog: { findOne: jest.fn().mockResolvedValue({ campaign_id: 'camp-1' }) },
  Campaign: { findOne: jest.fn().mockResolvedValue(null), findByPk: jest.fn() },
  FollowUpSequence: {},
}));
jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn().mockResolvedValue(undefined), getLeadComms: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({
  processOptOut: (...a: unknown[]) => processOptOut(...a),
  detectStopKeyword: (msg: string) => /^\s*stop\s*$/i.test(msg),
}));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/ghlService', () => ({ addContactNote: jest.fn().mockResolvedValue(undefined), sendSmsViaGhl: jest.fn() }));
jest.mock('../../services/aiMessageService', () => ({ generateMessage: jest.fn() }));
jest.mock('../../services/communicationSafetyService', () => ({ checkLeadSendable: jest.fn().mockResolvedValue({ sendable: false, reason: 'test' }) }));

import { Lead } from '../../models';
import { handleMandrillInbound } from '../mandrillWebhookController';
import { handleGhlSmsReply } from '../ghlWebhookController';

const WEBHOOK_KEY = 'test-webhook-key';
const INBOUND_URL = 'https://enterprise.colaberry.ai/api/webhook/mandrill/inbound';
const LEAD = { id: 501, name: 'A Person', email: 'person@example.com', status: 'active' };

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

function ghlReq(message: string) {
  const req: any = { body: { contactId: 'ghl-1', phone: '+15550001111', message, campaignTag: null } };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return { req, res };
}

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  calls.length = 0;
  classifySubject.mockReset().mockResolvedValue({ status: 'classified' });
  processOptOut.mockClear();
  (Lead.findOne as jest.Mock).mockReset().mockResolvedValue(LEAD);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Mandrill inbound', () => {
  it('an opt-out reply: processOptOut runs FIRST, the hook after, the response is still "unsubscribed"', async () => {
    const { req, res } = mandrillReq('please unsubscribe me');
    await handleMandrillInbound(req, res);
    await flush();
    expect(calls).toEqual(['processOptOut', 'classifySubject']);
    expect(res.json).toHaveBeenCalledWith({ status: 'unsubscribed' });
    expect(classifySubject).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'reply', anchor: { leadId: 501 }, extras: expect.objectContaining({ reply: expect.objectContaining({ channel: 'email', campaign_id: 'camp-1', provider_message_id: '<m-1>' }) }) }));
  });

  it('a normal reply: the hook is called once with the body and the resolved campaign; processOptOut is not', async () => {
    const { req, res } = mandrillReq('Yes, tell me more about automation');
    await handleMandrillInbound(req, res);
    await flush();
    expect(processOptOut).not.toHaveBeenCalled();
    expect(classifySubject).toHaveBeenCalledTimes(1);
    expect(classifySubject.mock.calls[0][0].extras.reply.body).toBe('Yes, tell me more about automation');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('a rejected classification changes nothing: same 200, same body, an error line with a class and no address', async () => {
    classifySubject.mockRejectedValue(Object.assign(new Error('db down person@example.com'), { name: 'SequelizeConnectionError' }));
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    await flush();
    expect(res.status).toHaveBeenCalledWith(200);
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('reply_hook_failed'));
    expect(line).toBeDefined();
    expect(line).not.toContain('@');
    expect(JSON.parse(line!).error_class).toBeTruthy();
  });

  it('control: an unknown sender is not classified (no lead → no hook)', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    const { req, res } = mandrillReq('hello');
    await handleMandrillInbound(req, res);
    await flush();
    expect(classifySubject).not.toHaveBeenCalled();
  });
});

describe('GHL SMS inbound', () => {
  it('STOP: processOptOut first, the hook after, the opted_out response unchanged', async () => {
    const { req, res } = ghlReq('STOP');
    await handleGhlSmsReply(req, res);
    await flush();
    expect(calls).toEqual(['processOptOut', 'classifySubject']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ opted_out: true, lead_id: 501 }));
    expect(classifySubject.mock.calls[0][0].extras.reply.channel).toBe('sms');
  });

  it('a normal SMS reply: the hook is called once with the message', async () => {
    const { req, res } = ghlReq('yes please call me');
    await handleGhlSmsReply(req, res);
    await flush();
    expect(processOptOut).not.toHaveBeenCalled();
    expect(classifySubject).toHaveBeenCalledTimes(1);
    expect(classifySubject.mock.calls[0][0].extras.reply).toMatchObject({ body: 'yes please call me', channel: 'sms' });
  });
});
