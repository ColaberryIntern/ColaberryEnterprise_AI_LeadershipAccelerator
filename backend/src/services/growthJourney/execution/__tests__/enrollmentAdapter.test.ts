const m = {
  enrol: jest.fn(),
  decisionFindOne: jest.fn(),
  leadFindByPk: jest.fn(),
  campaignFindOne: jest.fn(),
  sequenceFindByPk: jest.fn(),
  contactEvidence: jest.fn(),
  killSwitch: jest.fn(),
  ledger: jest.fn(),
};
jest.mock('../../../../models', () => {
  const { phase5ModelsMock } = require('../../__tests__/fixtures/phase5Tables');
  const { Table } = require('../../__tests__/fixtures/phase4Tables');
  const scheduled = new Table('scheduled_emails', 'se');
  const domains = new Table('brand_domains', 'bd');
  return {
    ...phase5ModelsMock,
    ScheduledEmail: scheduled,
    BrandDomain: domains,
    GrowthJourneyDecision: { findOne: (...a: unknown[]) => m.decisionFindOne(...a) },
    Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
    Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) },
    FollowUpSequence: { findByPk: (...a: unknown[]) => m.sequenceFindByPk(...a) },
    __tables: { scheduled, domains },
  };
});
jest.mock('../../../sequenceService', () => ({ enrollLeadInSequence: (...a: unknown[]) => m.enrol(...a) }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => m.killSwitch(...a) }));
jest.mock('../../governor/contactEvidence', () => ({ resolveContactEvidence: (...a: unknown[]) => m.contactEvidence(...a) }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn() } }));

import fs from 'fs';
import path from 'path';
import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import * as models from '../../../../models';
import { AS_OF_4, type Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { channel, contact } from '../../__tests__/fixtures/learnerFixtures';
import { FLOW_CAMPAIGN_KEYS } from '../campaignKeys';
import { executeApproved, nudgeHrefAllowed } from '../enrollmentAdapter';
import { pauseScopeKey } from '../scopeKey';

/**
 * T510 — the adapter over T503's tables (the shipped unique indexes enforced
 * by the fixture world), T504's real hold, T505's real validator. The enrol
 * call is the spy; the decision row, the lead's address, the evidence and the
 * ledger are the injected boundaries. Nothing here reaches a real sequence.
 */

const tables = (models as unknown as { __tables: { scheduled: Table; domains: Table } }).__tables;
const TENANT = 't-col';
const BRAND = 'b-ent';
const PROGRAM = 'p-ent';
const LEAD = 501;
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const HOUR = 3_600_000;
const ADDRESS = 'person@example.com';

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over,
});
const explorerFlags = (over: Partial<ExplorerGrowthFlags> = {}): ExplorerGrowthFlags => ({
  growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false,
  aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false, ...over,
} as ExplorerGrowthFlags);

const decisionRow = (over: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {
    id: 'd-1', tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null, mode: 'live',
    selected_action: 'SEND_EMAIL', selected_channel: 'email', selected_content: { assets: [] }, candidates: [{ action_type: 'SEND_EMAIL', campaign_key: BIZ_FLOW }], suppressed: [], deferred_actions: [],
    reason: 'r', created_at: new Date(AS_OF_4.getTime() - HOUR), ...over,
  };
  return { get: (k: string) => row[k] };
};
const approvedCampaign = (over: Record<string, unknown> = {}) => ({ id: 'c-flow', tenant_id: TENANT, brand_id: BRAND, status: 'active', approval_status: 'approved', sequence_id: 's-flow', settings: { campaign_key: BIZ_FLOW }, ...over });
const receipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: 'd-1', subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: BIZ_FLOW, sequence_id: 's-flow',
  mode: 'limited', status: 'approved', status_reason: 'rollout', control_ids: ['ctl-rollout'], proposal_id: null, approved_by: 'limited_rollout:ctl-rollout', approved_at: AS_OF_4, attempts: 0, created_at: AS_OF_4, ...over,
});
const row = (id: string) => T5.executions.rows.find((r) => r.id === id) as Record<string, unknown>;
const run = (id: string, over: Record<string, unknown> = {}) => executeApproved({ receiptId: id, flags: flags(), explorerFlags: explorerFlags(), asOf: AS_OF_4, programKind: 'business', ...over });
const transitions = () => m.ledger.mock.calls.map((c) => [c[0], (c[4] as { from: string; to: string; reason: string }).from, (c[4] as { to: string }).to, (c[4] as { reason: string }).reason]);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  resetPhase5Tables();
  tables.scheduled.reset();
  tables.domains.reset();
  for (const fn of Object.values(m)) fn.mockReset();
  m.killSwitch.mockResolvedValue(false);
  m.decisionFindOne.mockResolvedValue(decisionRow());
  m.leadFindByPk.mockResolvedValue({ get: (k: string) => (k === 'email' ? ADDRESS : null) });
  m.campaignFindOne.mockResolvedValue(approvedCampaign());
  m.sequenceFindByPk.mockResolvedValue({ id: 's-flow', is_active: true });
  m.contactEvidence.mockResolvedValue(contact());
  m.ledger.mockResolvedValue({ recorded: true });
  // The sequence service's own effect: a step-0 scheduled_emails row for the lead and campaign.
  m.enrol.mockImplementation(async (leadId: number, sequenceId: string, campaignId: string) => {
    tables.scheduled.insert({ lead_id: leadId, sequence_id: sequenceId, campaign_id: campaignId, step_index: 0, status: 'pending', created_at: new Date(AS_OF_4.getTime() + 1000) });
    return [];
  });
});

