/**
 * T602 (Growth Journey Phase 6, the hardening set) — the global kill switch at
 * the send chokepoint, from the send path's side.
 *
 * Three properties, in order of weight:
 *
 *   1. CONTROL. With the switch off, six decisions that exercise every step of
 *      the pipeline deep-equal what the pipeline answered before this step
 *      existed (the same six the T511 suite pins), and the switch is read
 *      exactly once per evaluation, ahead of every other read.
 *   2. CONTROL. A switch that cannot be read - the settings read throws for
 *      that key alone - answers the same six decisions. That is the LENIENT
 *      reader's property; the strict reader would throw out of evaluateSend.
 *   3. ON blocks all six by name, `kill_switch`, before the campaign, the lead,
 *      the consent, the brand preference or the recipient are ever read.
 *
 * `launchSafety` is NOT mocked: the reader under test is the real one, so the
 * lenient/strict difference is observable through the settings read alone.
 */
const mockLeadFindByPk = jest.fn();
const mockCampaignFindByPk = jest.fn();
const mockCommLogCount = jest.fn();
const mockUnsubFindOne = jest.fn();
const mockUnsubFindAll = jest.fn();
const mockGetTestOverrides = jest.fn();
const mockGetSetting = jest.fn();
const mockConsent = jest.fn();
const mockBrandPref = jest.fn();

jest.mock('../../models', () => ({
  Lead: { findByPk: (...a: unknown[]) => mockLeadFindByPk(...a) },
  Campaign: { findByPk: (...a: unknown[]) => mockCampaignFindByPk(...a) },
  CommunicationLog: { count: (...a: unknown[]) => mockCommLogCount(...a) },
  UnsubscribeEvent: { findOne: (...a: unknown[]) => mockUnsubFindOne(...a), findAll: (...a: unknown[]) => mockUnsubFindAll(...a) },
  GrowthJourneyExecution: { findOne: jest.fn() },
}));
jest.mock('../settingsService', () => ({ getTestOverrides: (...a: unknown[]) => mockGetTestOverrides(...a), getSetting: (...a: unknown[]) => mockGetSetting(...a), setSetting: jest.fn() }));
jest.mock('../consentService', () => ({ assertConsentForSend: (...a: unknown[]) => mockConsent(...a) }));
jest.mock('../../modules/communications/brandPreferenceGate', () => ({ checkBrandPreference: (...a: unknown[]) => mockBrandPref(...a) }));
jest.mock('../aiEventService', () => ({ logAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(), update: jest.fn() } }));
jest.mock('../../models/SystemSetting', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));

import { clearTestOverrideCache, evaluateSend, type SendDecision, type SendRequest } from '../communicationSafetyService';

const KEY = 'system_kill_switch';
const LIVE: SendDecision = { allowed: true, redirect: null, testMode: false, deliveryMode: 'live' };
const BLOCKED = (reason: string): SendDecision => ({ allowed: false, redirect: null, testMode: false, blockedReason: reason, deliveryMode: 'blocked' });
const campaign = (over: Record<string, unknown> = {}) => ({ id: 'c1', status: 'active', settings: {}, ...over });
const REQ: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };

/** The settings read, keyed: the switch answers `sw`, every other key answers its own value. */
function settings(sw: unknown, others: Record<string, unknown> = {}): void {
  mockGetSetting.mockImplementation(async (key: string) => {
    if (key === KEY) {
      if (sw instanceof Error) throw sw;
      return sw;
    }
    return others[key] ?? null;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearTestOverrideCache();
  settings(null);
  mockGetTestOverrides.mockResolvedValue({ enabled: false, email: '', phone: '' });
  mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'new', source: 'manual' });
  mockCampaignFindByPk.mockResolvedValue(campaign());
  mockCommLogCount.mockResolvedValue(0);
  mockUnsubFindOne.mockResolvedValue(null);
  mockUnsubFindAll.mockResolvedValue([]);
  mockConsent.mockResolvedValue({ mode: 'shadow', enforced: false, verdict: 'allow', reason: 'granted', basis: 'opt_in_form' });
  mockBrandPref.mockResolvedValue({ allowed: true });
});

/** The six pre-change decisions (the T511 suite's own list), each arranged from a clean world. */
const SIX: Array<[string, (sw: unknown) => void, SendRequest, SendDecision]> = [
  ['a live send', (sw) => settings(sw), REQ, LIVE],
  ['a paused scheduler', (sw) => settings(sw, { scheduler_paused: 'true' }), REQ, BLOCKED('scheduler_paused')],
  ['an inactive campaign', (sw) => { settings(sw); mockCampaignFindByPk.mockResolvedValue(campaign({ status: 'paused' })); }, REQ, BLOCKED('campaign_paused')],
  ['an unsubscribed lead', (sw) => { settings(sw); mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'unsubscribed', source: 'manual' }); }, REQ, BLOCKED('lead_unsubscribed')],
  ['a brand preference block', (sw) => { settings(sw); mockBrandPref.mockResolvedValue({ allowed: false, reason: 'channel_paused' }); }, REQ, BLOCKED('brand_channel_paused')],
  ['no campaign at all (a webhook auto-reply)', (sw) => settings(sw), { leadId: 1, channel: 'email' }, LIVE],
];

describe('control: with the switch off, every decision is the pipeline\'s', () => {
  it.each(SIX)('%s', async (_label, arrange, req, expected) => {
    arrange(false);
    expect(await evaluateSend(req)).toEqual(expected);
    expect(mockGetSetting.mock.calls[0]).toEqual([KEY]);
    expect(mockGetSetting.mock.calls.filter(([k]) => k === KEY)).toHaveLength(1);
  });

  it('an absent row (the read answers null) is off, exactly as production read it before the row was seeded', async () => {
    settings(null);
    expect(await evaluateSend(REQ)).toEqual(LIVE);
  });
});

describe('control: a switch that cannot be read is off - the decision is unchanged, nothing throws', () => {
  it.each(SIX)('%s', async (_label, arrange, req, expected) => {
    arrange(new Error('connection reset'));
    await expect(evaluateSend(req)).resolves.toEqual(expected);
    expect(mockGetSetting.mock.calls[0]).toEqual([KEY]);
  });
});

describe('the switch ON blocks every send by name, before anything else is read', () => {
  it.each(SIX)('%s', async (_label, arrange, req) => {
    arrange(true);
    expect(await evaluateSend(req)).toEqual(BLOCKED('kill_switch'));
    expect(mockGetSetting).toHaveBeenCalledTimes(1);
    expect(mockCampaignFindByPk).not.toHaveBeenCalled();
    expect(mockLeadFindByPk).not.toHaveBeenCalled();
    expect(mockConsent).not.toHaveBeenCalled();
    expect(mockBrandPref).not.toHaveBeenCalled();
    expect(mockGetTestOverrides).not.toHaveBeenCalled();
  });

  it('the string form the settings table has historically held ("true") is ON too', async () => {
    settings('true');
    expect(await evaluateSend(REQ)).toEqual(BLOCKED('kill_switch'));
  });

  it('any other value - "false", 0, "on" - is off', async () => {
    for (const v of ['false', 0, 'on', 'TRUE', {}]) {
      settings(v);
      expect(await evaluateSend(REQ)).toEqual(LIVE);
    }
  });
});
