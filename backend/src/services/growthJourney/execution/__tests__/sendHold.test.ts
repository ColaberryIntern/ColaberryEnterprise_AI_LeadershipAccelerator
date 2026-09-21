const m = { killSwitch: jest.fn() };
jest.mock('../../../../models', () => require('../../__tests__/fixtures/phase5Tables').phase5ModelsMock);
jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => m.killSwitch(...a) }));

import { AS_OF_4 } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { ALI_OUTREACH_CAMPAIGN_KEY, FLOW_CAMPAIGN_KEYS } from '../campaignKeys';
import { checkJourneyHold } from '../sendHold';
import { pauseScopeKey, rolloutScopeKey } from '../scopeKey';

/**
 * T511 — the send-time hold over T503's tables and T504's real hold resolver.
 * The flags come from the process (the sanctioned resolvers); the suite sets
 * them explicitly per case and restores them.
 */

const TENANT = 't-col';
const BRAND = 'b-ent';
const PROGRAM = 'p-ent';
const LEAD = 501;
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const ENV_ON: Record<string, string> = {
  GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_DECISIONS_ENABLED: 'true', GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
  EXPLORER_GROWTH_OS_ENABLED: 'true', EXPLORER_ALI_OUTREACH_ENABLED: 'true', EXPLORER_IN_APP_NUDGE_ENABLED: 'true',
};
const saved: Record<string, string | undefined> = {};

const receipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: `d-${Math.random()}`, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: BIZ_FLOW, sequence_id: 's-flow',
  mode: 'limited', status: 'enrolled', status_reason: 'enrolled', control_ids: [], created_at: AS_OF_4, ...over,
});
const pause = (scope: Parameters<typeof pauseScopeKey>[0]) => T5.controls.insert({
  tenant_id: TENANT, kind: 'pause', scope_key: pauseScopeKey(scope), brand_id: scope.brandId ?? null, program_id: scope.programId ?? null,
  channel: scope.channel ?? null, subject_ref: scope.subjectRef ?? null, mode: 'off', cohort_lead_ids: null, daily_limit: null, cleared_at: null,
});
const hold = (over: Partial<Parameters<typeof checkJourneyHold>[0]> = {}) => checkJourneyHold({ leadId: LEAD, campaignId: 'c-flow', campaignKey: BIZ_FLOW, asOf: AS_OF_4, ...over });

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const [k, v] of Object.entries(ENV_ON)) { saved[k] = process.env[k]; process.env[k] = v; }
});
afterAll(() => {
  jest.restoreAllMocks();
  for (const k of Object.keys(ENV_ON)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});
beforeEach(() => {
  resetPhase5Tables();
  m.killSwitch.mockReset().mockResolvedValue(false);
  (console.error as jest.Mock).mockClear();
});

describe('who the key belongs to decides what an error means', () => {
  it('an unregistered key is never held - and reads nothing', async () => {
    const findOne = jest.spyOn(T5.executions, 'findOne').mockClear();
    expect(await hold({ campaignKey: 'explorer_nothing_like_this' })).toEqual({ held: false, reason: null });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('acceptance 4: a registered key with no open receipt is not held (a manual enrolment is not the journey\'s to stop); a closed receipt, another lead in the campaign, this lead in another campaign do not count', async () => {
    expect(await hold()).toEqual({ held: false, reason: null });
    receipt({ status: 'completed' });
    receipt({ status: 'cancelled', decision_id: 'd-x' });
    expect(await hold()).toEqual({ held: false, reason: null });
    // A closed receipt is not the journey's in-flight work: with the kill switch ON, closed receipts alone still hold nothing.
    m.killSwitch.mockResolvedValue(true);
    expect(await hold()).toEqual({ held: false, reason: null });
    // The read is THIS lead's receipt for THIS campaign: another lead's open receipt in the same campaign, and this lead's
    // open receipt in another brand's registered campaign, hold nothing here (T511 verifier's V4/V6, pinned after the fact).
    receipt({ lead_id: LEAD + 1, subject_ref: `lead:${LEAD + 1}`, status: 'enrolled', decision_id: 'd-other-lead' });
    receipt({ brand_id: 'b-other', campaign_id: 'c-other', campaign_key: FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions, status: 'enrolled', decision_id: 'd-other-campaign' });
    expect(await hold()).toEqual({ held: false, reason: null });
    receipt({ status: 'in_progress', decision_id: 'd-open' });
    expect(await hold()).toEqual({ held: true, reason: 'journey_hold:kill_switch' });
  });

  it('acceptance 3: a journey-owned key with a receipt-read error -> journey_hold_unavailable, a block, logged with the class', async () => {
    jest.spyOn(T5.executions, 'findOne').mockRejectedValueOnce(new Error('connection reset'));
    expect(await hold()).toEqual({ held: true, reason: 'journey_hold_unavailable' });
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('journey_hold_unavailable') && l.includes('"ownership":"journey"'))).toBe(true);
  });

  it('acceptance 3b: the Ali campaign\'s ordinary send (a shared key, no receipt) is not held - normally, and under a receipt-read error (logged journey_hold_lookup_failed)', async () => {
    expect(await hold({ campaignId: 'c-ali', campaignKey: ALI_OUTREACH_CAMPAIGN_KEY })).toEqual({ held: false, reason: null });
    jest.spyOn(T5.executions, 'findOne').mockRejectedValueOnce(new Error('connection reset'));
    expect(await hold({ campaignId: 'c-ali', campaignKey: ALI_OUTREACH_CAMPAIGN_KEY })).toEqual({ held: false, reason: null });
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('journey_hold_lookup_failed') && l.includes('"ownership":"shared"'))).toBe(true);
  });

  it('acceptance 3c: an Ali JOURNEY send (a shared key, an open receipt) blocks on a resolver that cannot answer - the shared key too: an unreadable kill switch is the ladder holding by name, a pause read that throws is journey_hold_unavailable', async () => {
    receipt({ campaign_id: 'c-ali', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY, channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', mode: 'review' });
    // The ladder reads the switch strictly and treats an unreadable one as ON: a block, named.
    m.killSwitch.mockRejectedValue(new Error('settings gone'));
    expect(await hold({ campaignId: 'c-ali', campaignKey: ALI_OUTREACH_CAMPAIGN_KEY })).toEqual({ held: true, reason: 'journey_hold:kill_switch_unreadable' });
    // A resolver that THROWS (the pause read fails) is the hold's own failure: a block, for the shared key too.
    m.killSwitch.mockResolvedValue(false);
    jest.spyOn(T5.controls, 'findAll').mockRejectedValueOnce(new Error('connection reset'));
    expect(await hold({ campaignId: 'c-ali', campaignKey: ALI_OUTREACH_CAMPAIGN_KEY })).toEqual({ held: true, reason: 'journey_hold_unavailable' });
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('journey_hold_unavailable') && l.includes('"ownership":"shared"') && l.includes('execution_id'))).toBe(true);
  });
});

