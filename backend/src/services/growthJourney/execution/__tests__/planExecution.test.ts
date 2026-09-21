const m = {
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
  const communication = new Table('communication_logs', 'cl');
  const proposals = new Table('proposed_agent_actions', 'pa');
  return {
    ...phase5ModelsMock,
    CommunicationLog: communication,
    ProposedAgentAction: proposals,
    Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
    AiAgent: { findOne: (...a: unknown[]) => m.agentFindOne(...a) },
    Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) },
    FollowUpSequence: { findByPk: (...a: unknown[]) => m.sequenceFindByPk(...a) },
    __tables: { communication, proposals },
  };
});
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: (...a: unknown[]) => m.transaction(...a) } }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => m.killSwitch(...a) }));
jest.mock('../../governor/contactEvidence', () => ({ resolveContactEvidence: (...a: unknown[]) => m.contactEvidence(...a) }));
jest.mock('../../handoffs/returnToAi', () => ({ ...jest.requireActual('../../handoffs/returnToAi'), resolveReturnToAi: (...a: unknown[]) => m.returnToAi(...a) }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));

import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import * as models from '../../../../models';
import { AS_OF_4, type Table } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { channel, contact } from '../../__tests__/fixtures/learnerFixtures';
import { assertPacketCarriesNoAddress } from '../../handoffs/evidencePacket';
import { NO_RETURN } from '../../handoffs/returnToAi';
import { FLOW_CAMPAIGN_KEYS } from '../campaignKeys';
import { planExecution, type PlanExecutionResult } from '../planExecution';
import { type ExecutionDecisionView, selectedCandidateOf, stalenessOf, MAX_DECISION_AGE_HOURS } from '../planChecks';
import { EXECUTOR_AGENT_NAME, PROPOSAL_TARGET_TABLE, PROPOSAL_TTL_HOURS } from '../proposalFiler';
import { rolloutScopeKey } from '../scopeKey';

/**
 * T508 — the planner over T503's tables (the shipped unique indexes enforced
 * by the fixture world), T504's real ladder, T505's real validator. The
 * evidence, the lead's address, the agent row, the campaign rows and the
 * ledger are the injected boundaries.
 */

const tables = (models as unknown as { __tables: { communication: Table; proposals: Table } }).__tables;
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

const flowCandidate = { action_type: 'SEND_EMAIL', campaign_key: BIZ_FLOW, priority_tier: 5, intra_tier_score: 60, channel: 'email', required_assets: [], rationale: ['x'] };
const decision = (over: Partial<ExecutionDecisionView> = {}): ExecutionDecisionView => ({
  id: 'd-1', tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
  mode: 'live', selected_action: 'SEND_EMAIL', selected_channel: 'email', selected_content: { assets: [] },
  candidates: [flowCandidate], suppressed: [],
  deferred_actions: [{ would: 'scheduling_offer', reason: 'qualified_state:QUALIFIED_OPPORTUNITY', payload: { layer: 2, gap: 'no_approved_flow:scheduling_offer' } }],
  reason: 'QUALIFIED_OPPORTUNITY: one reply earned Layer 2 - discovery questions through the approved flow', created_at: new Date(AS_OF_4.getTime() - 2 * HOUR), ...over,
});
const approvedCampaign = (over: Record<string, unknown> = {}) => ({ id: 'c-flow', tenant_id: TENANT, brand_id: BRAND, status: 'active', approval_status: 'approved', sequence_id: 's-flow', settings: { campaign_key: BIZ_FLOW }, ...over });
const rollout = (over: Record<string, unknown> = {}) => T5.controls.insert({
  tenant_id: TENANT, kind: 'rollout', brand_id: BRAND, program_id: PROGRAM, channel: 'email', subject_ref: null,
  scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'email' }), mode: 'review', cohort_lead_ids: null, daily_limit: null, cleared_at: null, ...over,
});
const plan = (d: ExecutionDecisionView = decision(), over: Record<string, unknown> = {}) =>
  planExecution({ decision: d, flags: flags(), explorerFlags: explorerFlags(), asOf: AS_OF_4, programKind: 'business', ...over });
