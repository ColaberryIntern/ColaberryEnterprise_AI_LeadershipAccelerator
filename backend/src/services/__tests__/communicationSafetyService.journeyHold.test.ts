/**
 * T511 — the send-time journey hold in evaluateSend, from the send path's side.
 *
 * The property that matters most: for every campaign in production today (no
 * registered key) the step is an in-memory check and nothing else - the
 * `sendHold` module is never required, the receipt table is never queried, the
 * decision is byte-for-byte the pipeline's. `jest.isolateModules` gives each
 * case a fresh module registry so "never required" is provable per case.
 */
const mockLeadFindByPk = jest.fn();
const mockCampaignFindByPk = jest.fn();
const mockCommLogCount = jest.fn();
const mockUnsubFindOne = jest.fn();
const mockUnsubFindAll = jest.fn();
const mockExecutionFindOne = jest.fn();
const mockGetTestOverrides = jest.fn();
const mockGetSetting = jest.fn();
const mockConsent = jest.fn();
const mockBrandPref = jest.fn();
const mockHold = jest.fn();
const mockSendHoldFactory = jest.fn();

jest.mock('../../models', () => ({
  Lead: { findByPk: (...a: unknown[]) => mockLeadFindByPk(...a) },
  Campaign: { findByPk: (...a: unknown[]) => mockCampaignFindByPk(...a) },
  CommunicationLog: { count: (...a: unknown[]) => mockCommLogCount(...a) },
  UnsubscribeEvent: { findOne: (...a: unknown[]) => mockUnsubFindOne(...a), findAll: (...a: unknown[]) => mockUnsubFindAll(...a) },
  GrowthJourneyExecution: { findOne: (...a: unknown[]) => mockExecutionFindOne(...a) },
}));
jest.mock('../settingsService', () => ({ getTestOverrides: (...a: unknown[]) => mockGetTestOverrides(...a), getSetting: (...a: unknown[]) => mockGetSetting(...a) }));
jest.mock('../consentService', () => ({ assertConsentForSend: (...a: unknown[]) => mockConsent(...a) }));
jest.mock('../../modules/communications/brandPreferenceGate', () => ({ checkBrandPreference: (...a: unknown[]) => mockBrandPref(...a) }));
jest.mock('../growthJourney/execution/sendHold', () => {
  mockSendHoldFactory();
  return { checkJourneyHold: (...a: unknown[]) => mockHold(...a) };
});

import * as fs from 'fs';
import * as path from 'path';
import type { SendDecision, SendRequest } from '../communicationSafetyService';
import { ALI_OUTREACH_CAMPAIGN_KEY, FLOW_CAMPAIGN_KEYS } from '../growthJourney/execution/campaignKeys';

type Svc = typeof import('../communicationSafetyService');
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const LIVE: SendDecision = { allowed: true, redirect: null, testMode: false, deliveryMode: 'live' };
const BLOCKED = (reason: string): SendDecision => ({ allowed: false, redirect: null, testMode: false, blockedReason: reason, deliveryMode: 'blocked' });

/** A fresh module registry per call: the lazy require inside evaluateSend is observable per case. */
async function evaluate(req: SendRequest): Promise<SendDecision> {
  let svc: Svc | undefined;
  jest.isolateModules(() => { svc = require('../communicationSafetyService') as Svc; });
  svc!.clearTestOverrideCache();
  return svc!.evaluateSend(req);
}
const campaign = (over: Record<string, unknown> = {}) => ({ id: 'c1', status: 'active', settings: {}, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTestOverrides.mockResolvedValue({ enabled: false, email: '', phone: '' });
  mockGetSetting.mockResolvedValue(null);
  mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'new', source: 'manual', email: 'x@example.com' });
  mockCampaignFindByPk.mockResolvedValue(campaign());
  mockCommLogCount.mockResolvedValue(0);
  mockUnsubFindOne.mockResolvedValue(null);
  mockUnsubFindAll.mockResolvedValue([]);
  mockConsent.mockResolvedValue({ mode: 'shadow', enforced: false, verdict: 'allow', reason: 'granted', basis: 'opt_in_form' });
  mockBrandPref.mockResolvedValue({ allowed: true });
  mockHold.mockResolvedValue({ held: false, reason: null });
});

