const mockKillSwitchStrict = jest.fn();
jest.mock('../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.ledger(...a) }));
jest.mock('../../../models', () => ({ ...require('./fixtures/phase4Harness').modelsMock, ...require('./fixtures/phase5Tables').phase5ModelsMock }));
jest.mock('../../../models/BrandOfferPolicy', () => require('./fixtures/phase3Harness').policyModelMock);
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveSubject(...a) }));
jest.mock('../governor/contactEvidence', () => ({
  ...jest.requireActual('../governor/contactEvidence'),
  resolveContactEvidence: (...a: unknown[]) => require('./fixtures/phase4Harness').resolveContactEvidence(...a),
}));
jest.mock('../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLifecycleSourceCounts(...a) }));
jest.mock('../strategies/learnerFacts', () => ({ loadLearnerFacts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLearnerFacts(...a) }));
jest.mock('../profileService', () => ({ upsertProfile: (...a: unknown[]) => require('./fixtures/phase3Harness').m.upsertProfile(...a) }));
jest.mock('../classificationService', () => ({
  ...jest.requireActual('../classificationService'),
  latestClassification: (...a: unknown[]) => require('./fixtures/phase3Harness').m.classificationFindOne(...a),
}));
jest.mock('../outcomes/nightlyOutcomesPass', () => ({ runOutcomesPass: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.outcomesPass(...a) }));
jest.mock('../../ticketService', () => ({ createTicket: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.createTicket(...a) }));
jest.mock('../../launchSafety', () => ({
  ...jest.requireActual('../../launchSafety'),
  isKillSwitchActive: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.killSwitch(...a),
  isKillSwitchActiveStrict: (...a: unknown[]) => mockKillSwitchStrict(...a),
}));
jest.mock('../../agentBlueprint/agentIdentitySeed', () => ({ seedAgentIdentity: jest.fn(), getAgentAdminUserId: jest.fn() }));
jest.mock('../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  ...jest.requireActual('../../agentBlueprint/ticketCreatorIdentitySeed'),
  getTicketCreatorAdminUserId: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.creatorId(...a),
}));
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  ...jest.requireActual('../../../modules/tenancy/leadContextService'),
  ensureLeadTenantContext: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.ensureContext(...a),
}));
jest.mock('../../../modules/tenancy/tenantResolver', () => ({ resolveBrandBySlug: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.resolveBrandBySlug(...a) }));
jest.mock('../../pipelineService', () => ({ ...jest.requireActual('../../pipelineService'), advancePipelineStage: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.advanceStage(...a) }));
jest.mock('../../delivery/leadConversion', () => ({ convertLeadToClient: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.convertLead(...a) }));

