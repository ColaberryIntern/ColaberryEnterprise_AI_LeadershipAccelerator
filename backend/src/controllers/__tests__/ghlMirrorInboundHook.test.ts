/**
 * OH1l (T6): the GHL mirror hook on the Mandrill inbound reply path, end to end through the
 * real ghlMirrorService with GHL itself mocked. Setting off: GHL is never called. Setting on:
 * exactly one note on the lead's contact. A GHL failure leaves the webhook's 200 unchanged.
 * (Harness from replyClassificationHook.test.ts; signatures are real.)
 */
import crypto from 'crypto';

let mirrorSetting: any = false;
const addContactNote = jest.fn();
const syncLeadToGhl = jest.fn();

jest.mock('../../config/env', () => ({
  env: {
    mandrillWebhookKey: 'test-webhook-key',
    mandrillWebhookUrl: 'https://enterprise.colaberry.ai/api/webhook/mandrill',
    mandrillInboundDomain: 'reply.colaberry.ai',
    emailFrom: 'ali@colaberry.com',
    growthJourney: { growthJourneyEnabled: false, journeySignalIngest: false, journeyClassification: false, journeyExecution: false },
  },
}));
jest.mock('../../services/settingsService', () => ({
  getSetting: jest.fn(async (key: string) => (key === 'ghl_mirror_enabled' ? mirrorSetting : null)),
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }),
}));
jest.mock('../../services/leads/ghlAccountRouting', () => ({
  resolveGhlAccountForSource: jest.fn().mockResolvedValue({ status: 'ready', account: { apiKey: 'k', accountKey: 'default' } }),
}));
jest.mock('../../services/growthJourney/classificationService', () => ({ classifySubject: jest.fn().mockResolvedValue({ status: 'skipped' }) }));
jest.mock('../../services/workforce/ticketReplyService', () => ({ handleTicketReplyEmail: jest.fn() }));
jest.mock('../../services/interactionService', () => ({ recordWebhookOutcome: jest.fn() }));
jest.mock('../../services/explorerGrowth/explorerInboundRouter', () => ({ resolveExplorerReplyRouting: jest.fn(async () => ({ handled: false })) }));
jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
  InteractionOutcome: { create: jest.fn() },
  CampaignLead: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulation: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulationStep: { findOne: jest.fn() },
  CommunicationLog: { findOne: jest.fn().mockResolvedValue({ campaign_id: 'camp-1' }) },
  Campaign: { findOne: jest.fn().mockResolvedValue(null), findByPk: jest.fn() },
  FollowUpSequence: {},
}));
jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn().mockResolvedValue(undefined), getLeadComms: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({
  processOptOut: jest.fn(),
  detectStopKeyword: (msg: string) => /^\s*stop\s*$/i.test(msg),
}));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/ghlService', () => ({
  addContactNote: (...a: unknown[]) => addContactNote(...a),
  syncLeadToGhl: (...a: unknown[]) => syncLeadToGhl(...a),
  sendSmsViaGhl: jest.fn(),
}));
jest.mock('../../services/aiMessageService', () => ({ generateMessage: jest.fn() }));
jest.mock('../../services/communicationSafetyService', () => ({ checkLeadSendable: jest.fn().mockResolvedValue({ sendable: false, reason: 'test' }) }));

import { Lead } from '../../models';
import { handleMandrillInbound } from '../mandrillWebhookController';

const WEBHOOK_KEY = 'test-webhook-key';
const INBOUND_URL = 'https://enterprise.colaberry.ai/api/webhook/mandrill/inbound';
const LEAD = { id: 501, name: 'A Person', email: 'person@example.com', status: 'active', ghl_contact_id: 'ghl-501', source: 'open_house' };

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

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

beforeEach(() => {
  addContactNote.mockReset().mockResolvedValue(undefined);
  syncLeadToGhl.mockReset();
  (Lead.findOne as jest.Mock).mockReset().mockResolvedValue(LEAD);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GHL mirror on an inbound email reply', () => {
  it('setting off (the default): no GHL call at all', async () => {
    mirrorSetting = false;
    const { req, res } = mandrillReq('Yes, see you there');
    await handleMandrillInbound(req, res);
    await flush();
    expect(addContactNote).not.toHaveBeenCalled();
    expect(syncLeadToGhl).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('setting on: exactly one note on the lead\'s contact with the reply text', async () => {
    mirrorSetting = true;
    const { req, res } = mandrillReq('Yes, see you there');
    await handleMandrillInbound(req, res);
    await flush();
    expect(addContactNote).toHaveBeenCalledTimes(1);
    const [contactId, note, apiKey] = addContactNote.mock.calls[0];
    expect(contactId).toBe('ghl-501');
    expect(apiKey).toBe('k');
    expect(note).toContain('Email reply received');
    expect(note).toContain('Yes, see you there');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('setting on, GHL fails: the webhook still answers 200', async () => {
    mirrorSetting = true;
    addContactNote.mockRejectedValue(new Error('GHL 500'));
    const { req, res } = mandrillReq('Yes');
    await handleMandrillInbound(req, res);
    await flush();
    expect(addContactNote).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
