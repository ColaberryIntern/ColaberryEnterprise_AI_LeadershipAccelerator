const m = {
  enrol: jest.fn(),
  enrolCampaign: jest.fn(),
  decisionFindOne: jest.fn(),
  leadFindByPk: jest.fn(),
  campaignFindOne: jest.fn(),
  sequenceFindByPk: jest.fn(),
  profileFindOne: jest.fn(),
  campaignLeadCount: jest.fn(),
  lastAliOutreach: jest.fn(),
  contactEvidence: jest.fn(),
  killSwitch: jest.fn(),
  ledger: jest.fn(),
};
jest.mock('../../../../models', () => {
  const { phase5ModelsMock } = require('../../__tests__/fixtures/phase5Tables');
  const { Table } = require('../../__tests__/fixtures/phase4Tables');
  const scheduled = new Table('scheduled_emails', 'se');
  return {
    ...phase5ModelsMock,
    ScheduledEmail: scheduled,
    BrandDomain: { findAll: jest.fn().mockResolvedValue([]) },
    GrowthJourneyDecision: { findOne: (...a: unknown[]) => m.decisionFindOne(...a) },
    Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
    Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) },
    FollowUpSequence: { findByPk: (...a: unknown[]) => m.sequenceFindByPk(...a) },
    ExplorerJourneyProfile: { findOne: (...a: unknown[]) => m.profileFindOne(...a) },
    CampaignLead: { count: (...a: unknown[]) => m.campaignLeadCount(...a) },
    CommunicationLog: { findOne: (...a: unknown[]) => m.lastAliOutreach(...a) },
    __tables: { scheduled },
  };
});
jest.mock('../../../sequenceService', () => ({ enrollLeadInSequence: (...a: unknown[]) => m.enrol(...a) }));
jest.mock('../../../campaignService', () => ({ enrollLeadsInCampaign: (...a: unknown[]) => m.enrolCampaign(...a) }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => m.killSwitch(...a) }));
jest.mock('../../governor/contactEvidence', () => ({ resolveContactEvidence: (...a: unknown[]) => m.contactEvidence(...a) }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn() } }));

import { Op } from 'sequelize';
import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import * as models from '../../../../models';
import { ALI_COOLDOWN_DAYS, ALI_DAILY_CAP, evaluateAliOutreachEligibility } from '../../../explorerGrowth/explorerAliOutreachService';
import { AS_OF_4, type Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { contact } from '../../__tests__/fixtures/learnerFixtures';
import { aliRefusalCode, buildAliOutreachContext } from '../aliOutreachContext';
import { ALI_OUTREACH_CAMPAIGN_KEY } from '../campaignKeys';
import { executeApproved } from '../enrollmentAdapter';

/**
 * T516 - the adapter's ali_outreach branch: REVIEW-only, the Explorer
 * programme's own eligibility built from stored rows, Ali's campaign enrolled
 * through the campaign service exactly once. The enrol call is the spy; the
 * profile, the outreach marker, the day's count and the campaign row are the
 * injected boundary. Nothing here reaches a real campaign.
 */

const tables = (models as unknown as { __tables: { scheduled: Table } }).__tables;
const TENANT = 't-col';
const BRAND = 'b-ent';
const PROGRAM = 'p-ent';
const LEAD = 516;
const ENR = 'enr-516';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over,
});
const explorerFlags = (over: Partial<ExplorerGrowthFlags> = {}): ExplorerGrowthFlags => ({
  growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false,
  aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false, ...over,
} as ExplorerGrowthFlags);