import type { ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { sequelize } from '../../../config/database';
import { anchorOf4, AS_OF_4, arrangeWorld, flags4 } from './fixtures/phase4Harness';
import { m, persisted } from './fixtures/phase3Harness';
import { brandRow, classified, counts, programRow } from './fixtures/phase3Fixtures';
import { b2bSubject, exitTwins, flotationTrainingScenarios, humanInThreadSubject, learnerScenarios, programmeScenarios, replyOnlySubject, samePersonTwoBrands, twoTriggerSubject, type HandoffFixture } from './fixtures/phase4Fixtures';
import { T5, resetPhase5Tables } from './fixtures/phase5Tables';
import { decideForSubjectAndRecord, decisionRow, runShadowDecisions, type DecideAndRecordArgs } from '../decisionService';
import { executionChannelOf, resolveDecisionExecutionMode, withExecutionMode, LIVE_MODES, type ExecutionModeStamp } from '../decision/executionModeStamp';
import { rolloutScopeKey } from '../execution/scopeKey';
import { computeIdempotencyKey } from '../../inboxCase/textNormalization';
import { bizCtx } from './fixtures/b2bFixtures';

/**
 * T507 — the decision row says whether it may execute.
 *
 * Through the REAL pipeline over the Phase 4 world, with T503's control table
 * in it: under the shipped flags every row is shadow and keeps the key it has
 * always had; with `journeyExecution` on and a `limited` rollout, a cohort
 * subject's SEND_EMAIL is `live` on a NEW key, a non-cohort subject's stays
 * shadow with `not_in_cohort` - on the same key as before, so the flag alone
 * never re-decides anyone - and a replay of a live decision writes no second
 * row. WAIT never executes. The ladder that cannot be read leaves the row in
 * shadow with the error named. `b2bCandidates.flows`/`flowRuns.phase5` own the
 * candidate; this suite owns the stamp.
 */

const sqlSpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
const BRAND = 'colaberry-enterprise' as const;
const REPLIED = counts({ inbound: { replied: 1 } });

const executionOn = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => flags4({ journeyExecution: true, ...over });
const explorerFlags = (over: Partial<ExplorerGrowthFlags> = {}): ExplorerGrowthFlags => ({
  growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false,
  aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false, ...over,
} as ExplorerGrowthFlags);

const qualifiedBusiness = (): HandoffFixture =>
  b2bSubject(BRAND, 'mode-qualified', 'I', { classification: classified(BRAND, 'workflow_automation', 'automation_request'), counts: REPLIED, expect: { state: 'QUALIFIED_OPPORTUNITY', queue: null } });
const approvedBizFlow = () => ({ id: 'c-biz-flow', tenant_id: brandRow(BRAND).tenant_id, brand_id: brandRow(BRAND).id, status: 'draft', approval_status: 'approved', sequence_id: 's-biz-flow' });

const rollout = (over: Record<string, unknown> = {}) => T5.controls.insert({
  tenant_id: brandRow(BRAND).tenant_id, kind: 'rollout', brand_id: brandRow(BRAND).id, program_id: programRow(BRAND).id, channel: 'email', subject_ref: null,
  scope_key: rolloutScopeKey({ brandId: brandRow(BRAND).id, programId: programRow(BRAND).id, channel: 'email' }),
  mode: 'limited', cohort_lead_ids: [], daily_limit: 3, cleared_at: null, ...over,
});

type Recorded = Extract<Awaited<ReturnType<typeof decideForSubjectAndRecord>>, { status: 'recorded' }>;
async function decide(f: HandoffFixture, over: Partial<DecideAndRecordArgs> = {}): Promise<Recorded> {
  const r = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), explorerFlags: explorerFlags(), asOf: AS_OF_4, ...over });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return r;
}
const stampOf = (r: Recorded): ExecutionModeStamp => (r.row.eligibility as { execution_mode: ExecutionModeStamp }).execution_mode;

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
beforeEach(() => {
  resetPhase5Tables();
  mockKillSwitchStrict.mockReset().mockResolvedValue(false);
});
afterAll(() => {
  sqlSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('under the shipped flags, every row is shadow', () => {
  it('a SEND_EMAIL through an approved flow is recorded shadow, with the ladder\'s reason (the execution flag) on the row, and no control row read', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const findOne = jest.spyOn(T5.controls, 'findOne').mockClear(); // the spy outlives the test that first installed it
    const r = await decide(f);
    expect([r.row.selected_action, r.row.mode]).toEqual(['SEND_EMAIL', 'shadow']);
    expect(stampOf(r)).toEqual({ mode: 'shadow', reason: 'flag_execution_off', resolved: 'shadow', channel: 'email', control_ids: [] });
    expect(findOne).not.toHaveBeenCalled();
    expect(mockKillSwitchStrict).not.toHaveBeenCalled();
    expect(JSON.stringify(r.row)).not.toContain('@');
  });

  it('acceptance 1, swept: every subject in the Phase 4 catalogue - learners, both B2B brands, twins, the human-in-thread case - is recorded shadow, for a flag-off or no-action reason, and the ladder reads no row', async () => {
    // The approved Colaberry Business flow is offered to every subject: only that brand's qualified subjects take it (the
    // approved-flow fixture and G-reply-only), which is the SEND_EMAIL the shipped pipeline can reach; nothing else executes.
    const catalogue = [qualifiedBusiness(), ...learnerScenarios(), ...programmeScenarios(), ...flotationTrainingScenarios(), ...exitTwins(), twoTriggerSubject(), replyOnlySubject(), ...samePersonTwoBrands(), humanInThreadSubject()];
    const findOne = jest.spyOn(T5.controls, 'findOne').mockClear();
    const seen: Array<[string, string | null, string]> = [];
    for (const f of catalogue) {
      arrangeWorld([f]);
      m.campaignFindOne.mockResolvedValue(approvedBizFlow());
      const r = await decide(f);
      expect([f.key, r.row.mode]).toEqual([f.key, 'shadow']);
      expect([f.key, stampOf(r).mode]).toEqual([f.key, 'shadow']);
      expect([f.key, stampOf(r).reason]).toEqual([f.key, expect.stringMatching(/^(flag_execution_off|no_action:(WAIT|SUPPRESS_CONTACT)|action_not_executable:[A-Z_]+)$/)]);
      seen.push([f.key, r.row.selected_action ?? null, stampOf(r).reason]);
    }
    expect(seen.length).toBeGreaterThanOrEqual(12);
    // Non-vacuity: the sweep reached both an executable action (the ladder answered, flag off) and a WAIT.
    const emails = seen.filter(([, action, reason]) => action === 'SEND_EMAIL' && reason === 'flag_execution_off').map(([key]) => key);
    expect(emails).toEqual(['colaberry-enterprise/mode-qualified', 'colaberry-enterprise/G-reply-only']);
    expect(seen.some(([, action]) => action === 'WAIT')).toBe(true);
    expect(findOne).not.toHaveBeenCalled();
    expect(mockKillSwitchStrict).not.toHaveBeenCalled();
  });

  it('a WAIT is shadow whatever the flags and rollout say, and the ladder is never asked', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    rollout({ cohort_lead_ids: [f.subject.lead_id] });
    const r = await decide(f, { flags: executionOn() });
    expect([r.row.selected_action, r.row.mode]).toEqual(['WAIT', 'shadow']);
    expect(stampOf(r)).toEqual({ mode: 'shadow', reason: 'no_action:WAIT', resolved: null, channel: null, control_ids: [] });
    expect(mockKillSwitchStrict).not.toHaveBeenCalled();
  });
});