describe('email: an approved receipt becomes an enrolment, exactly once', () => {
  it('claims (approved -> enrolling), re-checks the hold, the evidence and the campaign, enrols with THREE arguments, records the step-0 row, and lands enrolled - one ledger row per transition', async () => {
    const r = receipt();
    const out = await run(r.id as string);
    expect(out).toEqual({ status: 'enrolled', receiptId: r.id, channel: 'email', scheduled_email_id: tables.scheduled.rows[0].id, nudge_id: null });
    expect(m.enrol).toHaveBeenCalledTimes(1);
    // Acceptance 3: the campaign id always, and never a fourth argument (`force`).
    expect(m.enrol.mock.calls[0]).toEqual([LEAD, 's-flow', 'c-flow']);
    expect(m.enrol.mock.calls[0]).toHaveLength(3);
    expect(row(r.id as string)).toMatchObject({ status: 'enrolled', status_reason: 'enrolled', attempts: 1, claimed_at: AS_OF_4, scheduled_email_id: tables.scheduled.rows[0].id, campaign_id: 'c-flow', sequence_id: 's-flow' });
    expect(transitions()).toEqual([
      ['growth_journey.execution.enrolling', 'approved', 'enrolling', 'claimed'],
      ['growth_journey.execution.enrolled', 'enrolling', 'enrolled', 'enrolled'],
    ]);
    expect(m.contactEvidence).toHaveBeenCalledWith({ subject: { lead_id: LEAD, email: ADDRESS, phone: null }, brandId: BRAND, tenantId: TENANT, asOf: AS_OF_4, programKind: 'business' });
    expect(m.sequenceFindByPk).toHaveBeenCalledWith('s-flow', { attributes: ['id', 'is_active'] }); // limited: the sequence gate too
    expect(JSON.stringify([row(r.id as string), m.ledger.mock.calls])).not.toContain('@');
  });

  it('the step-0 row is found by its index: a step-1 row written in the same instant, or a row from before the claim, is never recorded as step 0', async () => {
    const r = receipt();
    tables.scheduled.insert({ lead_id: LEAD, sequence_id: 's-flow', campaign_id: 'c-flow', step_index: 0, status: 'sent', created_at: new Date(AS_OF_4.getTime() - HOUR) }); // an older enrolment's row
    m.enrol.mockImplementation(async (leadId: number, sequenceId: string, campaignId: string) => {
      const at = new Date(AS_OF_4.getTime() + 1000);
      tables.scheduled.insert({ lead_id: leadId, sequence_id: sequenceId, campaign_id: campaignId, step_index: 1, status: 'pending', created_at: at });
      tables.scheduled.insert({ lead_id: leadId, sequence_id: sequenceId, campaign_id: campaignId, step_index: 0, status: 'pending', created_at: at });
      return [];
    });
    const out = await run(r.id as string);
    const step0 = tables.scheduled.rows.find((x) => x.step_index === 0 && (x.created_at as Date).getTime() > AS_OF_4.getTime());
    expect(out).toMatchObject({ status: 'enrolled', scheduled_email_id: step0!.id });
    expect(row(r.id as string).scheduled_email_id).toBe(step0!.id);
  });

  it('an enrol that creates no row (the sequence\'s own duplicate guard) is enrolled_no_step0_row, not a failure', async () => {
    const r = receipt();
    m.enrol.mockResolvedValue([]);
    expect(await run(r.id as string)).toMatchObject({ status: 'enrolled', scheduled_email_id: null });
    expect(row(r.id as string)).toMatchObject({ status: 'enrolled', status_reason: 'enrolled_no_step0_row', scheduled_email_id: null });
  });

  it('acceptance 1: two interleaved calls on one receipt -> exactly ONE enrol call; the loser is not_claimed', async () => {
    const r = receipt();
    const [a, b] = await Promise.all([run(r.id as string), run(r.id as string)]);
    expect([a.status, b.status].sort()).toEqual(['enrolled', 'not_claimed']);
    expect(m.enrol).toHaveBeenCalledTimes(1);
    expect(row(r.id as string).status).toBe('enrolled');
    expect(tables.scheduled.rows).toHaveLength(1);
  });

  it('a receipt that is not approved (pending_review, enrolling, enrolled, cancelled) or does not exist is not_claimed, with nothing touched', async () => {
    for (const status of ['pending_review', 'enrolling', 'enrolled', 'cancelled']) {
      resetPhase5Tables();
      const r = receipt({ status });
      expect(await run(r.id as string)).toEqual({ status: 'not_claimed', receiptId: r.id });
      expect(row(r.id as string).status).toBe(status);
    }
    expect(await run('ex-missing')).toEqual({ status: 'not_claimed', receiptId: 'ex-missing' });
    expect(m.enrol).not.toHaveBeenCalled();
    expect(m.ledger).not.toHaveBeenCalled();
  });

  it('acceptance 2: a pause set between approval and the claim -> blocked:pause:<scope>, 0 enrol calls, the receipt RETURNED to approved with the attempt not counted', async () => {
    const r = receipt();
    T5.controls.insert({ tenant_id: TENANT, kind: 'pause', scope_key: pauseScopeKey({ brandId: BRAND, channel: 'email' }), brand_id: BRAND, program_id: null, channel: 'email', subject_ref: null, mode: 'off', cohort_lead_ids: null, daily_limit: null, cleared_at: null });
    const out = await run(r.id as string);
    expect(out).toEqual({ status: 'blocked', receiptId: r.id, reason: 'pause:brand+channel' });
    expect(m.enrol).not.toHaveBeenCalled();
    // The rollout that approved stays on the receipt; the pause that held is added beside it (and named on the ledger row).
    expect(row(r.id as string)).toMatchObject({ status: 'approved', status_reason: 'blocked:pause:brand+channel', attempts: 0, claimed_at: null, control_ids: ['ctl-rollout', T5.controls.rows[0].id] });
    expect(m.ledger.mock.calls[1][4]).toMatchObject({ control_ids: [T5.controls.rows[0].id] });
    expect(transitions()).toEqual([
      ['growth_journey.execution.enrolling', 'approved', 'enrolling', 'claimed'],
      ['growth_journey.execution.approved', 'enrolling', 'approved', 'blocked:pause:brand+channel'],
    ]);
    // And it can be claimed again once the pause is cleared.
    T5.controls.rows[0].cleared_at = AS_OF_4;
    expect((await run(r.id as string)).status).toBe('enrolled');
    expect(m.enrol).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the execution flag off', { flags: flags({ journeyExecution: false }) }, 'flag_execution_off'],
    ['the master flag off', { flags: flags({ growthJourneyEnabled: false }) }, 'flag_master_off'],
  ])('%s at claim time -> blocked, 0 enrol calls', async (_label, over, reason) => {
    const r = receipt();
    expect(await run(r.id as string, over)).toEqual({ status: 'blocked', receiptId: r.id, reason });
    expect(m.enrol).not.toHaveBeenCalled();
    expect(row(r.id as string).status).toBe('approved');
  });

  it('the kill switch ON, and UNREADABLE, at claim time -> blocked', async () => {
    const r = receipt();
    m.killSwitch.mockResolvedValue(true);
    expect(await run(r.id as string)).toEqual({ status: 'blocked', receiptId: r.id, reason: 'kill_switch' });
    m.killSwitch.mockRejectedValue(new Error('settings gone'));
    expect(await run(r.id as string)).toEqual({ status: 'blocked', receiptId: r.id, reason: 'kill_switch_unreadable' });
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it.each([
    ['a channel closed since approval (a complaint)', () => m.contactEvidence.mockResolvedValue(contact({ email: channel(false, 'complained', 'suppression') })), 'complained'],
    ['a human now in the thread', () => m.contactEvidence.mockResolvedValue({ ...contact(), human_conversation: 'yes' }), 'human_in_conversation'],
    ['a consent verdict never checked', () => m.contactEvidence.mockResolvedValue(contact({ email: channel(true, 'consent_check_error') })), 'consent_unverified'],
    ['a campaign no longer approved', () => m.campaignFindOne.mockResolvedValue(approvedCampaign({ approval_status: 'draft' })), 'campaign_not_approved'],
    ['a sequence no longer active (limited)', () => m.sequenceFindByPk.mockResolvedValue({ id: 's-flow', is_active: false }), 'sequence_inactive'],
    ['the decision row gone', () => m.decisionFindOne.mockResolvedValue(null), 'decision_missing'],
    ['a lead that cannot be read', () => m.leadFindByPk.mockResolvedValue(null), 'lead_unreadable'],
  ])('%s -> CANCELLED (terminal), 0 enrol calls, the slot released', async (_label, arrange, reason) => {
    const r = receipt();
    arrange();
    expect(await run(r.id as string)).toEqual({ status: 'cancelled', receiptId: r.id, reason });
    expect(m.enrol).not.toHaveBeenCalled();
    expect(row(r.id as string)).toMatchObject({ status: 'cancelled', status_reason: reason });
    // Every transition is a ledger row - the cancel too (the T510 verifier's surviving mutant).
    expect(transitions()).toEqual([
      ['growth_journey.execution.enrolling', 'approved', 'enrolling', 'claimed'],
      ['growth_journey.execution.cancelled', 'enrolling', 'cancelled', reason],
    ]);
    expect(() => receipt({ decision_id: 'd-2' })).not.toThrow(); // the open slot is free again
  });

  it('an enrol that throws -> failed with the error class on the receipt and one redacted log line; the exception never escapes', async () => {
    const r = receipt();
    m.enrol.mockRejectedValue(new Error(`Lead ${ADDRESS} not found`));
    expect(await run(r.id as string)).toEqual({ status: 'failed', receiptId: r.id, error_class: expect.any(String) });
    expect(row(r.id as string)).toMatchObject({ status: 'failed', last_error_class: expect.any(String) });
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).filter((s) => s.includes('growth_journey.execution.failed'));
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain(ADDRESS);
    expect(transitions().at(-1)?.slice(1, 3)).toEqual(['enrolling', 'failed']);
  });

  it('an Ali outreach receipt is T511\'s: returned to approved, untouched, 0 enrol calls', async () => {
    const r = receipt({ channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', campaign_key: 'ali_personal_outreach' });
    expect(await run(r.id as string)).toEqual({ status: 'blocked', receiptId: r.id, reason: 'adapter_channel_unsupported' });
    expect(m.enrol).not.toHaveBeenCalled();
    expect(row(r.id as string)).toMatchObject({ status: 'approved', attempts: 0 });
  });
});

describe('in_app: an approved receipt becomes a nudge row', () => {
  const inAppDecision = (url: string) => decisionRow({ selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app', enrollment_id: 'enr-1', candidates: [{ action_type: 'SHOW_IN_APP_NUDGE', campaign_key: null }], selected_content: { assets: [{ id: 'a-1', asset_type: 'lesson', title: 'Your next step', url }] } });
  const inAppReceipt = (over: Record<string, unknown> = {}) => receipt({ channel: 'in_app', action_type: 'SHOW_IN_APP_NUDGE', enrollment_id: 'enr-1', campaign_id: null, campaign_key: null, sequence_id: null, mode: 'review', approved_by: 'admin:pi-1', ...over });

  it('a relative portal path: the nudge row carries the receipt, the enrolment, the title and href; no campaign is consulted; enrolled with the nudge id', async () => {
    m.decisionFindOne.mockResolvedValue(inAppDecision('/portal/next-step'));
    const r = inAppReceipt();
    const out = await run(r.id as string);
    expect(out).toMatchObject({ status: 'enrolled', channel: 'in_app', scheduled_email_id: null, nudge_id: T5.nudges.rows[0].id });
    expect(T5.nudges.rows[0]).toMatchObject({ tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, enrollment_id: 'enr-1', execution_id: r.id, title: 'Your next step', href: '/portal/next-step', purpose: 'lesson' });
    expect(row(r.id as string)).toMatchObject({ status: 'enrolled', nudge_id: T5.nudges.rows[0].id });
    expect(m.enrol).not.toHaveBeenCalled();
    expect(m.campaignFindOne).not.toHaveBeenCalled();
  });

  it('an https URL on one of the brand\'s own registered hostnames is allowed; a foreign host, http, javascript: and a protocol-relative path are refused (acceptance 5)', async () => {
    tables.domains.insert({ brand_id: BRAND, hostname: 'www.refactored.ai', purpose: 'web', is_primary: true });
    tables.domains.insert({ brand_id: 'b-other', hostname: 'evil.example', purpose: 'web', is_primary: true });
    m.decisionFindOne.mockResolvedValue(inAppDecision('https://www.refactored.ai/proof/case-01'));
    const ok = inAppReceipt();
    expect((await run(ok.id as string)).status).toBe('enrolled');
    for (const bad of ['https://evil.example/x', 'http://www.refactored.ai/x', 'javascript:alert(1)', '//www.refactored.ai/x', 'mailto:someone@example.com', 'not a url']) {
      resetPhase5Tables();
      tables.domains.insert({ brand_id: BRAND, hostname: 'www.refactored.ai', purpose: 'web', is_primary: true });
      m.decisionFindOne.mockResolvedValue(inAppDecision(bad));
      const r = inAppReceipt();
      expect([bad, (await run(r.id as string))]).toEqual([bad, { status: 'cancelled', receiptId: r.id, reason: 'nudge_href_invalid' }]);
      expect(T5.nudges.rows).toHaveLength(0);
    }
  });

  it('the nudge row is one per receipt by the shipped unique index, and a receipt without an enrolment or without approved content is cancelled', async () => {
    m.decisionFindOne.mockResolvedValue(inAppDecision('/portal/next-step'));
    const r = inAppReceipt();
    await run(r.id as string);
    expect(() => T5.nudges.insert({ tenant_id: TENANT, brand_id: BRAND, enrollment_id: 'enr-1', execution_id: r.id, title: 't' })).toThrow(/growth_journey_in_app_nudges_execution_unique/);
    resetPhase5Tables();
    const noEnrolment = inAppReceipt({ enrollment_id: null });
    expect(await run(noEnrolment.id as string)).toEqual({ status: 'cancelled', receiptId: noEnrolment.id, reason: 'in_app_requires_enrollment' });
    m.decisionFindOne.mockResolvedValue(decisionRow({ selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app', enrollment_id: 'enr-1', selected_content: { assets: [] } }));
    resetPhase5Tables();
    const noContent = inAppReceipt();
    expect(await run(noContent.id as string)).toEqual({ status: 'cancelled', receiptId: noContent.id, reason: 'in_app_no_approved_content' });
  });
});

describe('nudgeHrefAllowed, at the unit', () => {
  it('relative portal paths and https on a brand host only', () => {
    const hosts = ['www.refactored.ai', 'Training.Colaberry.com'];
    expect(nudgeHrefAllowed('/portal', hosts)).toBe(true);
    expect(nudgeHrefAllowed('/portal/lessons?x=1#a', hosts)).toBe(true);
    expect(nudgeHrefAllowed('https://training.colaberry.com/lesson/1', hosts)).toBe(true);
    expect(nudgeHrefAllowed('https://WWW.refactored.ai/', hosts)).toBe(true);
    for (const bad of ['//evil.example/x', '/\\evil.example', 'https://evil.example/', 'http://www.refactored.ai/', 'javascript:alert(1)', 'data:text/html,x', 'portal/relative', '', 'https://www.refactored.ai.evil.example/']) {
      expect([bad, nudgeHrefAllowed(bad, hosts)]).toEqual([bad, false]);
    }
    expect(nudgeHrefAllowed('https://www.refactored.ai/', [])).toBe(false);
  });
});

describe('the reader the adapter uses is read-only by contract', () => {
  it('decisionReads.ts names the decision model and contains no create, update, upsert or destroy; the adapter never names the model', () => {
    const reads = fs.readFileSync(path.join(__dirname, '..', 'decisionReads.ts'), 'utf8');
    expect(reads).toContain('GrowthJourneyDecision');
    for (const banned of ['.create(', '.update(', '.upsert(', '.destroy(', 'bulkCreate']) expect({ banned, present: reads.includes(banned) }).toEqual({ banned, present: false });
    const adapter = fs.readFileSync(path.join(__dirname, '..', 'enrollmentAdapter.ts'), 'utf8');
    expect(/GrowthJourneyDecision\b/.test(adapter)).toBe(false);
  });
});
