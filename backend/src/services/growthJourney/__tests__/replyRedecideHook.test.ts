/**
 * T515b - the reply hook's chain through the REAL webhook (the harness of
 * `replyClassificationHook.test.ts`): after the classification resolves - and
 * only then - the reply becomes an outcome on its receipt and the subject is
 * decided again under the reply's brands, and the webhook has answered long
 * before either runs. The classifier, the outcome and the re-decision are
 * spies here; their own suites prove what they do.
 */
import crypto from 'crypto';

const calls: string[] = [];
const m = {
  classify: jest.fn(),
  outcome: jest.fn(),
  redecide: jest.fn(),
  envFlags: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: false, journeyExecution: true },
};

jest.mock('../../../config/env', () => ({
  env: {
    mandrillWebhookKey: 'test-webhook-key',
    mandrillWebhookUrl: 'https://enterprise.colaberry.ai/api/webhook/mandrill',
    mandrillInboundDomain: 'reply.colaberry.ai',
    emailFrom: 'ali@colaberry.com',
    get growthJourney() { return m.envFlags; },
  },
}));
jest.mock('../classificationService', () => ({ classifySubject: (...a: unknown[]) => { calls.push('classifySubject'); return m.classify(...a); } }));
jest.mock('../execution/replyOutcome', () => ({ recordReplyOutcome: (...a: unknown[]) => { calls.push('recordReplyOutcome'); return m.outcome(...a); } }));
jest.mock('../execution/replyRedecide', () => ({ redecideOnReply: (...a: unknown[]) => { calls.push('redecideOnReply'); return m.redecide(...a); } }));
jest.mock('../execution/autoReplyGuard', () => ({ journeyAutoReplySkip: jest.fn().mockResolvedValue('open_receipt') }));
// The Ali-outreach check finds a row here too, so the Cory call to Ali is reached: the dialler is a spy, never real.
jest.mock('../../synthflowService', () => ({ triggerVoiceCall: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../workforce/ticketReplyService', () => ({ handleTicketReplyEmail: jest.fn() }));
jest.mock('../../interactionService', () => ({ recordWebhookOutcome: jest.fn() }));
jest.mock('../../explorerGrowth/explorerInboundRouter', () => ({ resolveExplorerReplyRouting: jest.fn(async () => ({ handled: false })) }));
jest.mock('../../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
  InteractionOutcome: { create: jest.fn() },
  CampaignLead: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulation: { findOne: jest.fn().mockResolvedValue(null) },
  CampaignSimulationStep: { findOne: jest.fn() },
  CommunicationLog: { findOne: jest.fn().mockResolvedValue({ campaign_id: 'camp-1' }) },
  Campaign: { findOne: jest.fn().mockResolvedValue(null), findByPk: jest.fn() },
  FollowUpSequence: {},
}));
jest.mock('../../activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../communicationLogService', () => ({ logCommunication: jest.fn().mockResolvedValue(undefined), getLeadComms: jest.fn().mockResolvedValue([]) }));
jest.mock('../../testing/campaignSimulator', () => ({ respondAsLead: jest.fn() }));
jest.mock('../../unsubscribeEnforcementService', () => ({ processOptOut: jest.fn(), detectStopKeyword: () => false }));
jest.mock('../../../models/ScheduledEmail', () => ({ __esModule: true, default: {} }));
jest.mock('../../ghlService', () => ({ addContactNote: jest.fn().mockResolvedValue(undefined), sendSmsViaGhl: jest.fn() }));
jest.mock('../../aiMessageService', () => ({ generateMessage: jest.fn() }));
jest.mock('../../communicationSafetyService', () => ({ checkLeadSendable: jest.fn().mockResolvedValue({ sendable: false, reason: 'test' }) }));

import { Lead } from '../../../models';
import { handleMandrillInbound } from '../../../controllers/mandrillWebhookController';

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
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(() => { calls.push('res.json'); }), send: jest.fn() };
  return { req, res };
}
const flush = async (n = 4) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  calls.length = 0;
  m.classify.mockReset().mockResolvedValue({ status: 'classified' });
  m.outcome.mockReset().mockResolvedValue({ status: 'recorded' });
  m.redecide.mockReset().mockResolvedValue({ status: 'decided', brands: [] });
  m.envFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: false, journeyExecution: true };
  (Lead.findOne as jest.Mock).mockReset().mockResolvedValue(LEAD);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('acceptance 3: after the classification resolves, once, with the reply trigger inputs', () => {
  it('ordering: the webhook answers, the classification resolves, THEN the outcome, THEN the re-decision - each once, carrying the lead, the campaign and the provider id', async () => {
    const classification = deferred<{ status: string }>();
    m.classify.mockReturnValue(classification.promise);
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    await flush();
    // The webhook has answered; the classification is still pending; nothing downstream has run.
    expect(calls).toEqual(['classifySubject', 'res.json']);
    expect(res.status).toHaveBeenCalledWith(200);
    classification.resolve({ status: 'classified' });
    await flush();
    expect(calls).toEqual(['classifySubject', 'res.json', 'recordReplyOutcome', 'redecideOnReply']);
    expect(m.outcome).toHaveBeenCalledTimes(1);
    expect(m.outcome).toHaveBeenCalledWith({ leadId: 501, campaignId: 'camp-1', providerMessageId: '<m-1>', flags: m.envFlags });
    expect(m.redecide).toHaveBeenCalledTimes(1);
    expect(m.redecide).toHaveBeenCalledWith({ leadId: 501, campaignId: 'camp-1', flags: m.envFlags });
  });

  it('timing: a re-decision that never settles does not hold the webhook - 200 is already out', async () => {
    m.redecide.mockReturnValue(new Promise(() => undefined));
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    await flush();
    // With the classification resolving at once the chain interleaves with the controller's own later awaits, which is what
    // fire-and-forget permits; the property is that 200 went out while the re-decision is still pending, each step once.
    expect(calls).toContain('res.json');
    expect(calls.filter((c) => c === 'recordReplyOutcome')).toHaveLength(1);
    expect(calls.filter((c) => c === 'redecideOnReply')).toHaveLength(1);
    expect(m.redecide).toHaveBeenCalledTimes(1);
  });

  it('a classification that rejects: neither the outcome nor the re-decision runs, the failure is one logged line, the webhook still answered 200', async () => {
    m.classify.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    await flush();
    expect(m.outcome).not.toHaveBeenCalled();
    expect(m.redecide).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect((console.error as jest.Mock).mock.calls.map((c) => String(c[0])).some((l) => l.includes('reply_hook_failed'))).toBe(true);
  });

  it('an outcome that rejects (it never should - it catches its own) stops the chain there: no re-decision, one logged line, the webhook unaffected', async () => {
    m.outcome.mockRejectedValue(new Error('outcome boom'));
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    await flush();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(calls).toContain('res.json');
    expect(calls).toContain('recordReplyOutcome');
    expect(calls).not.toContain('redecideOnReply');
    expect((console.error as jest.Mock).mock.calls.map((c) => String(c[0])).some((l) => l.includes('reply_hook_failed'))).toBe(true);
  });

  it('the master off (production today): the classifier is still asked (it answers disabled itself), but neither the outcome nor the re-decision is even required', async () => {
    m.envFlags = { ...m.envFlags, growthJourneyEnabled: false };
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    await flush();
    expect(m.classify.mock.calls[0][0]).toMatchObject({ flags: { growthJourneyEnabled: false } });
    expect(m.outcome).not.toHaveBeenCalled();
    expect(m.redecide).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('the master on with the capability flags off: both steps are handed the flags and answer disabled themselves (their own gates, their own suites)', async () => {
    m.envFlags = { ...m.envFlags, journeyDecisions: false, journeyExecution: false };
    const { req, res } = mandrillReq('Yes, tell me more');
    await handleMandrillInbound(req, res);
    await flush();
    expect(m.outcome.mock.calls[0][0]).toMatchObject({ flags: { growthJourneyEnabled: true, journeyExecution: false } });
    expect(m.redecide.mock.calls[0][0]).toMatchObject({ flags: { growthJourneyEnabled: true, journeyDecisions: false } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
