import express from 'express';
import request from 'supertest';

/**
 * CP10.3 (kit F8): opens and clicks on an employer's follow-up, through the REAL Mandrill webhook controller and the
 * real followUpTracking.ts. The store's recordEngagement is an in-memory stand-in for its one SQL statement (that runs
 * on Postgres in followUpStore.integration.test.ts): an event key counts once, only for a follow-up that was sent.
 */
jest.mock('../../models', () => ({
  Lead: { update: jest.fn(), findByPk: jest.fn() }, InteractionOutcome: {}, CampaignLead: { update: jest.fn() }, CampaignSimulation: { findOne: jest.fn() },
  CampaignSimulationStep: { findOne: jest.fn() }, CommunicationLog: { create: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../models/ScheduledEmail', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
const mockOutcome = jest.fn();
jest.mock('../../services/interactionService', () => ({ recordWebhookOutcome: (...a: unknown[]) => mockOutcome(...a) }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({ processOptOut: jest.fn() }));
jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn() }));

const FU = 'f0000000-0000-4000-8000-000000000001';
const UNSENT = 'f0000000-0000-4000-8000-000000000002';
type Fu = { sent: boolean; link: string; opens: number; clicks: Record<string, number>; status: string };
const mockFu = new Map<string, Fu>();
const mockKeys = new Set<string>();
const mockStore = { calls: [] as unknown[][], fail: false };
jest.mock('../../services/placement/followUpStore', () => ({
  recordEngagement: async (key: string, id: string, kind: 'open' | 'click', url: string) => {
    mockStore.calls.push([key, id, kind, url]);
    if (mockStore.fail) throw Object.assign(new Error('db'), { name: 'SequelizeConnectionError' });
    const f = mockFu.get(id);
    if (!f || !f.sent || mockKeys.has(key)) return false;
    mockKeys.add(key);
    if (kind === 'open') { f.opens += 1; if (f.status === 'sent') f.status = 'opened'; } else {
      const k = url === f.link ? 'link' : 'other';
      f.clicks[k] = (f.clicks[k] ?? 0) + 1;
      if (f.status === 'sent' || f.status === 'opened') f.status = 'clicked';
    }
    return true;
  },
}));

let app: express.Express;
beforeAll(async () => {
  app = express();
  app.use(express.urlencoded({ extended: true }));
  const mod = await import('../mandrillWebhookController');
  app.post('/webhook', mod.handleMandrillWebhook);
}, 60_000);

const ev = (event: string, over: Record<string, unknown> = {}, metadata: Record<string, unknown> = { follow_up_id: FU }) => ({
  event, _id: 'mandrill-msg-1', ts: 1795447800, ip: '203.0.113.9', user_agent: 'Mail/1.0', location: { city: 'Dallas' },
  msg: { _id: 'mandrill-msg-1', email: 'ann@learner.example', metadata }, ...over });
const post = (events: unknown[]) => request(app).post('/webhook').type('form').send({ mandrill_events: JSON.stringify(events) });

beforeEach(() => {
  mockFu.clear(); mockKeys.clear(); mockStore.calls = []; mockStore.fail = false; mockOutcome.mockReset();
  mockFu.set(FU, { sent: true, link: 'https://cal.example/dana', opens: 0, clicks: {}, status: 'sent' });
  mockFu.set(UNSENT, { sent: false, link: '', opens: 0, clicks: {}, status: 'scheduled' });
  delete process.env.MANDRILL_WEBHOOK_KEY;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('Mandrill open and click events for an employer follow-up', () => {
  it('an open event for the message: opens + 1 and status Opened', async () => {
    expect((await post([ev('open')])).status).toBe(200);
    expect(mockFu.get(FU)).toMatchObject({ opens: 1, status: 'opened' });
  });
  it('the same event delivered twice counts once; a later open (new time) counts again', async () => {
    await post([ev('open'), ev('open')]);
    await post([ev('open')]);
    expect(mockFu.get(FU)?.opens).toBe(1);
    await post([ev('open', { ts: 1795447900 })]);
    expect(mockFu.get(FU)?.opens).toBe(2);
  });
  it('a click on the message\'s link counts under "link", any other url under "other"; status Clicked', async () => {
    await post([ev('click', { url: 'https://cal.example/dana' }), ev('click', { url: 'https://elsewhere.example/x', ts: 1795447801 })]);
    expect(mockFu.get(FU)).toMatchObject({ clicks: { link: 1, other: 1 }, status: 'clicked' });
  });
  it('keeps nothing about the reader: the store gets the event key, id, kind and url only', async () => {
    await post([ev('click', { url: 'https://cal.example/dana' })]);
    const [key, id, kind, url] = mockStore.calls[0] as string[];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect([id, kind, url]).toEqual([FU, 'click', 'https://cal.example/dana']);
    expect(JSON.stringify(mockStore.calls)).not.toMatch(/203\.0\.113\.9|Mail\/1\.0|Dallas|ann@learner/);
  });
  it('a follow-up that was never sent, or a malformed id, is not counted', async () => {
    await post([ev('open', {}, { follow_up_id: UNSENT }), ev('open', {}, { follow_up_id: 'not-a-uuid' })]);
    expect(mockFu.get(UNSENT)?.opens).toBe(0);
    expect(mockStore.calls).toHaveLength(1);
  });
  it('a campaign email (scheduled_email_id) keeps its own path and never reaches the follow-ups', async () => {
    mockOutcome.mockResolvedValue(undefined);
    await post([ev('open', {}, { scheduled_email_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })]);
    expect(mockOutcome).toHaveBeenCalledTimes(1);
    expect(mockStore.calls).toHaveLength(0);
  });
  it('a database error is logged with its class and the webhook still answers 200', async () => {
    mockStore.fail = true;
    expect((await post([ev('open')])).status).toBe(200);
    expect((console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n')).toContain('"error_class":"SequelizeConnectionError"');
  });
  it('bounces and other events are not engagement', async () => {
    await post([ev('hard_bounce'), ev('send')]);
    expect(mockStore.calls).toHaveLength(0);
  });
});