describe('the flip: flag on with a limited rollout', () => {
  it('the same subject: shadow under the shipped flags; shadow `not_in_cohort` on the SAME key once the flag is on; live on a NEW key once in the cohort; a replay writes no second row', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());

    const shipped = await decide(f);
    expect([shipped.replayed, shipped.row.mode, stampOf(shipped).reason]).toEqual([false, 'shadow', 'flag_execution_off']);

    // Flag on, rollout present, this lead NOT in the cohort: still shadow - and the key did not move, so this is a replay.
    const ctl = rollout({ cohort_lead_ids: [f.subject.lead_id! + 1] });
    const outside = await decide(f, { flags: executionOn() });
    expect([outside.replayed, outside.row.mode, outside.row.idempotency_key]).toEqual([true, 'shadow', shipped.row.idempotency_key]);

    // The cohort now names the lead: live, on a key derived from the shadow key - a new row, with the rollout row named.
    await (ctl as unknown as { update: (p: Record<string, unknown>) => Promise<void> }).update({ cohort_lead_ids: [f.subject.lead_id] });
    const live = await decide(f, { flags: executionOn() });
    expect([live.replayed, live.row.selected_action, live.row.mode]).toEqual([false, 'SEND_EMAIL', 'live']);
    expect(stampOf(live)).toEqual({ mode: 'live', reason: 'rollout', resolved: 'limited', channel: 'email', control_ids: [ctl.id] });
    expect(live.row.idempotency_key).toBe(computeIdempotencyKey([shipped.row.idempotency_key, 'live']));
    expect(live.row.executed).toBe(false);

    // Acceptance 3: the same live decision again lands on its own row.
    const again = await decide(f, { flags: executionOn() });
    expect([again.replayed, again.row.id, again.row.mode]).toEqual([true, live.row.id, 'live']);
  });

  it('a non-cohort subject stays shadow with the reason `not_in_cohort` and the rollout row named', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const ctl = rollout({ cohort_lead_ids: [f.subject.lead_id! + 1] });
    const r = await decide(f, { flags: executionOn() });
    expect([r.row.selected_action, r.row.mode]).toEqual(['SEND_EMAIL', 'shadow']);
    expect(stampOf(r)).toEqual({ mode: 'shadow', reason: 'not_in_cohort', resolved: 'shadow', channel: 'email', control_ids: [ctl.id] });
  });

  it('a rollout in review mode makes the row live with `review` resolved - prepared for a human, released by nobody', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const ctl = rollout({ mode: 'review', cohort_lead_ids: null, daily_limit: null });
    const r = await decide(f, { flags: executionOn() });
    expect(stampOf(r)).toEqual({ mode: 'live', reason: 'rollout', resolved: 'review', channel: 'email', control_ids: [ctl.id] });
    expect(r.row.mode).toBe('live');
  });

  it.each([
    ['the kill switch ON', () => mockKillSwitchStrict.mockResolvedValue(true), 'kill_switch'],
    ['the kill switch UNREADABLE', () => mockKillSwitchStrict.mockRejectedValue(new Error('settings table gone')), 'kill_switch_unreadable'],
  ])('%s: the cohort subject is shadow, `off` resolved, the reason on the row', async (_label, arrange, reason) => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    rollout({ cohort_lead_ids: [f.subject.lead_id] });
    arrange();
    const r = await decide(f, { flags: executionOn() });
    expect([r.row.mode, stampOf(r).mode, stampOf(r).resolved, stampOf(r).reason]).toEqual(['shadow', 'shadow', 'off', reason]);
  });

  it('a ladder that cannot be read (the controls table throws) leaves the row recorded in SHADOW with the error class named - never live', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    rollout({ cohort_lead_ids: [f.subject.lead_id] });
    jest.spyOn(T5.controls, 'findAll').mockRejectedValueOnce(new Error('connection reset'));
    const r = await decide(f, { flags: executionOn() });
    expect([r.replayed, r.row.selected_action, r.row.mode]).toEqual([false, 'SEND_EMAIL', 'shadow']);
    expect(stampOf(r)).toMatchObject({ mode: 'shadow', resolved: null, channel: 'email', control_ids: [] });
    expect(stampOf(r).reason).toMatch(/^execution_mode_unavailable:/);
    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).filter((s) => s.includes('growth_journey.decision.execution_mode_unavailable'));
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain('@');
  });
});

