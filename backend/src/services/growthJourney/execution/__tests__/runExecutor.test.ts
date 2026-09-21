const m = {
  enrol: jest.fn(),
  enrolCampaign: jest.fn(),
  aliSends: jest.fn(),
  uuid: jest.fn(),
  programsFindAll: jest.fn(),
  leadFindByPk: jest.fn(),
  agentFindOne: jest.fn(),
  campaignFindOne: jest.fn(),
  sequenceFindByPk: jest.fn(),
  contactEvidence: jest.fn(),
  returnToAi: jest.fn(),
  killSwitch: jest.fn(),
  ledger: jest.fn(),
  transaction: jest.fn(),
};
jest.mock('../../../../models', () => {
  const { phase5ModelsMock } = require('../../__tests__/fixtures/phase5Tables');
  const { Table } = require('../../__tests__/fixtures/phase4Tables');
  const decisions = new Table('growth_journey_decisions', 'd');
  const scheduled = new Table('scheduled_emails', 'se');
  const domains = new Table('brand_domains', 'bd');
  const communication = new Table('communication_logs', 'cl');
  const interactions = new Table('interaction_outcomes', 'io');
  const proposals = new Table('proposed_agent_actions', 'pa');
  const outcomes = new Table('growth_journey_outcomes', 'out');
  const ledger = new Table('event_ledger', 'ev');
  return {
    ...phase5ModelsMock,
    GrowthJourneyDecision: decisions,
    ScheduledEmail: scheduled,
    BrandDomain: domains,
    // T516: the Ali branch reads the last outreach marker from the same model the planner reads replies from.
    CommunicationLog: { findOne: (q: { where: Record<string, unknown> }) => ('metadata' in q.where ? Promise.resolve(null) : communication.findOne(q)) },
    ExplorerJourneyProfile: { findOne: async () => ({ get: (k: string) => ({ enrollment_id: 'enr-ali', lead_id: 513, overlays: ['HIGH_INTENT'], e_score: 60, f_score: 5, primary_state: 'ACTIVE', signal_summary: { highestIntentTier: 3 } } as Record<string, unknown>)[k] }) },
    CampaignLead: { count: (...a: unknown[]) => m.aliSends(...a) },
    InteractionOutcome: interactions,
    ProposedAgentAction: proposals,
    GrowthJourneyOutcome: outcomes,
    EventLedger: ledger,
    JourneyProgram: { findAll: (...a: unknown[]) => m.programsFindAll(...a) },
    Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
    AiAgent: { findOne: (...a: unknown[]) => m.agentFindOne(...a) },
    Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) },
    FollowUpSequence: { findByPk: (...a: unknown[]) => m.sequenceFindByPk(...a) },
    __tables: { decisions, scheduled, domains, communication, interactions, proposals, outcomes, ledger },
  };
});
jest.mock('../../../../config/env', () => ({
  env: {
    growthJourney: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true },
    explorerGrowth: { growthOsEnabled: true, aliOutreachEnabled: true, inAppNudgeEnabled: true, smsEnabled: false, autoDialEnabled: false },
  },
}));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: (...a: unknown[]) => m.transaction(...a) } }));
// The reconciler imports OPEN_EXECUTION_STATUSES as a value from the model file, whose Model.init needs the real
// sequelize; with the database mocked above, the one value it needs is handed over directly.
jest.mock('../../../../models/GrowthJourneyExecution', () => ({ OPEN_EXECUTION_STATUSES: ['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress'] }));
jest.mock('../../../sequenceService', () => ({ enrollLeadInSequence: (...a: unknown[]) => m.enrol(...a) }));
jest.mock('../../../campaignService', () => ({ enrollLeadsInCampaign: (...a: unknown[]) => m.enrolCampaign(...a) }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => m.killSwitch(...a) }));
jest.mock('../../governor/contactEvidence', () => ({ resolveContactEvidence: (...a: unknown[]) => m.contactEvidence(...a) }));
jest.mock('../../handoffs/returnToAi', () => ({ ...jest.requireActual('../../handoffs/returnToAi'), resolveReturnToAi: (...a: unknown[]) => m.returnToAi(...a) }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));
// The run's correlation id is real by default; one test forces the UUID the redactor's phone pattern used to rewrite.
jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomUUID: () => m.uuid() }));