describe('acceptance 1: every campaign in production today - no registered key - is untouched', () => {
  const cases: Array<[string, () => void, SendRequest, SendDecision]> = [
    ['a live send', () => undefined, { leadId: 1, channel: 'email', campaignId: 'c1' }, LIVE],
    ['a paused scheduler', () => mockGetSetting.mockResolvedValue('true'), { leadId: 1, channel: 'email', campaignId: 'c1' }, BLOCKED('scheduler_paused')],
    ['an inactive campaign', () => mockCampaignFindByPk.mockResolvedValue(campaign({ status: 'paused' })), { leadId: 1, channel: 'email', campaignId: 'c1' }, BLOCKED('campaign_paused')],
    ['an unsubscribed lead', () => mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'unsubscribed', source: 'manual' }), { leadId: 1, channel: 'email', campaignId: 'c1' }, BLOCKED('lead_unsubscribed')],
    ['a brand preference block', () => mockBrandPref.mockResolvedValue({ allowed: false, reason: 'channel_paused' }), { leadId: 1, channel: 'email', campaignId: 'c1' }, BLOCKED('brand_channel_paused')],
    ['no campaign at all (a webhook auto-reply)', () => undefined, { leadId: 1, channel: 'email' }, LIVE],
  ];
  it.each(cases)('%s: the decision is the pipeline\'s, the sendHold module is never required, the receipt table never queried', async (_label, arrange, req, expected) => {
    arrange();
    const decision = await evaluate(req);
    expect(decision).toEqual(expected);
    expect(mockSendHoldFactory).not.toHaveBeenCalled();
    expect(mockHold).not.toHaveBeenCalled();
    expect(mockExecutionFindOne).not.toHaveBeenCalled();
  });

  it('a campaign with SOME key that is not registered is equally untouched', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ settings: { campaign_key: 'explorer_something_else_entirely' } }));
    const decision = await evaluate({ leadId: 1, channel: 'email', campaignId: 'c1' });
    expect(decision.allowed).toBe(true);
    expect(mockSendHoldFactory).not.toHaveBeenCalled();
  });

  it('acceptance 2: a campaign read error on a non-journey campaign is today\'s campaign_check_failed, and nothing journey-side is touched', async () => {
    mockCampaignFindByPk.mockRejectedValue(new Error('connection reset'));
    expect(await evaluate({ leadId: 1, channel: 'email', campaignId: 'c1' })).toEqual(BLOCKED('campaign_check_failed'));
    expect(mockSendHoldFactory).not.toHaveBeenCalled();
    expect(mockExecutionFindOne).not.toHaveBeenCalled();
  });

  it('the campaign read widened by one attribute only: settings rides the read that already happens', async () => {
    await evaluate({ leadId: 1, channel: 'email', campaignId: 'c1' });
    expect(mockCampaignFindByPk).toHaveBeenCalledTimes(1);
    expect(mockCampaignFindByPk).toHaveBeenCalledWith('c1', { attributes: ['id', 'status', 'settings'] });
  });
});

describe('a registered key reaches the hold - and only then', () => {
  it('a journey key: the hold is asked with the lead, the campaign and the key; held -> the hold\'s reason is the block', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ id: 'c-flow', settings: { campaign_key: BIZ_FLOW } }));
    mockHold.mockResolvedValue({ held: true, reason: 'journey_hold:pause:brand+channel' });
    expect(await evaluate({ leadId: 501, channel: 'email', campaignId: 'c-flow' })).toEqual(BLOCKED('journey_hold:pause:brand+channel'));
    expect(mockSendHoldFactory).toHaveBeenCalledTimes(1);
    expect(mockHold).toHaveBeenCalledWith({ leadId: 501, campaignId: 'c-flow', campaignKey: BIZ_FLOW });
  });

  it('not held -> the pipeline continues to recipient resolution exactly as before', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ id: 'c-flow', settings: { campaign_key: BIZ_FLOW } }));
    const decision = await evaluate({ leadId: 501, channel: 'email', campaignId: 'c-flow' });
    expect(decision).toEqual(LIVE);
    expect(mockHold).toHaveBeenCalledTimes(1);
  });

  it('the Ali campaign (a shared key) is asked too - the hold module decides what an error means, this step does not', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ id: 'c-ali', settings: { campaign_key: ALI_OUTREACH_CAMPAIGN_KEY } }));
    mockHold.mockResolvedValue({ held: true, reason: 'journey_hold_unavailable' });
    expect(await evaluate({ leadId: 501, channel: 'email', campaignId: 'c-ali' })).toEqual(BLOCKED('journey_hold_unavailable'));
    expect(mockHold).toHaveBeenCalledWith({ leadId: 501, campaignId: 'c-ali', campaignKey: ALI_OUTREACH_CAMPAIGN_KEY });
  });

  it('ordering: after the brand gate (a brand block never consults the hold) and before recipient resolution (a hold never reads the test overrides)', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ id: 'c-flow', settings: { campaign_key: BIZ_FLOW } }));
    mockBrandPref.mockResolvedValue({ allowed: false, reason: 'channel_paused' });
    expect(await evaluate({ leadId: 501, channel: 'email', campaignId: 'c-flow' })).toEqual(BLOCKED('brand_channel_paused'));
    expect(mockHold).not.toHaveBeenCalled();

    mockBrandPref.mockResolvedValue({ allowed: true });
    mockHold.mockResolvedValue({ held: true, reason: 'journey_hold:kill_switch' });
    mockGetTestOverrides.mockClear();
    expect(await evaluate({ leadId: 501, channel: 'email', campaignId: 'c-flow' })).toEqual(BLOCKED('journey_hold:kill_switch'));
    expect(mockGetTestOverrides).not.toHaveBeenCalled();
  });

  it('a simulation send through a registered campaign is still asked (the hold is about the campaign, not the address)', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ id: 'c-flow', settings: { campaign_key: BIZ_FLOW } }));
    mockHold.mockResolvedValue({ held: true, reason: 'journey_hold:kill_switch' });
    expect(await evaluate({ leadId: 501, channel: 'email', campaignId: 'c-flow', simulationId: 'sim-1' })).toEqual(BLOCKED('journey_hold:kill_switch'));
  });
});

describe('acceptance 7: the file stays small, and the journey tree is not a static import', () => {
  it('communicationSafetyService.ts is under 410 lines and imports only the registry from the journey tree', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'communicationSafetyService.ts'), 'utf8');
    expect(src.split(/\r?\n/).length).toBeLessThan(410);
    const journeyImports = Array.from(src.matchAll(/^import .* from '([^']*growthJourney[^']*)';/gm)).map((m) => m[1]);
    expect(journeyImports).toEqual(['./growthJourney/execution/campaignKeys']);
    expect(src).toContain("require('./growthJourney/execution/sendHold')");
  });
});