describe('the batch runner hands the Explorer family down - the hop the T507 verifier found unpinned', () => {
  // A B2B subject in an exploring state with a portal account and its email paused: the in-app nudge is the only candidate,
  // and in_app is a channel whose ladder answer depends on the Explorer family - so a dropped pass-through is visible.
  const nudgeSubject = (): HandoffFixture => {
    const f = b2bSubject(BRAND, 'mode-nudge', 'I', { classification: classified(BRAND, 'workflow_automation', 'automation_request'), contact: 'email_paused', expect: { state: 'EXPLORING_SOLUTIONS', queue: null } });
    // Enrollment-anchored: the world carries a portal account only for an enrollment anchor.
    return { ...f, anchor: { enrollmentId: 'enr-mode-nudge' }, subject: { ...f.subject, enrollment_id: 'enr-mode-nudge' } };
  };
  type Persisted = { selected_action: string; mode: string; eligibility: { execution_mode: ExecutionModeStamp } };
  const rows = () => [...persisted.values()] as unknown as Persisted[];

  it('runShadowDecisions over the nudge subject: shadow `explorer_flag_off:inAppNudge` with the sub-flag off in the family handed in, live on a new row once it is on', async () => {
    const f = nudgeSubject();
    arrangeWorld([f]);
    rollout({ channel: 'in_app', scope_key: rolloutScopeKey({ brandId: brandRow(BRAND).id, programId: programRow(BRAND).id, channel: 'in_app' }), mode: 'review', cohort_lead_ids: null, daily_limit: null });
    const run = (family: ExplorerGrowthFlags) => runShadowDecisions({ brandId: brandRow(BRAND).id, trigger: 'nightly', flags: executionOn(), explorerFlags: family, asOf: AS_OF_4 });

    const off = await run(explorerFlags({ inAppNudgeEnabled: false }));
    expect(off).toMatchObject({ status: 'ran', subjects: 1, recorded: 1, replayed: 0, errors: [] });
    expect(rows()).toHaveLength(1);
    expect([rows()[0].selected_action, rows()[0].mode, rows()[0].eligibility.execution_mode]).toEqual(['SHOW_IN_APP_NUDGE', 'shadow', { mode: 'shadow', reason: 'explorer_flag_off:inAppNudge', resolved: 'shadow', channel: 'in_app', control_ids: [] }]);

    const on = await run(explorerFlags({ inAppNudgeEnabled: true }));
    expect(on).toMatchObject({ status: 'ran', subjects: 1, recorded: 1, replayed: 0, errors: [] });
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).toMatchObject({ selected_action: 'SHOW_IN_APP_NUDGE', mode: 'live', eligibility: { execution_mode: { mode: 'live', reason: 'rollout', resolved: 'review', channel: 'in_app' } } });
  });
});