import fs from 'fs';
import path from 'path';
import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import * as models from '../../../../models';
import { AS_OF_4, type Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { contact } from '../../__tests__/fixtures/learnerFixtures';
import { NO_RETURN } from '../../handoffs/returnToAi';
import { FLOW_CAMPAIGN_KEYS } from '../campaignKeys';
import { EXECUTOR_AGENT, EXECUTOR_CHANNELS, EXECUTOR_LIMITS, EXECUTOR_SCHEDULE, runExecutor } from '../runExecutor';
import { pauseScopeKey, rolloutScopeKey } from '../scopeKey';

/**
 * T513 — the batch over T503's tables, T504's real ladder, T508's real planner,
 * T510's real adapter and T512's real reconciler. The sequence service is the
 * one spy that matters: it is called exactly once for a decision that reaches
 * `enrolled`, and never again.
 */

const tables = (models as unknown as { __tables: Record<'decisions' | 'scheduled' | 'domains' | 'communication' | 'interactions' | 'proposals' | 'outcomes' | 'ledger', Table> }).__tables;
const { randomUUID } = jest.requireActual('crypto') as { randomUUID: () => string };
/** The v4 UUID the verifier showed the redactor rewriting to `...-12***-***-9012` when the whole line went through it. */
const MANGLEABLE_UUID = '3f1a2b4c-9e7d-4b1a-8c2e-123456789012';
const TENANT = 't-col';
const BRAND = 'b-ent';
const PROGRAM = 'p-ent';
const LEAD = 513;
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(AS_OF_4.getTime() - ms);

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over,
});
const explorerFlags = (over: Partial<ExplorerGrowthFlags> = {}): ExplorerGrowthFlags => ({
  growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false,
  aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false, ...over,
} as ExplorerGrowthFlags);