const decisionRow = () => {
  const row: Record<string, unknown> = {
    id: 'd-ali', tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: ENR, mode: 'live',
    selected_action: 'SEND_ALI_OUTREACH', selected_channel: 'email', selected_content: { assets: [] }, candidates: [{ action_type: 'SEND_ALI_OUTREACH', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY }], suppressed: [], deferred_actions: [],
    reason: 'r', created_at: new Date(AS_OF_4.getTime() - HOUR),
  };
  return { get: (k: string) => row[k] };
};
const aliCampaign = (over: Record<string, unknown> = {}) => ({ id: 'c-ali', tenant_id: TENANT, brand_id: BRAND, status: 'active', approval_status: 'approved', sequence_id: 's-ali', settings: { campaign_key: ALI_OUTREACH_CAMPAIGN_KEY }, ...over });
const profile = (over: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = { enrollment_id: ENR, lead_id: LEAD, overlays: ['HIGH_INTENT'], e_score: 60, f_score: 5, primary_state: 'ACTIVE', signal_summary: { highestIntentTier: 3 }, ...over };
  return { get: (k: string) => row[k] };
};
const receipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: 'd-ali', subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: ENR,
  channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', campaign_id: 'c-ali', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY, sequence_id: 's-ali',
  mode: 'review', status: 'approved', status_reason: 'approved', control_ids: [], proposal_id: 'pa-1', approved_by: 'admin:7', approved_at: AS_OF_4, attempts: 0, created_at: AS_OF_4, ...over,
});
const row = (id: string) => T5.executions.rows.find((r) => r.id === id) as Record<string, unknown>;
const run = (id: string) => executeApproved({ receiptId: id, flags: flags(), explorerFlags: explorerFlags(), asOf: AS_OF_4, programKind: 'learner' });
const transitions = () => m.ledger.mock.calls.map((c) => [(c[4] as { from: string }).from, (c[4] as { to: string }).to, (c[4] as { reason: string }).reason]);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  resetPhase5Tables();
  tables.scheduled.reset();
  for (const fn of Object.values(m)) fn.mockReset();
  m.killSwitch.mockResolvedValue(false);
  m.decisionFindOne.mockResolvedValue(decisionRow());
  m.leadFindByPk.mockResolvedValue({ get: (k: string) => (k === 'email' ? 'person@example.com' : null) });
  m.campaignFindOne.mockResolvedValue(aliCampaign());
  m.sequenceFindByPk.mockResolvedValue({ id: 's-ali', is_active: true });
  m.contactEvidence.mockResolvedValue(contact());
  m.profileFindOne.mockResolvedValue(profile());
  m.campaignLeadCount.mockResolvedValue(3);
  m.lastAliOutreach.mockResolvedValue(null);
  m.ledger.mockResolvedValue({ recorded: true });
  // The campaign service's one visible effect for the journey: the step-0 row the scheduler will later send.
  m.enrolCampaign.mockImplementation(async (campaignId: string, leadIds: number[]) => {
    for (const leadId of leadIds) tables.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: 's-ali', step_index: 0, status: 'pending' });
    return leadIds.map((leadId) => ({ leadId, status: 'enrolled' }));
  });
});

describe('acceptance 1: review + eligible -> one call', () => {
  it('claims, validates Ali\'s registered campaign for review, builds the context from stored rows, and enrols this one lead exactly once', async () => {
    const r = receipt();
    const out = await run(r.id as string);
    expect(out).toMatchObject({ status: 'enrolled', receiptId: r.id, channel: 'ali_outreach', nudge_id: null });
    expect(m.enrolCampaign).toHaveBeenCalledTimes(1);
    expect(m.enrolCampaign).toHaveBeenCalledWith('c-ali', [LEAD]);
    expect(m.enrol).not.toHaveBeenCalled(); // never the sequence directly: the campaign service owns Ali's enrolment
    expect(row(r.id as string)).toMatchObject({ status: 'enrolled', status_reason: 'enrolled', attempts: 1, campaign_id: 'c-ali', sequence_id: 's-ali', scheduled_email_id: tables.scheduled.rows[0].id });
    expect(transitions()).toEqual([['approved', 'enrolling', 'claimed'], ['enrolling', 'enrolled', 'enrolled']]);
    expect(m.campaignFindOne).toHaveBeenCalledWith({ where: { settings: { campaign_key: ALI_OUTREACH_CAMPAIGN_KEY } } });
    expect(m.profileFindOne).toHaveBeenCalledWith({ where: { enrollment_id: ENR } });
    expect(m.campaignLeadCount).toHaveBeenCalledWith({ where: { campaign_id: 'c-ali', enrolled_at: { [Op.gte]: new Date(Date.UTC(AS_OF_4.getUTCFullYear(), AS_OF_4.getUTCMonth(), AS_OF_4.getUTCDate())) } } });
  });

  it('a second run of the same receipt is not claimed: exactly once', async () => {
    const r = receipt();
    await run(r.id as string);
    expect((await run(r.id as string)).status).toBe('not_claimed');
    expect(m.enrolCampaign).toHaveBeenCalledTimes(1);
  });
});