describe('the stamp, at the unit', () => {
  it('maps the action to the channel the ladder is asked about; WAIT and SUPPRESS_CONTACT are never executed; sms/voice pass through to be refused by name', () => {
    expect(executionChannelOf({ selected_action: 'SEND_EMAIL', selected_channel: 'email' })).toEqual({ channel: 'email' });
    expect(executionChannelOf({ selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app' })).toEqual({ channel: 'in_app' });
    expect(executionChannelOf({ selected_action: 'SEND_ALI_OUTREACH', selected_channel: 'email' })).toEqual({ channel: 'ali_outreach' });
    expect(executionChannelOf({ selected_action: 'SEND_SMS', selected_channel: 'sms' })).toEqual({ channel: 'sms' });
    expect(executionChannelOf({ selected_action: 'SEND_EMAIL', selected_channel: 'voice' })).toEqual({ channel: 'voice' });
    expect(executionChannelOf({ selected_action: 'WAIT', selected_channel: null })).toEqual({ channel: null, reason: 'no_action:WAIT' });
    expect(executionChannelOf({ selected_action: 'SUPPRESS_CONTACT', selected_channel: 'none' })).toEqual({ channel: null, reason: 'no_action:SUPPRESS_CONTACT' });
    expect(executionChannelOf({ selected_action: 'CREATE_HUMAN_TASK', selected_channel: 'none' })).toEqual({ channel: null, reason: 'action_not_executable:CREATE_HUMAN_TASK' });
    expect(executionChannelOf({ selected_action: 'RECOMMEND_LESSON', selected_channel: 'in_app' })).toEqual({ channel: null, reason: 'action_not_executable:RECOMMEND_LESSON' });
    expect(LIVE_MODES).toEqual(['review', 'limited']);
  });

  it('withExecutionMode is pure: a shadow stamp keeps the mode and the key byte for byte; a live stamp derives the key; the input row is untouched', () => {
    const ctx = bizCtx({ state: 'QUALIFIED_OPPORTUNITY' });
    const loaded = { ctx, strategy: {}, lifecycle: { projected: false }, unavailable: [] } as never;
    const decision = { selected_action: 'SEND_EMAIL', selected_path: null, selected_channel: 'email', selected_content: null, candidates: [], suppressed: [], deferred_actions: [], eligibility: {}, content_gaps: [], reason: 'x', requires_human_review: false, ai_involved: false, ruleset_version: 'p3-business-v1', model_version: null } as never;
    const row = decisionRow(loaded, decision, 'nightly', []);
    const before = JSON.stringify(row);
    const shadow: ExecutionModeStamp = { mode: 'shadow', reason: 'flag_execution_off', resolved: 'shadow', channel: 'email', control_ids: [] };
    const s = withExecutionMode(row, shadow);
    expect([s.mode, s.idempotency_key]).toEqual(['shadow', row.idempotency_key]);
    expect(s.eligibility).toEqual({ ...row.eligibility, execution_mode: shadow });
    const l = withExecutionMode(row, { ...shadow, mode: 'live', reason: 'rollout', resolved: 'limited', control_ids: ['ctl-1'] });
    expect([l.mode, l.idempotency_key]).toEqual(['live', computeIdempotencyKey([row.idempotency_key, 'live'])]);
    expect(l.idempotency_key).not.toBe(row.idempotency_key);
    expect(JSON.stringify(row)).toBe(before);
  });

  it('the ladder is asked with the decision\'s own scope: an in-app nudge is shadow while its Explorer sub-flag is off, live once it is on with a rollout for in_app', async () => {
    const ctx = { tenant_id: brandRow(BRAND).tenant_id, brand_id: brandRow(BRAND).id, program_id: programRow(BRAND).id, subject_ref: 'lead:501', lead_id: 501, asOf: AS_OF_4 };
    const decision = { selected_action: 'SHOW_IN_APP_NUDGE', selected_channel: 'in_app' as const };
    const off = await resolveDecisionExecutionMode({ ctx, decision, flags: executionOn(), explorerFlags: explorerFlags({ inAppNudgeEnabled: false }) });
    expect(off).toEqual({ mode: 'shadow', reason: 'explorer_flag_off:inAppNudge', resolved: 'shadow', channel: 'in_app', control_ids: [] });
    const ctl = rollout({ channel: 'in_app', scope_key: rolloutScopeKey({ brandId: ctx.brand_id, programId: ctx.program_id, channel: 'in_app' }), cohort_lead_ids: [501] });
    const on = await resolveDecisionExecutionMode({ ctx, decision, flags: executionOn(), explorerFlags: explorerFlags() });
    expect(on).toEqual({ mode: 'live', reason: 'rollout', resolved: 'limited', channel: 'in_app', control_ids: [ctl.id] });
  });

  it('sms and voice are refused by name before any row is read; Ali outreach is capped at review even under a limited rollout; no programme means no rollout', async () => {
    const ctx = { tenant_id: brandRow(BRAND).tenant_id, brand_id: brandRow(BRAND).id, program_id: programRow(BRAND).id, subject_ref: 'lead:501', lead_id: 501, asOf: AS_OF_4 };
    const findOne = jest.spyOn(T5.controls, 'findOne').mockClear(); // the spy outlives the test that first installed it
    for (const selected_channel of ['sms', 'voice'] as const) {
      const r = await resolveDecisionExecutionMode({ ctx, decision: { selected_action: 'SEND_EMAIL', selected_channel }, flags: executionOn(), explorerFlags: explorerFlags() });
      expect(r).toEqual({ mode: 'shadow', reason: 'channel_not_authorized', resolved: 'off', channel: selected_channel, control_ids: [] });
    }
    expect(findOne).not.toHaveBeenCalled();
    const ctl = rollout({ channel: 'ali_outreach', scope_key: rolloutScopeKey({ brandId: ctx.brand_id, programId: ctx.program_id, channel: 'ali_outreach' }), cohort_lead_ids: [501] });
    const ali = await resolveDecisionExecutionMode({ ctx, decision: { selected_action: 'SEND_ALI_OUTREACH', selected_channel: 'email' }, flags: executionOn(), explorerFlags: explorerFlags() });
    expect(ali).toEqual({ mode: 'live', reason: 'review_only_channel', resolved: 'review', channel: 'ali_outreach', control_ids: [ctl.id] });
    const none = await resolveDecisionExecutionMode({ ctx: { ...ctx, program_id: null }, decision: { selected_action: 'SEND_EMAIL', selected_channel: 'email' }, flags: executionOn(), explorerFlags: explorerFlags() });
    expect(none).toEqual({ mode: 'shadow', reason: 'no_program', resolved: null, channel: 'email', control_ids: [] });
  });
});