const programRow = (over: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = { id: PROGRAM, brand_id: BRAND, kind: 'business', slug: 'colaberry-business', status: 'active', ...over };
  return { get: (k: string) => row[k] };
};
const flowCandidate = { action_type: 'SEND_EMAIL', campaign_key: BIZ_FLOW, priority_tier: 5, intra_tier_score: 60, channel: 'email', required_assets: [], rationale: ['x'] };
let seq = 0;
const liveDecision = (over: Record<string, unknown> = {}) => tables.decisions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null, mode: 'live',
  selected_action: 'SEND_EMAIL', selected_channel: 'email', selected_content: { assets: [] }, candidates: [flowCandidate], suppressed: [], deferred_actions: [],
  reason: 'QUALIFIED_OPPORTUNITY', idempotency_key: `k-${(seq += 1)}`, created_at: ago(2 * HOUR), ...over,
});
const approvedCampaign = () => ({ id: 'c-flow', tenant_id: TENANT, brand_id: BRAND, status: 'active', approval_status: 'approved', sequence_id: 's-flow', settings: { campaign_key: BIZ_FLOW } });
const limitedRollout = (cohort: number[] = [LEAD], over: Record<string, unknown> = {}) => T5.controls.insert({
  tenant_id: TENANT, kind: 'rollout', brand_id: BRAND, program_id: PROGRAM, channel: 'email', subject_ref: null,
  scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'email' }), mode: 'limited', cohort_lead_ids: cohort, daily_limit: null, cleared_at: null, ...over,
});
/** An approved receipt AND the live decision it came from - the adapter re-reads the decision before it enrols. */
const approvedReceipt = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: liveDecision({ lead_id: over.lead_id ?? LEAD, subject_ref: over.subject_ref ?? `lead:${LEAD}`, ...(over.channel === 'ali_outreach' ? { selected_action: 'SEND_ALI_OUTREACH', selected_channel: 'email' } : {}) }).id, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
  channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: BIZ_FLOW, sequence_id: 's-flow',
  mode: 'limited', status: 'approved', status_reason: 'rollout', control_ids: [], proposal_id: null, approved_by: 'limited_rollout:ctl', approved_at: ago(HOUR), claimed_at: null, attempts: 0, created_at: ago(HOUR), ...over,
});
const receiptRows = () => T5.executions.rows.map((r) => ({ decision_id: r.decision_id, status: r.status, attempts: r.attempts }));
const run = (over: Record<string, unknown> = {}) => runExecutor({ asOf: AS_OF_4, flags: flags(), explorerFlags: explorerFlags(), ...over });
const executionLedgerRows = () => m.ledger.mock.calls.filter((c) => String(c[0]).startsWith('growth_journey.execution.'));

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  resetPhase5Tables();
  for (const t of Object.values(tables)) t.reset();
  for (const fn of Object.values(m)) fn.mockReset();
  m.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  m.killSwitch.mockResolvedValue(false);
  m.programsFindAll.mockResolvedValue([programRow()]);
  m.leadFindByPk.mockResolvedValue({ get: (k: string) => (k === 'email' ? 'person@example.com' : null) });
  m.agentFindOne.mockResolvedValue({ get: () => 'agent-executor' });
  m.campaignFindOne.mockResolvedValue(approvedCampaign());
  m.sequenceFindByPk.mockResolvedValue({ id: 's-flow', is_active: true });
  m.contactEvidence.mockResolvedValue(contact());
  m.returnToAi.mockResolvedValue(NO_RETURN);
  // The ledger mock writes the row the real ledger would - the planner's refusals are what the executor reads back.
  m.ledger.mockImplementation(async (type: string, entity: string, id: string) => {
    tables.ledger.insert({ event_type: type, entity_type: entity, entity_id: id });
    return { recorded: true };
  });
  m.uuid.mockImplementation(() => randomUUID());
  m.aliSends.mockResolvedValue(0);
  m.enrolCampaign.mockImplementation(async (campaignId: string, leadIds: number[]) => {
    for (const leadId of leadIds) tables.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: 's-ali', step_index: 0, status: 'pending', sent_at: null, metadata: null });
    return leadIds.map((leadId) => ({ leadId, status: 'enrolled' }));
  });
  // The sequence service's one visible effect: the step-0 row the scheduler will later send.
  m.enrol.mockImplementation(async (leadId: number, sequenceId: string, campaignId: string) => {
    tables.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: sequenceId, step_index: 0, status: 'pending', sent_at: null, metadata: null });
  });
});