describe('acceptance 2: over the cap -> blocked:ali_cap, 0 calls (and tomorrow it may go)', () => {
  it('Ali at his day\'s cap: the receipt goes back to approved with the attempt restored; nothing enrolled', async () => {
    m.campaignLeadCount.mockResolvedValue(ALI_DAILY_CAP);
    const r = receipt();
    expect(await run(r.id as string)).toEqual({ status: 'blocked', receiptId: r.id, reason: 'ali_cap' });
    expect(m.enrolCampaign).not.toHaveBeenCalled();
    expect(row(r.id as string)).toMatchObject({ status: 'approved', status_reason: 'blocked:ali_cap', attempts: 0, claimed_at: null });
    expect(ALI_DAILY_CAP).toBe(10);
  });

  it('inside the cooldown: cancelled, terminal - a 45-day wait outlives any receipt', async () => {
    m.lastAliOutreach.mockResolvedValue({ get: () => new Date(AS_OF_4.getTime() - (ALI_COOLDOWN_DAYS - 1) * DAY) });
    const r = receipt();
    expect(await run(r.id as string)).toEqual({ status: 'cancelled', receiptId: r.id, reason: 'ali_cooldown' });
    expect(m.enrolCampaign).not.toHaveBeenCalled();
    expect(row(r.id as string).status).toBe('cancelled');
    m.lastAliOutreach.mockResolvedValue({ get: () => new Date(AS_OF_4.getTime() - (ALI_COOLDOWN_DAYS + 1) * DAY) });
    const ok = receipt({ decision_id: 'd-ali-2', lead_id: 517, subject_ref: 'lead:517' });
    expect((await run(ok.id as string)).status).toBe('enrolled');
  });

  it('no intent record (no Explorer profile), no HIGH_INTENT, converted: each cancelled with its code, nothing enrolled; the Ali flag off is the hold of the ladder, earlier and transient', async () => {
    // The flag is T504's: the hold before the branch answers explorer_flag_off:aliOutreach and returns the receipt to approved,
    // so the evaluator's own flag gate is never the one that speaks (belt and braces, both pinned).
    const held = receipt();
    expect(await executeApproved({ receiptId: held.id as string, flags: flags(), explorerFlags: explorerFlags({ aliOutreachEnabled: false }), asOf: AS_OF_4, programKind: 'learner' })).toEqual({ status: 'blocked', receiptId: held.id, reason: 'explorer_flag_off:aliOutreach' });
    expect(row(held.id as string)).toMatchObject({ status: 'approved', attempts: 0 });
    const cases: Array<[Record<string, unknown> | null, ExplorerGrowthFlags, string]> = [
      [null, explorerFlags(), 'ali_no_profile'],
      [{ overlays: [] }, explorerFlags(), 'ali_no_high_intent'],
      [{ primary_state: 'CONVERTED' }, explorerFlags(), 'ali_converted'],
    ];
    for (const [over, ef, code] of cases) {
      resetPhase5Tables();
      m.profileFindOne.mockResolvedValue(over === null ? null : profile(over));
      const r = receipt();
      expect(await executeApproved({ receiptId: r.id as string, flags: flags(), explorerFlags: ef, asOf: AS_OF_4, programKind: 'learner' })).toEqual({ status: 'cancelled', receiptId: r.id, reason: code });
    }
    expect(m.enrolCampaign).not.toHaveBeenCalled();
  });
});

describe('acceptance 3: a forced limited Ali receipt is refused', () => {
  it('mode limited on an Ali receipt -> cancelled:ali_requires_review before any Ali read, 0 calls', async () => {
    const r = receipt({ mode: 'limited', approved_by: 'limited_rollout:ctl-1', proposal_id: null });
    expect(await run(r.id as string)).toEqual({ status: 'cancelled', receiptId: r.id, reason: 'ali_requires_review' });
    expect(m.enrolCampaign).not.toHaveBeenCalled();
    expect(m.profileFindOne).not.toHaveBeenCalled();
    expect(m.campaignLeadCount).not.toHaveBeenCalled();
    expect(row(r.id as string).status).toBe('cancelled');
  });
});