describe('acceptance 5: Scenario K at send time - the kill switch and each pause scope set AFTER enrolment', () => {
  const cases: Array<[string, () => unknown, string]> = [
    ['the kill switch', () => m.killSwitch.mockResolvedValue(true), 'journey_hold:kill_switch'],
    ['a brand pause', () => pause({ brandId: BRAND }), 'journey_hold:pause:brand'],
    ['a programme pause', () => pause({ brandId: BRAND, programId: PROGRAM }), 'journey_hold:pause:brand+programme'],
    ['a channel pause', () => pause({ brandId: BRAND, channel: 'email' }), 'journey_hold:pause:brand+channel'],
    ['a subject pause', () => pause({ brandId: BRAND, subjectRef: `lead:${LEAD}` }), 'journey_hold:pause:brand+subject'],
  ];
  it.each(cases)('an email receipt: %s -> held', async (_label, arrange, reason) => {
    receipt();
    arrange();
    expect(await hold()).toEqual({ held: true, reason });
  });
  it.each([
    ['the kill switch', () => m.killSwitch.mockResolvedValue(true), 'journey_hold:kill_switch'],
    ['a channel pause on ali_outreach', () => pause({ brandId: BRAND, channel: 'ali_outreach' }), 'journey_hold:pause:brand+channel'],
    ['a subject pause', () => pause({ brandId: BRAND, subjectRef: `lead:${LEAD}` }), 'journey_hold:pause:brand+subject'],
  ])('an Ali receipt: %s -> held', async (_label, arrange, reason) => {
    receipt({ campaign_id: 'c-ali', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY, channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', mode: 'review' });
    arrange();
    expect(await hold({ campaignId: 'c-ali', campaignKey: ALI_OUTREACH_CAMPAIGN_KEY })).toEqual({ held: true, reason });
  });

  it('the flags: the execution flag off after enrolment holds (a deliberate stop); a pause on ANOTHER brand or channel does not', async () => {
    receipt();
    pause({ brandId: 'b-other' });
    pause({ brandId: BRAND, channel: 'in_app' });
    expect(await hold()).toEqual({ held: false, reason: null });
    process.env.GROWTH_JOURNEY_EXECUTION_ENABLED = 'false';
    try {
      expect(await hold()).toEqual({ held: true, reason: 'journey_hold:flag_execution_off' });
    } finally {
      process.env.GROWTH_JOURNEY_EXECUTION_ENABLED = 'true';
    }
  });
});

describe('acceptance 6: what governs the NEXT plan does not stop work in flight', () => {
  it('a cleared rollout, a lead outside the cohort, or a reached daily limit -> not held', async () => {
    receipt();
    // No rollout at all (cleared): the planner would refuse a new plan; the send in flight continues.
    expect(await hold()).toEqual({ held: false, reason: null });
    // A limited rollout whose cohort excludes this lead, with the day's limit already spent.
    T5.controls.insert({ tenant_id: TENANT, kind: 'rollout', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'email' }), brand_id: BRAND, program_id: PROGRAM, channel: 'email', subject_ref: null, mode: 'limited', cohort_lead_ids: [LEAD + 1], daily_limit: 1, cleared_at: null });
    receipt({ lead_id: LEAD + 1, subject_ref: `lead:${LEAD + 1}`, status: 'completed' });
    expect(await hold()).toEqual({ held: false, reason: null });
  });
});