describe('the gates', () => {
  it('acceptance 1: flags off -> skipped before any model read (the master flag, and the execution flag alone)', async () => {
    const reads = [jest.spyOn(T5.executions, 'findAll'), jest.spyOn(tables.decisions, 'findAll')];
    for (const [over, reason] of [[{ growthJourneyEnabled: false }, 'growthJourney_off'], [{ journeyExecution: false }, 'journeyExecution_off']] as const) {
      const s = await run({ flags: flags(over) });
      expect(s.status).toBe('skipped');
      expect(s.reason).toBe(reason);
    }
    expect(m.programsFindAll).not.toHaveBeenCalled();
    for (const spy of reads) expect(spy).not.toHaveBeenCalled();
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it('with no flags handed in, the process flags decide (the env mock has both on)', async () => {
    const s = await runExecutor({ asOf: AS_OF_4 });
    expect(s.status).toBe('ran');
    expect(m.programsFindAll).toHaveBeenCalledTimes(1);
  });

  it('names the agent and the schedule the registry seed carries, and the channels it may enrol', () => {
    expect(EXECUTOR_AGENT).toBe('GrowthJourneyExecutor');
    expect(EXECUTOR_SCHEDULE).toBe('*/15 14-22 * * 1-5');
    expect(EXECUTOR_LIMITS).toEqual({ plan: 200, execute: 50, reconcile: 500 });
    expect(EXECUTOR_CHANNELS).toEqual(['email', 'in_app', 'ali_outreach']);
  });
});

describe('acceptance 2: a limited cohort decision reaches enrolled in one run, and a second run changes nothing', () => {
  it('plan -> approved, execute -> enrolled through the adapter, one enrol call; the second run plans nothing, claims nothing, enrols nothing', async () => {
    limitedRollout();
    const d = liveDecision();
    const first = await run();
    expect(first.status).toBe('ran');
    expect(first.stage_errors).toEqual([]);
    expect(first.plan).toMatchObject({ programs: 1, candidates: 1, planned: 1, replayed: 0, refused: {}, errors: 0 });
    expect(first.execute).toMatchObject({ candidates: 1, held: {}, enrolled: 1, not_claimed: 0, blocked: 0, cancelled: 0, failed: 0, errors: 0 });
    expect(first.reconcile).toMatchObject({ scanned: 1, moved: {} });
    expect(receiptRows()).toEqual([{ decision_id: d.id, status: 'enrolled', attempts: 1 }]);
    expect(m.enrol).toHaveBeenCalledTimes(1);
    expect(m.enrol).toHaveBeenCalledWith(LEAD, 's-flow', 'c-flow');
    expect(T5.executions.rows[0].scheduled_email_id).toBe(tables.scheduled.rows[0].id);

    const snapshot = JSON.stringify([T5.executions.rows, tables.scheduled.rows, tables.proposals.rows]);
    const ledgerRows = m.ledger.mock.calls.length;
    const second = await run();
    expect(second.plan).toMatchObject({ candidates: 0, planned: 0 });
    expect(second.execute).toMatchObject({ candidates: 0, enrolled: 0 });
    expect(m.enrol).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([T5.executions.rows, tables.scheduled.rows, tables.proposals.rows])).toBe(snapshot);
    expect(m.ledger.mock.calls.length).toBe(ledgerRows);
  });

  it('a REVIEW rollout: the run plans a pending_review receipt with its proposal and claims nothing; a human approval is the only way on', async () => {
    limitedRollout([LEAD], { mode: 'review', cohort_lead_ids: null });
    liveDecision();
    const s = await run();
    expect(s.plan).toMatchObject({ planned: 1 });
    expect(s.execute).toMatchObject({ candidates: 0 });
    expect(T5.executions.rows[0].status).toBe('pending_review');
    expect(tables.proposals.rows).toHaveLength(1);
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it('the ladder is asked before the planner: no rollout is a not_live count, no planner call, no refusal row - and the moment a rollout exists the decision is planned', async () => {
    liveDecision();
    const s = await run();
    expect(s.plan).toMatchObject({ candidates: 0, planned: 0, refused: {}, not_live: { no_rollout: 1 }, remembered: 0, errors: 0 });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(tables.ledger.rows.filter((r) => r.event_type === 'growth_journey.execution.refused')).toEqual([]);
    expect(T5.executions.rows).toEqual([]);
    expect((await run()).plan.not_live).toEqual({ no_rollout: 1 });
    expect(tables.ledger.rows).toEqual([]);
    // An operator's control takes effect at the next run, not the next nightly.
    limitedRollout();
    expect((await run()).plan).toMatchObject({ candidates: 1, planned: 1, not_live: {} });
  });

  it('a decision outside the cohort is a not_live count every run, never a planner call: no refusal row, no budget burned', async () => {
    limitedRollout([999]);
    liveDecision();
    for (let i = 0; i < 3; i += 1) expect((await run()).plan).toMatchObject({ candidates: 0, not_live: { not_in_cohort: 1 } });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(tables.ledger.rows).toEqual([]);
  });

  it('the planner\'s own refusal is a count by reason and ONE refusal row; the next run remembers it and does not feed the decision to the planner again', async () => {
    limitedRollout();
    liveDecision();
    m.returnToAi.mockResolvedValue({ active: true, until: new Date(AS_OF_4.getTime() + 48 * HOUR) });
    const first = await run();
    expect(first.plan).toMatchObject({ candidates: 1, planned: 0, refused: { returned_to_ai_cooldown: 1 }, remembered: 0 });
    const refusals = () => tables.ledger.rows.filter((r) => r.event_type === 'growth_journey.execution.refused');
    expect(refusals()).toHaveLength(1);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    const second = await run();
    expect(second.plan).toMatchObject({ candidates: 0, remembered: 1, refused: {} });
    expect(refusals()).toHaveLength(1);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(T5.executions.rows).toEqual([]);
  });

  it('the memory fails OPEN: a ledger that cannot be read is logged and the decision is planned anyway (exactly once is the receipt\'s index, not the memory)', async () => {
    limitedRollout();
    liveDecision();
    const spy = jest.spyOn(tables.ledger, 'findAll').mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const s = await run();
    spy.mockRestore();
    expect(s.plan).toMatchObject({ candidates: 1, planned: 1, remembered: 0 });
    expect(s.stage_errors).toEqual([]);
    const line = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.executor.refusal_memory_unavailable') && l.includes(s.correlation_id))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'warn', outcome: 'partial', error_class: 'SequelizeConnectionError', context: { candidates: 1 } });
  });

  it('only live decisions inside the age window, of active programmes, are candidates', async () => {
    limitedRollout([LEAD, 514, 515]);
    liveDecision({ mode: 'shadow', lead_id: 514, subject_ref: 'lead:514' });
    liveDecision({ created_at: ago(40 * HOUR), lead_id: 515, subject_ref: 'lead:515' });
    liveDecision({ brand_id: 'b-other', program_id: 'p-other' });
    const s = await run();
    expect(s.plan).toMatchObject({ candidates: 0, planned: 0 });
    expect(m.programsFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'active' } }));
  });
});