describe('the campaign service\'s answers', () => {
  it('already in Ali\'s campaign (the cron\'s enrolment) -> cancelled:ali_already_enrolled; a service error -> failed with its class', async () => {
    m.enrolCampaign.mockResolvedValueOnce([{ leadId: LEAD, status: 'already_enrolled' }]);
    const a = receipt();
    expect(await run(a.id as string)).toEqual({ status: 'cancelled', receiptId: a.id, reason: 'ali_already_enrolled' });
    m.enrolCampaign.mockResolvedValueOnce([{ leadId: 517, status: 'error', error: 'Campaign has no sequence assigned' }]);
    const b = receipt({ decision_id: 'd-ali-2', lead_id: 517, subject_ref: 'lead:517' });
    expect(await run(b.id as string)).toEqual({ status: 'failed', receiptId: b.id, error_class: 'AliEnrolError' });
    expect(row(b.id as string)).toMatchObject({ status: 'failed', last_error_class: 'AliEnrolError' });
  });

  it('the refusal code map: the cap is the one transient reason; anything beside it wins and is terminal', () => {
    const ctx = { overlays: ['HIGH_INTENT'], highestSignalTier: 3, eScore: 60, fScore: 5, isConverted: false, emailEligible: true, daysSinceLastAliOutreach: null, aliSendsToday: ALI_DAILY_CAP, flagEnabled: true };
    expect(aliRefusalCode({ eligible: false, reasons: [`Ali has already sent ${ALI_DAILY_CAP} today (cap ${ALI_DAILY_CAP}, shared across leads and Explorers)`] }, ctx)).toEqual({ code: 'ali_cap', transient: true });
    expect(aliRefusalCode({ eligible: false, reasons: ['last Ali outreach was 3d ago, cooldown is 45d', `Ali has already sent ${ALI_DAILY_CAP} today (cap ${ALI_DAILY_CAP}, shared across leads and Explorers)`] }, ctx)).toEqual({ code: 'ali_cooldown', transient: false });
    expect(aliRefusalCode({ eligible: false, reasons: ['something new'] }, ctx)).toEqual({ code: 'ali_ineligible', transient: false });
  });

  it('every terminal code is pinned against the real evaluator\'s prose, so a reworded reason fails here, not silently as ali_ineligible', () => {
    const ok = { overlays: ['HIGH_INTENT'], highestSignalTier: 3, eScore: 60, fScore: 5, isConverted: false, emailEligible: true, daysSinceLastAliOutreach: null, aliSendsToday: 0, flagEnabled: true };
    expect(evaluateAliOutreachEligibility(ok)).toMatchObject({ eligible: true });
    const code = (over: Partial<typeof ok>) => { const c = { ...ok, ...over }; return aliRefusalCode(evaluateAliOutreachEligibility(c), c); };
    expect(code({ flagEnabled: false })).toEqual({ code: 'ali_flag_off', transient: false });
    expect(code({ overlays: [] })).toEqual({ code: 'ali_no_high_intent', transient: false });
    expect(code({ highestSignalTier: 1 })).toEqual({ code: 'ali_signal_tier', transient: false });
    expect(code({ eScore: 1 })).toEqual({ code: 'ali_scores', transient: false });
    expect(code({ fScore: 99 })).toEqual({ code: 'ali_scores', transient: false });
    expect(code({ eScore: Number.NaN })).toEqual({ code: 'ali_scores', transient: false });
    expect(code({ isConverted: true })).toEqual({ code: 'ali_converted', transient: false });
    expect(code({ emailEligible: false })).toEqual({ code: 'ali_not_email_eligible', transient: false });
    expect(code({ daysSinceLastAliOutreach: ALI_COOLDOWN_DAYS - 1 })).toEqual({ code: 'ali_cooldown', transient: false });
    expect(code({ aliSendsToday: ALI_DAILY_CAP })).toEqual({ code: 'ali_cap', transient: true });
  });

  it('the context builder reads by enrolment when the receipt has one, by lead when it does not', async () => {
    await buildAliOutreachContext({ enrollmentId: null, leadId: LEAD, campaignId: 'c-ali', emailEligible: true, explorerFlags: explorerFlags(), asOf: AS_OF_4 });
    expect(m.profileFindOne).toHaveBeenLastCalledWith({ where: { lead_id: LEAD } });
    const built = await buildAliOutreachContext({ enrollmentId: ENR, leadId: LEAD, campaignId: 'c-ali', emailEligible: true, explorerFlags: explorerFlags(), asOf: AS_OF_4 });
    expect(built).toEqual({ ok: true, context: { overlays: ['HIGH_INTENT'], highestSignalTier: 3, eScore: 60, fScore: 5, isConverted: false, emailEligible: true, daysSinceLastAliOutreach: null, aliSendsToday: 3, flagEnabled: true } });
  });
});