const refusalsLogged = () => m.ledger.mock.calls.filter((c) => c[0] === 'growth_journey.execution.refused').map((c) => (c[4] as { refusal: string }).refusal);
const receiptRowsLogged = () => m.ledger.mock.calls.filter((c) => String(c[0]).startsWith('growth_journey.execution.') && c[0] !== 'growth_journey.execution.refused');
const refused = (r: PlanExecutionResult) => (r.status === 'refused' ? r.reason : `NOT REFUSED: ${r.status}`);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  resetPhase5Tables();
  tables.communication.reset();
  tables.proposals.reset();
  for (const fn of Object.values(m)) fn.mockReset();
  m.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  m.killSwitch.mockResolvedValue(false);
  m.leadFindByPk.mockResolvedValue({ get: (k: string) => (k === 'email' ? ADDRESS : null) });
  m.agentFindOne.mockResolvedValue({ get: () => 'agent-executor' });
  m.campaignFindOne.mockResolvedValue(approvedCampaign());
  m.sequenceFindByPk.mockResolvedValue({ id: 's-flow', is_active: true });
  m.contactEvidence.mockResolvedValue(contact());
  m.returnToAi.mockResolvedValue(NO_RETURN);
  m.ledger.mockResolvedValue({ recorded: true });
});

describe('REVIEW: a live email decision becomes a pending_review receipt and exactly one proposal', () => {
  it('writes the receipt with the decision\'s ids, the validated campaign, the rollout row and the reason; files one proposal at the executor; both carry no address; one ledger row on the receipt', async () => {
    const ctl = rollout();
    const r = await plan();
    if (r.status !== 'planned') throw new Error(refused(r));
    expect([r.mode, r.replayed]).toEqual(['review', false]);
    const receipt = r.receipt as unknown as Record<string, unknown>;
    expect(receipt).toMatchObject({
      tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: 'd-1', subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null,
      channel: 'email', action_type: 'SEND_EMAIL', campaign_id: 'c-flow', campaign_key: BIZ_FLOW, sequence_id: 's-flow',
      mode: 'review', status: 'pending_review', status_reason: 'rollout', control_ids: [ctl.id], proposal_id: r.proposal_id, approved_by: null, approved_at: null,
    });
    expect(T5.executions.rows).toHaveLength(1);

    const proposals = tables.proposals.rows;
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      id: r.proposal_id, agent_id: 'agent-executor', agent_name: EXECUTOR_AGENT_NAME, action_type: 'growth_journey_execution',
      target_table: PROPOSAL_TARGET_TABLE, target_id: receipt.id, campaign_id: 'c-flow', reason: decision().reason, status: 'pending',
      proposed_changes: { status: 'approved' }, before_state: { status: 'pending_review' }, expires_at: new Date(AS_OF_4.getTime() + PROPOSAL_TTL_HOURS * HOUR),
    });
    expect(m.agentFindOne).toHaveBeenCalledWith({ where: { agent_name: EXECUTOR_AGENT_NAME }, attributes: ['id'] });

    // Acceptance 5: no address on the receipt, the proposal, or the ledger - the lead's address was read (for consent) and written nowhere.
    expect(m.leadFindByPk).toHaveBeenCalledWith(LEAD, { attributes: ['email', 'phone'] });
    expect(m.contactEvidence).toHaveBeenCalledWith({ subject: { lead_id: LEAD, email: ADDRESS, phone: null }, brandId: BRAND, tenantId: TENANT, asOf: AS_OF_4, programKind: 'business' });
    expect(() => assertPacketCarriesNoAddress(receipt as never)).not.toThrow();
    expect(() => assertPacketCarriesNoAddress(proposals[0] as never)).not.toThrow();
    expect(JSON.stringify([receipt, proposals, m.ledger.mock.calls])).not.toContain('@');

    // Acceptance 7: one ledger row, on the receipt, ids and reasons only.
    expect(receiptRowsLogged()).toHaveLength(1);
    expect(receiptRowsLogged()[0].slice(0, 5)).toEqual(['growth_journey.execution.pending_review', 'growth_journey_execution', receipt.id, { tenant_id: TENANT, brand_id: BRAND }, {
      from: null, to: 'pending_review', reason: 'rollout', decision_id: 'd-1', channel: 'email', mode: 'review', control_ids: [ctl.id], proposal_id: r.proposal_id, campaign_id: 'c-flow',
    }]);
    expect(refusalsLogged()).toEqual([]);
  });

  it('acceptance 2: planning the same decision twice gives ONE receipt - the second is a replay of the first, no second proposal, no second ledger row', async () => {
    rollout();
    const first = await plan();
    const second = await plan();
    if (first.status !== 'planned' || second.status !== 'replayed') throw new Error(`${first.status} / ${second.status}`);
    expect((second.receipt as unknown as { id: string }).id).toBe((first.receipt as unknown as { id: string }).id);
    expect(T5.executions.rows).toHaveLength(1);
    expect(tables.proposals.rows).toHaveLength(1);
    expect(receiptRowsLogged()).toHaveLength(1);
    expect(refusalsLogged()).toEqual([]);
  });

  it('acceptance 3: two live decisions for one (lead, brand, channel) - the second is open_execution_exists, with no receipt and one refusal row', async () => {
    rollout();
    const first = await plan(decision({ id: 'd-1' }));
    const second = await plan(decision({ id: 'd-2' }));
    expect(first.status).toBe('planned');
    expect(refused(second)).toBe('open_execution_exists');
    expect(T5.executions.rows).toHaveLength(1);
    expect(tables.proposals.rows).toHaveLength(1);
    expect(refusalsLogged()).toEqual(['open_execution_exists']);
    // A different channel for the same person is its own slot.
    const nudge = await plan(decision({ id: 'd-3', selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app', enrollment_id: 'enr-1', selected_content: { assets: [{ title: 'Your next step', url: '/portal/next' }] }, candidates: [{ action_type: 'SHOW_IN_APP_NUDGE', campaign_key: null }] }));
    expect(nudge.status).toBe('refused'); // no in_app rollout in this world: mode_not_live
    expect(refused(nudge)).toBe('mode_not_live:no_rollout');
  });

  it('acceptance 6: no executor agent row -> review_queue_unavailable, and NO receipt, NO proposal, one refusal row', async () => {
    rollout();
    m.agentFindOne.mockResolvedValue(null);
    expect(refused(await plan())).toBe('review_queue_unavailable');
    expect(T5.executions.rows).toHaveLength(0);
    expect(tables.proposals.rows).toHaveLength(0);
    expect(refusalsLogged()).toEqual(['review_queue_unavailable']);
  });

  it('the receipt and the proposal are written inside ONE transaction, and the rollout row is locked in it', async () => {
    const ctl = rollout();
    const findOne = jest.spyOn(T5.controls, 'findOne');
    const create = jest.spyOn(T5.executions, 'create');
    const propose = jest.spyOn(tables.proposals, 'create');
    const r = await plan();
    expect(r.status).toBe('planned');
    expect(m.transaction).toHaveBeenCalledTimes(1);
    const calls = (fn: jest.SpyInstance) => fn.mock.calls as unknown as Array<[unknown, { transaction: unknown }]>;
    const t = calls(create)[0][1].transaction;
    expect(t).toEqual({ LOCK: { UPDATE: 'UPDATE' } });
    expect(calls(propose)[0][1].transaction).toBe(t);
    expect(findOne).toHaveBeenCalledWith({ where: { id: ctl.id }, transaction: t, lock: 'UPDATE' });
  });
});

describe('LIMITED: a cohort subject\'s receipt is born approved, by the rollout, with no proposal', () => {
  it('approved_by names the control row; approved_at is the clock; the review queue is never asked', async () => {
    const ctl = rollout({ mode: 'limited', cohort_lead_ids: [LEAD], daily_limit: 3 });
    const r = await plan();
    if (r.status !== 'planned') throw new Error(refused(r));
    expect([r.mode, r.proposal_id]).toEqual(['limited', null]);
    expect(r.receipt as unknown as Record<string, unknown>).toMatchObject({ mode: 'limited', status: 'approved', status_reason: 'rollout', approved_by: `limited_rollout:${ctl.id}`, approved_at: AS_OF_4, control_ids: [ctl.id], proposal_id: null });
    expect(tables.proposals.rows).toHaveLength(0);
    expect(m.agentFindOne).not.toHaveBeenCalled();
    expect(m.sequenceFindByPk).toHaveBeenCalledWith('s-flow', { attributes: ['id', 'is_active'] });
    expect(receiptRowsLogged()[0][0]).toBe('growth_journey.execution.approved');
  });

  it('a subject outside the cohort is refused mode_not_live:not_in_cohort; a spent daily limit lowers to review (a proposal), never to a send', async () => {
    const ctl = rollout({ mode: 'limited', cohort_lead_ids: [LEAD + 1], daily_limit: 1 });
    expect(refused(await plan())).toBe('mode_not_live:not_in_cohort');
    await (ctl as unknown as { update: (p: Record<string, unknown>) => Promise<void> }).update({ cohort_lead_ids: [LEAD, LEAD + 1] });
    T5.executions.insert({ tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: 'd-other', subject_ref: `lead:${LEAD + 1}`, lead_id: LEAD + 1, enrollment_id: null, channel: 'email', action_type: 'SEND_EMAIL', mode: 'limited', status: 'approved', created_at: AS_OF_4 });
    const r = await plan();
    if (r.status !== 'planned') throw new Error(refused(r));
    expect([r.mode, (r.receipt as unknown as { status: string; status_reason: string }).status, (r.receipt as unknown as { status_reason: string }).status_reason]).toEqual(['review', 'pending_review', 'daily_limit_reached']);
    expect(tables.proposals.rows).toHaveLength(1);
  });
});

describe('one refusal each, before anything is written', () => {
  const expectRefusal = async (d: ExecutionDecisionView, reason: string | RegExp, arrange: () => void = () => undefined) => {
    rollout();
    arrange();
    const r = await plan(d);
    if (typeof reason === 'string') expect(refused(r)).toBe(reason);
    else expect(refused(r)).toMatch(reason);
    expect(T5.executions.rows).toHaveLength(0);
    expect(tables.proposals.rows).toHaveLength(0);
    expect(refusalsLogged()).toHaveLength(1);
    expect(JSON.stringify(m.ledger.mock.calls)).not.toContain('@');
    return r;
  };

  it('a decision that is not live', async () => { await expectRefusal(decision({ mode: 'shadow' }), 'decision_not_live'); });
  it('a WAIT - never executed, and its deferrals never read (the deferral getter throws on any read)', async () => {
    const d = decision({ selected_action: 'WAIT', selected_channel: null, candidates: [], suppressed: [] });
    Object.defineProperty(d, 'deferred_actions', { get() { throw new Error('the planner read a deferral'); } });
    await expectRefusal(d, 'no_action:WAIT');
  });
  it('a live SEND_EMAIL whose deferrals are never read either', async () => {
    const d = decision();
    Object.defineProperty(d, 'deferred_actions', { get() { throw new Error('the planner read a deferral'); } });
    rollout();
    expect((await plan(d)).status).toBe('planned');
  });
  it.each([
    ['SEND_SMS on sms', { selected_action: 'SEND_SMS', selected_channel: 'sms', candidates: [{ action_type: 'SEND_SMS', campaign_key: null }] }],
    ['SCHEDULE_VOICE on voice', { selected_action: 'SCHEDULE_VOICE', selected_channel: 'voice', candidates: [{ action_type: 'SCHEDULE_VOICE', campaign_key: null }] }],
    ['SEND_EMAIL that somehow names voice', { selected_channel: 'voice' }],
  ] as Array<[string, Partial<ExecutionDecisionView>]>)('%s -> channel_not_authorized, before any row is read', async (_label, over) => {
    const findOne = jest.spyOn(T5.controls, 'findOne').mockClear();
    await expectRefusal(decision(over), 'channel_not_authorized');
    expect(findOne).not.toHaveBeenCalled();
    expect(m.contactEvidence).not.toHaveBeenCalled();
  });
  it('an action this phase cannot execute', async () => {
    await expectRefusal(decision({ selected_action: 'CREATE_HUMAN_TASK', selected_channel: 'none', candidates: [{ action_type: 'CREATE_HUMAN_TASK', campaign_key: null }] }), 'action_not_executable:CREATE_HUMAN_TASK');
  });
  it('a winner that cannot be told from another candidate (two emails, same key, neither suppressed)', async () => {
    await expectRefusal(decision({ candidates: [{ action_type: 'SEND_EMAIL', campaign_key: null }, { action_type: 'SEND_EMAIL', campaign_key: null }] }), 'selected_candidate_ambiguous');
  });
  it('acceptance 4: a reply newer than the decision', async () => {
    await expectRefusal(decision(), 'stale_decision_reply_newer', () => {
      tables.communication.insert({ lead_id: LEAD, direction: 'inbound', channel: 'email', created_at: new Date(AS_OF_4.getTime() - HOUR) });
    });
  });
  it('a reply OLDER than the decision does not stale it; an outbound message newer than it does not either', async () => {
    rollout();
    tables.communication.insert({ lead_id: LEAD, direction: 'inbound', channel: 'email', created_at: new Date(AS_OF_4.getTime() - 3 * HOUR) });
    tables.communication.insert({ lead_id: LEAD, direction: 'outbound', channel: 'email', created_at: new Date(AS_OF_4.getTime() - HOUR) });
    expect((await plan()).status).toBe('planned');
  });
  it('a decision older than 36 hours', async () => {
    await expectRefusal(decision({ created_at: new Date(AS_OF_4.getTime() - (MAX_DECISION_AGE_HOURS + 1) * HOUR) }), 'stale_decision_age');
  });
  it('the shipped flags: the ladder answers shadow, so mode_not_live', async () => {
    rollout();
    const r = await planExecution({ decision: decision(), flags: flags({ journeyExecution: false }), explorerFlags: explorerFlags(), asOf: AS_OF_4 });
    expect(refused(r)).toBe('mode_not_live:flag_execution_off');
  });
  it('the kill switch ON, and UNREADABLE', async () => {
    rollout();
    m.killSwitch.mockResolvedValue(true);
    expect(refused(await plan())).toBe('mode_not_live:kill_switch');
    m.killSwitch.mockRejectedValue(new Error('settings gone'));
    expect(refused(await plan())).toBe('mode_not_live:kill_switch_unreadable');
  });
  it('a human in the thread', async () => {
    await expectRefusal(decision(), 'human_in_conversation', () => m.contactEvidence.mockResolvedValue({ ...contact(), human_conversation: 'yes' }));
  });
  it('a consent verdict that was never checked (consent_check_error) is NOT consent', async () => {
    await expectRefusal(decision(), 'consent_unverified', () => m.contactEvidence.mockResolvedValue(contact({ email: channel(true, 'consent_check_error') })));
  });
  it('a suppression, including a complaint', async () => {
    await expectRefusal(decision(), 'complained', () => m.contactEvidence.mockResolvedValue(contact({ email: channel(false, 'complained', 'suppression') })));
  });
  it('evidence that failed closed', async () => {
    await expectRefusal(decision(), 'contact_evidence_unavailable', () => m.contactEvidence.mockResolvedValue({ ...contact(), failed_closed: true }));
  });
  it('the frequency cap and the contact cooldown - the decision\'s own policy, re-applied now', async () => {
    await expectRefusal(decision(), /^frequency_cap/, () => m.contactEvidence.mockResolvedValue({ ...contact(), recent_contact_count: 3 }));
  });
  it('a return-to-AI cooldown', async () => {
    await expectRefusal(decision(), 'returned_to_ai_cooldown', () => m.returnToAi.mockResolvedValue({ active: true, handoff_id: 'h-1', cooldown_until: new Date(AS_OF_4.getTime() + HOUR), reason: 'not_ready' }));
  });
  it('a Layer 1 email with no campaign key: campaign_not_registered', async () => {
    await expectRefusal(decision({ candidates: [{ action_type: 'SEND_EMAIL', campaign_key: null }] }), 'campaign_not_registered');
  });
  it('a flow campaign a human has not approved', async () => {
    await expectRefusal(decision(), 'campaign_not_approved', () => m.campaignFindOne.mockResolvedValue(approvedCampaign({ approval_status: 'draft' })));
  });
  it('an in-app nudge without a portal account (a lead-anchored subject)', async () => {
    await expectRefusal(decision({ selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app', candidates: [{ action_type: 'SHOW_IN_APP_NUDGE', campaign_key: null }], selected_content: { assets: [{ title: 't', url: 'u' }] } }), 'in_app_requires_enrollment', () => {
      rollout({ channel: 'in_app', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'in_app' }) });
    });
  });
  it('a B2B in-app nudge: a portal account but no approved content (its candidate carries no assets)', async () => {
    await expectRefusal(decision({ selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app', enrollment_id: 'enr-1', candidates: [{ action_type: 'SHOW_IN_APP_NUDGE', campaign_key: null }], selected_content: { assets: [] } }), 'in_app_no_approved_content', () => {
      rollout({ channel: 'in_app', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'in_app' }) });
    });
  });
  it('an in-app nudge with a portal account and approved content is planned, with no campaign', async () => {
    rollout({ channel: 'in_app', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'in_app' }) });
    const r = await plan(decision({ selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app', enrollment_id: 'enr-1', candidates: [{ action_type: 'SHOW_IN_APP_NUDGE', campaign_key: null }], selected_content: { assets: [{ title: 'Your next step', url: '/portal/next' }] } }));
    if (r.status !== 'planned') throw new Error(refused(r));
    expect(r.receipt as unknown as Record<string, unknown>).toMatchObject({ channel: 'in_app', enrollment_id: 'enr-1', campaign_id: null, campaign_key: null, sequence_id: null, status: 'pending_review' });
    expect(m.campaignFindOne).not.toHaveBeenCalled();
  });
  it('a lead that cannot be read', async () => {
    await expectRefusal(decision(), 'lead_unreadable', () => m.leadFindByPk.mockResolvedValue(null));
  });
  it('no programme on the decision', async () => {
    await expectRefusal(decision({ program_id: null }), 'no_program');
  });
});