describe('the execute stage: the hold before the claim, the channels it may claim, the bound', () => {
  it('a paused brand+channel: the approved receipt is skipped in place - not claimed, not returned, no ledger row, no enrol', async () => {
    const r = approvedReceipt();
    T5.controls.insert({ tenant_id: TENANT, kind: 'pause', scope_key: pauseScopeKey({ brandId: BRAND, channel: 'email' }), brand_id: BRAND, program_id: null, channel: 'email', subject_ref: null, mode: 'off', cohort_lead_ids: null, daily_limit: null, cleared_at: null });
    const s = await run();
    expect(s.execute).toMatchObject({ candidates: 1, held: { 'pause:brand+channel': 1 }, enrolled: 0 });
    expect(T5.executions.rows[0]).toMatchObject({ id: r.id, status: 'approved', attempts: 0, claimed_at: null });
    expect(executionLedgerRows()).toEqual([]);
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it('the kill switch ON holds every approved receipt the same way, and the switch unreadable is treated as ON', async () => {
    approvedReceipt();
    m.killSwitch.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('unreadable'));
    expect((await run()).execute.held).toEqual({ kill_switch: 1 });
    expect((await run()).execute.held).toEqual({ kill_switch_unreadable: 1 });
    expect(T5.executions.rows[0].status).toBe('approved');
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it('T516: an approved (REVIEW) Ali-outreach receipt is a candidate and enrols through the campaign service, never the sequence directly', async () => {
    m.campaignFindOne.mockResolvedValue({ ...approvedCampaign(), id: 'c-ali', sequence_id: 's-ali', settings: { campaign_key: 'ali_personal_outreach' } });
    approvedReceipt({ channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', campaign_id: 'c-ali', campaign_key: 'ali_personal_outreach', mode: 'review', approved_by: 'admin:1', enrollment_id: 'enr-ali' });
    const s = await run();
    expect(s.execute).toMatchObject({ candidates: 1, enrolled: 1, held: {} });
    expect(m.enrolCampaign).toHaveBeenCalledTimes(1);
    expect(m.enrolCampaign).toHaveBeenCalledWith('c-ali', [LEAD]);
    expect(m.enrol).not.toHaveBeenCalled();
    expect(T5.executions.rows[0]).toMatchObject({ status: 'enrolled', attempts: 1 });
  });

  it('T516: Ali at his day\'s cap - the receipt waits in place: no claim, no attempt, no ledger row; the count is asked once per campaign per run', async () => {
    m.aliSends.mockResolvedValue(10);
    approvedReceipt({ channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', campaign_id: 'c-ali', campaign_key: 'ali_personal_outreach', mode: 'review', approved_by: 'admin:1', enrollment_id: 'enr-ali' });
    approvedReceipt({ lead_id: 514, subject_ref: 'lead:514', channel: 'ali_outreach', action_type: 'SEND_ALI_OUTREACH', campaign_id: 'c-ali', campaign_key: 'ali_personal_outreach', mode: 'review', approved_by: 'admin:1', enrollment_id: 'enr-ali-2' });
    const s = await run();
    expect(s.execute).toMatchObject({ candidates: 2, held: { ali_cap: 2 }, enrolled: 0 });
    expect(m.aliSends).toHaveBeenCalledTimes(1);
    expect(m.enrolCampaign).not.toHaveBeenCalled();
    expect(T5.executions.rows.every((r) => r.status === 'approved' && r.attempts === 0)).toBe(true);
    expect(executionLedgerRows()).toEqual([]);
  });

  it('the 51st receipt waits: fifty approved receipts enrol in one run and the oldest approval goes first', async () => {
    for (let i = 0; i < 51; i += 1) approvedReceipt({ lead_id: 1000 + i, subject_ref: `lead:${1000 + i}`, approved_at: new Date(AS_OF_4.getTime() - (60 - i) * 60_000) });
    const s = await run();
    expect(s.execute).toMatchObject({ candidates: 50, enrolled: 50 });
    expect(m.enrol).toHaveBeenCalledTimes(50);
    const waiting = T5.executions.rows.filter((r) => r.status === 'approved');
    expect(waiting.map((r) => r.lead_id)).toEqual([1050]);
    expect((await run()).execute).toMatchObject({ candidates: 1, enrolled: 1 });
  });

  it('the plan bound is per run across programmes: two live decisions, limit 1 -> one receipt, the other next run', async () => {
    limitedRollout([LEAD, 514]);
    liveDecision();
    liveDecision({ lead_id: 514, subject_ref: 'lead:514', created_at: ago(HOUR) });
    expect((await run({ limits: { plan: 1 } })).plan).toMatchObject({ candidates: 1, planned: 1 });
    expect(T5.executions.rows.map((r) => r.lead_id)).toEqual([LEAD]);
    expect((await run({ limits: { plan: 1 } })).plan).toMatchObject({ candidates: 1, planned: 1 });
    expect(T5.executions.rows.map((r) => r.lead_id).sort()).toEqual([LEAD, 514]);
  });
});

describe('acceptance 3: a stage that fails is one line, and the next stage still runs', () => {
  it('a thrown programme read fails the plan stage; execute and reconcile still run', async () => {
    m.programsFindAll.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    approvedReceipt();
    const s = await run();
    expect(s.status).toBe('ran');
    expect(s.stage_errors).toEqual([{ stage: 'plan', error_class: 'SequelizeConnectionError' }]);
    expect(s.execute).toMatchObject({ candidates: 1, enrolled: 1 });
    expect(s.reconcile).toMatchObject({ scanned: 1 });
    expect(T5.executions.rows[0].status).toBe('enrolled');
  });

  it('an approval past the TTL is never claimed: the reconciler expires it in the same run', async () => {
    const stale = approvedReceipt({ approved_at: ago(80 * HOUR), created_at: ago(80 * HOUR) });
    const s = await run();
    expect(s.execute).toMatchObject({ candidates: 0, enrolled: 0 });
    expect(s.reconcile).toMatchObject({ scanned: 1, moved: { expired: 1 } });
    expect(T5.executions.rows.find((r) => r.id === stale.id)!.status).toBe('expired');
    expect(m.enrol).not.toHaveBeenCalled();
  });

  it('a planner that throws for one decision is one error in the summary; the next decision is still planned', async () => {
    limitedRollout([LEAD, 514]);
    liveDecision();
    liveDecision({ lead_id: 514, subject_ref: 'lead:514', created_at: ago(HOUR) });
    m.transaction.mockRejectedValueOnce(Object.assign(new Error('deadlock'), { name: 'SequelizeDatabaseError' }));
    const s = await run();
    expect(s.plan).toMatchObject({ candidates: 2, planned: 1, errors: 1 });
    expect(s.stage_errors).toEqual([]);
    expect(T5.executions.rows.map((r) => r.lead_id)).toEqual([514]);
  });

  it('the reconcile stage runs on its own: a held receipt stays approved while a stale one expires in the same run', async () => {
    approvedReceipt();
    const stale = approvedReceipt({ lead_id: 514, subject_ref: 'lead:514', approved_at: ago(80 * HOUR), created_at: ago(80 * HOUR) });
    T5.controls.insert({ tenant_id: TENANT, kind: 'pause', scope_key: pauseScopeKey({ brandId: BRAND }), brand_id: BRAND, program_id: null, channel: null, subject_ref: null, mode: 'off', cohort_lead_ids: null, daily_limit: null, cleared_at: null });
    const s = await run();
    expect(s.execute).toMatchObject({ candidates: 1, held: { 'pause:brand': 1 } });
    expect(s.reconcile).toMatchObject({ scanned: 2, moved: { expired: 1 } });
    expect(T5.executions.rows.find((r) => r.id === stale.id)!.status).toBe('expired');
  });

  it('the run log carries counts and reason strings only, with a correlation id, and never an address', async () => {
    limitedRollout();
    liveDecision();
    const s = await run();
    const lines = (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));
    // Found by the run's own correlation id - the property the id exists for.
    const runLine = lines.find((l) => l.includes('growth_journey.executor.run') && l.includes(s.correlation_id))!;
    const parsed = JSON.parse(runLine);
    expect(parsed).toMatchObject({ level: 'info', service: 'growth-journey', outcome: 'success', correlation_id: s.correlation_id, context: { plan: { planned: 1 }, execute: { enrolled: 1 } } });
    expect(typeof parsed.duration_ms).toBe('number');
    expect(runLine).not.toContain('@');
    expect(runLine).not.toContain(`lead:${LEAD}`);
  });

  it('the envelope is never redacted: a correlation id the redactor\'s phone pattern would rewrite survives on every line of the run', async () => {
    m.uuid.mockImplementation(() => MANGLEABLE_UUID);
    // The redactor DOES rewrite this id when handed the whole line - the property the fix removes from the envelope.
    const { redactForLogs } = jest.requireActual('../../../../utils/piiRedaction') as { redactForLogs: (s: string) => string };
    expect(redactForLogs(JSON.stringify({ correlation_id: MANGLEABLE_UUID }))).not.toContain(MANGLEABLE_UUID);
    limitedRollout();
    liveDecision();
    m.programsFindAll.mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'SequelizeConnectionError' }));
    const s = await run();
    expect(s.correlation_id).toBe(MANGLEABLE_UUID);
    const lines = [...(console.log as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls, ...(console.warn as jest.Mock).mock.calls].map((c) => String(c[0])).filter((l) => l.includes('growth_journey.executor.') || l.includes('growth_journey_executor_'));
    const mine = lines.filter((l) => l.includes(`"correlation_id":"${MANGLEABLE_UUID}"`));
    expect(mine.map((l) => JSON.parse(l).event).sort()).toEqual(['growth_journey.executor.run', 'growth_journey.executor.stage_failed']);
    for (const l of mine) expect(JSON.parse(l).correlation_id).toBe(MANGLEABLE_UUID);
  });

  it('the batch imports nothing of the scheduler and names no send path; the scheduler side imports it', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'runExecutor.ts'), 'utf8');
    expect(src).not.toMatch(/schedulerService|cronInstrumentation|node-cron/);
    expect(src).not.toMatch(/sequenceService|enrollLeadInSequence|enrollLeadsInCampaign|ScheduledEmail\.create|sendMail/);
    expect(src).not.toMatch(/GrowthJourney(Classification|Transition|Decision|ScoreSnapshot|Outcome)\b/);
    expect(src.split('\n').length).toBeLessThan(300);
  });
});