describe('fresh, every time', () => {
  it('the evidence is re-read for every plan: the same subject, open then suppressed, is planned then refused', async () => {
    rollout();
    m.contactEvidence.mockResolvedValueOnce(contact()).mockResolvedValueOnce(contact({ email: channel(false, 'complained', 'suppression') }));
    expect((await plan(decision({ id: 'd-1', lead_id: LEAD, subject_ref: `lead:${LEAD}` }))).status).toBe('planned');
    expect(refused(await plan(decision({ id: 'd-2', lead_id: LEAD + 1, subject_ref: `lead:${LEAD + 1}` })))).toBe('complained');
    expect(m.contactEvidence).toHaveBeenCalledTimes(2);
  });

  it('a database error that is not a unique violation is logged with its class and rethrown - never a refusal, never a receipt', async () => {
    rollout();
    jest.spyOn(T5.executions, 'create').mockRejectedValueOnce(new Error('connection reset'));
    await expect(plan()).rejects.toThrow('connection reset');
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).filter((s) => s.includes('growth_journey.execution.plan_failed'));
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain('@');
    expect(refusalsLogged()).toEqual([]);
  });
});

describe('the pure checks', () => {
  it('selectedCandidateOf: the one generated candidate not in suppressed, matched to the selected action', () => {
    const edu = { action_type: 'SEND_EMAIL', campaign_key: null };
    const stalled = { action_type: 'SEND_EMAIL', campaign_key: null };
    const nudge = { action_type: 'SHOW_IN_APP_NUDGE', campaign_key: null };
    expect(selectedCandidateOf({ selected_action: 'SEND_EMAIL', candidates: [flowCandidate, nudge], suppressed: [{ ...nudge, reason: 'outranked' }] })).toEqual({ ok: true, candidate: { action_type: 'SEND_EMAIL', campaign_key: BIZ_FLOW } });
    // Two emails with the same key, one suppressed: the survivor is the winner - but which one is unknowable, and that is fine, they are the same identity.
    expect(selectedCandidateOf({ selected_action: 'SEND_EMAIL', candidates: [stalled, edu], suppressed: [{ ...edu, reason: 'outranked' }] })).toEqual({ ok: true, candidate: edu });
    expect(selectedCandidateOf({ selected_action: 'SEND_EMAIL', candidates: [stalled, edu], suppressed: [] })).toEqual({ ok: false, reason: 'selected_candidate_ambiguous' });
    expect(selectedCandidateOf({ selected_action: 'SEND_EMAIL', candidates: [nudge], suppressed: [] })).toEqual({ ok: false, reason: 'selected_candidate_ambiguous' });
    expect(selectedCandidateOf({ selected_action: 'WAIT', candidates: [edu], suppressed: [{ ...edu, reason: 'blocked' }] })).toEqual({ ok: false, reason: 'no_selected_candidate' });
    expect(selectedCandidateOf({ selected_action: null, candidates: [], suppressed: [] })).toEqual({ ok: false, reason: 'no_selected_candidate' });
  });

  it('stalenessOf: the reply check wins over the age check; neither fires on a fresh decision', () => {
    const d = { created_at: new Date(AS_OF_4.getTime() - 40 * HOUR) };
    expect(stalenessOf(d, new Date(AS_OF_4.getTime() - HOUR), AS_OF_4)).toBe('stale_decision_reply_newer');
    expect(stalenessOf(d, null, AS_OF_4)).toBe('stale_decision_age');
    expect(stalenessOf({ created_at: new Date(AS_OF_4.getTime() - HOUR) }, new Date(AS_OF_4.getTime() - 2 * HOUR), AS_OF_4)).toBeNull();
    expect(stalenessOf({ created_at: new Date(AS_OF_4.getTime() - MAX_DECISION_AGE_HOURS * HOUR) }, null, AS_OF_4)).toBeNull();
  });
});
