jest.mock('../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.ledger(...a) }));
jest.mock('../../../models', () => require('./fixtures/phase5Harness').modelsMock);
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
  isKillSwitchActiveStrict: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.killSwitchStrict(...a),
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
// Phase 5: the enrolment services, the settings and gates `evaluateSend` reads, the approval's bridge and audit, and the three transports.
jest.mock('../../sequenceService', () => ({ enrollLeadInSequence: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.enrol(...a) }));
jest.mock('../../campaignService', () => ({ enrollLeadsInCampaign: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.enrolCampaign(...a) }));
jest.mock('../../settingsService', () => ({ getSetting: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.getSetting(...a), getTestOverrides: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.testOverrides(...a) }));
jest.mock('../../consentService', () => ({ assertConsentForSend: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.consent(...a) }));
jest.mock('../../../modules/communications/brandPreferenceGate', () => ({ checkBrandPreference: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.brandPref(...a) }));
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.contextFromAdminRequest(...a) }));
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.recordAccessDecision(...a) }));
jest.mock('nodemailer', () => ({ createTransport: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.createTransport(...a) }));
jest.mock('../../ghlService', () => ({ sendSmsViaGhl: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.sms(...a) }));
jest.mock('../../synthflowService', () => ({ triggerVoiceCall: (...a: unknown[]) => require('./fixtures/phase5Harness').m5.voice(...a) }));

import { sequelize } from '../../../config/database';
import { FLOW_CAMPAIGN_KEYS } from '../execution/campaignKeys';
import { brandRow, classified, counts } from './fixtures/phase3Fixtures';
import { b2bSubject, type HandoffFixture } from './fixtures/phase4Fixtures';
import type { Query } from './fixtures/phase4Tables';
import { activeCampaign, applyStop, arrangeWorld5, AS_OF_4, clock, HOUR, m5, MINUTE, receiptsOf, rolloutRow, scheduledOf, T, T5, T5x, transitionsOf, transportCalls } from './fixtures/phase5Harness';
import { decideLive, enrol, plan, reconcile, run, sendStep } from './fixtures/phase5Drivers';

/**
 * T519 — the Phase 5 exit criterion, through the REAL chain over the Phase 5
 * world: source → classification → a live decision → plan → execute → a
 * scheduled_emails row → the real evaluateSend (hold included) → the mocked
 * transport → reconcile → completed + contact_sent. Exactly once each, across
 * two executor runs and a crash between enrolment and the receipt update; the
 * daily limit; the brand pause as the rollback. Every transport that could
 * reach a person is a spy, and the SMS and voice ones stay at zero.
 */

const BRAND = 'colaberry-enterprise' as const;
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const REPLIED = counts({ inbound: { replied: 1 } });
const qualified = (key: string): HandoffFixture =>
  b2bSubject(BRAND, key, 'I', { classification: classified(BRAND, 'workflow_automation', 'automation_request'), counts: REPLIED, expect: { state: 'QUALIFIED_OPPORTUNITY', queue: null } });
const leadOf = (f: HandoffFixture): number => f.lead!.id;
const memberCtx = () => ({ platformIdentityId: 'pid-staff', tenantId: brandRow(BRAND).tenant_id, brandId: null, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [brandRow(BRAND).tenant_id], authorizedBrandIds: null });

let sqlSpy: jest.SpyInstance;
let txSpy: jest.SpyInstance;
beforeAll(() => {
  sqlSpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
  txSpy = jest.spyOn(sequelize, 'transaction').mockImplementation(((...a: unknown[]) => m5.transaction(...a)) as never);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  sqlSpy.mockRestore();
  txSpy.mockRestore();
  jest.restoreAllMocks();
});
afterEach(() => {
  // acceptance 7, on every case: no transport is ever constructed, no SMS, no call
  expect(m5.createTransport).not.toHaveBeenCalled();
  expect(m5.sms).not.toHaveBeenCalled();
  expect(m5.voice).not.toHaveBeenCalled();
});

/** Three qualified subjects of Colaberry Business, the active flow campaign, a limited rollout on their cohort. */
function cohortWorld(size: number, dailyLimit: number): HandoffFixture[] {
  const fixtures = Array.from({ length: size }, (_, i) => qualified(`cohort-${i + 1}`));
  arrangeWorld5(fixtures);
  activeCampaign(BRAND, BIZ_FLOW);
  rolloutRow(BRAND, 'email', 'limited', { cohort_lead_ids: fixtures.map(leadOf), daily_limit: dailyLimit });
  m5.contextFromAdminRequest.mockResolvedValue(memberCtx());
  return fixtures;
}

describe('acceptance 1 - the exit criterion: a cohort of 3 executes exactly once each, across two executor runs and one crash', () => {
  it('3 transport calls, 3 completed, 3 enrolments, the ledger transitions complete - the crashed one attached by the reconciler, never enrolled twice', async () => {
    const fixtures = cohortWorld(3, 5);
    const [f1, f2, f3] = fixtures;

    // source -> classification -> a LIVE decision, through the real pipeline, for each of the three
    const rows = [];
    for (const f of fixtures) rows.push(await decideLive(f));
    expect(rows.map((r) => [r.selected_action, r.selected_channel, r.mode, r.eligibility.execution_mode.reason])).toEqual(Array(3).fill(['SEND_EMAIL', 'email', 'live', 'rollout']));

    // The crash: the receipt update AFTER the enrolment of the second lead fails twice - the `enrolled` move and the adapter's own
    // `failed` write - exactly what a lost connection leaves behind: a scheduled row, a receipt still `enrolling`.
    const original = T5.executions.update;
    let crashes = 0;
    const crash = jest.spyOn(T5.executions, 'update').mockImplementation(async (patch: Record<string, unknown>, q: Query) => {
      const target = T5.executions.rows.find((r) => r.id === (q.where as Record<string, unknown> | undefined)?.id);
      if (target?.lead_id === leadOf(f2) && crashes < 2 && (patch.status === 'enrolled' || patch.status === 'failed')) {
        crashes += 1;
        throw Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' });
      }
      return original(patch, q);
    });

    // Run 1: plan (three receipts, approved by the rollout), execute (three enrolments, one crash)
    const first = await run({ asOf: AS_OF_4 });
    crash.mockRestore();
    expect(first.plan).toMatchObject({ planned: 3 });
    expect(first.execute).toMatchObject({ candidates: 3, enrolled: 2, failed: 1 });
    expect(crashes).toBe(2);
    expect(m5.enrol).toHaveBeenCalledTimes(3);
    expect(receiptsOf(leadOf(f1))[0].status).toBe('enrolled');
    expect(receiptsOf(leadOf(f2))[0]).toMatchObject({ status: 'enrolling', attempts: 1 });
    expect(receiptsOf(leadOf(f3))[0].status).toBe('enrolled');
    expect(T5x.scheduled.rows.map((r) => [r.lead_id, r.status])).toEqual(fixtures.map((f) => [leadOf(f), 'pending']));
    expect(transportCalls()).toBe(0);

    // A second executor instance that read the crashed receipt as `approved` before the crash now tries the claim: the claim's
    // WHERE is `status = approved`, the row is `enrolling`, so it is not claimed and nothing is enrolled twice.
    expect(await enrol(String(receiptsOf(leadOf(f2))[0].id))).toEqual({ status: 'not_claimed', receiptId: String(receiptsOf(leadOf(f2))[0].id) });
    expect(m5.enrol).toHaveBeenCalledTimes(3);

    // Run 2, sixteen minutes on: the reconciler finds the crashed enrolment's row and ATTACHES it - no second enrolment.
    const later = new Date(AS_OF_4.getTime() + 16 * MINUTE);
    clock.now = later;
    const second = await run({ asOf: later });
    expect(second.plan).toMatchObject({ planned: 0, replayed: 0 });
    expect(second.execute).toMatchObject({ candidates: 0 });
    expect(m5.enrol).toHaveBeenCalledTimes(3);
    expect(receiptsOf(leadOf(f2))[0]).toMatchObject({ status: 'enrolled', status_reason: 'attached_after_interruption' });
    expect(T5x.scheduled.rows).toHaveLength(3);

    // The scheduler's send step: the real evaluateSend, then the mocked transport - once per row.
    const sent = await sendStep(later);
    expect(sent).toEqual({ sent: T5x.scheduled.rows.map((r) => String(r.id)), blocked: [] });
    expect(transportCalls()).toBe(3);
    expect(m5.sendMail.mock.calls.map((c) => (c[0] as { to: string }).to).sort()).toEqual(fixtures.map((f) => f.lead!.email).sort());

    // The reconciler: every sent row is a contact_sent outcome and the receipt settles.
    const settled = await reconcile(later);
    expect(settled.outcomes).toMatchObject({ recorded: 3 });
    expect(T5.executions.rows.map((r) => r.status)).toEqual(['completed', 'completed', 'completed']);
    expect(T.outcomes.rows.map((r) => r.outcome_type)).toEqual(['contact_sent', 'contact_sent', 'contact_sent']);
    expect(new Set(T.outcomes.rows.map((r) => r.source_ref)).size).toBe(3);

    // The ledger is complete: every receipt's chain from claim to completion, the crashed one through the attach.
    for (const f of [f1, f3]) {
      expect(transitionsOf(String(receiptsOf(leadOf(f))[0].id))).toEqual([
        ['approved', 'enrolling', 'claimed'], ['enrolling', 'enrolled', 'enrolled'], ['enrolled', 'in_progress', 'first_send_recorded'], ['in_progress', 'completed', 'sequence_settled'],
      ]);
    }
    expect(transitionsOf(String(receiptsOf(leadOf(f2))[0].id))).toEqual([
      ['approved', 'enrolling', 'claimed'], ['enrolling', 'enrolled', 'attached_after_interruption'], ['enrolled', 'in_progress', 'first_send_recorded'], ['in_progress', 'completed', 'sequence_settled'],
    ]);

    // And again: a third run plans nothing (one receipt per decision), enrols nothing, sends nothing.
    const third = await run({ asOf: later });
    expect([third.plan.planned, third.execute.candidates, m5.enrol.mock.calls.length, transportCalls()]).toEqual([0, 0, 3, 3]);
    expect((await sendStep(later)).sent).toEqual([]);
    expect(JSON.stringify(T5x.ledger.rows)).not.toContain('@');
  });
});

describe('acceptance 2 - the daily limit', () => {
  it('a fourth cohort decision on a daily_limit 3 day plans as REVIEW (a proposal, not a release); the three in flight still send', async () => {
    const fixtures = cohortWorld(4, 3);
    const rows = [];
    for (const f of fixtures) rows.push(await decideLive(f));
    expect(rows.every((r) => r.eligibility.execution_mode.reason === 'rollout')).toBe(true); // at decision time nothing had been spent

    const first = await run({ asOf: AS_OF_4 });
    expect(first.plan).toMatchObject({ planned: 4 });
    const fourth = receiptsOf(leadOf(fixtures[3]))[0];
    expect(fourth).toMatchObject({ mode: 'review', status: 'pending_review', status_reason: 'daily_limit_reached' });
    expect(T5x.proposals.rows.map((p) => [p.target_id, p.status])).toEqual([[fourth.id, 'pending']]);
    expect(fixtures.slice(0, 3).map((f) => receiptsOf(leadOf(f))[0].status)).toEqual(['enrolled', 'enrolled', 'enrolled']);
    expect(first.execute).toMatchObject({ candidates: 3, enrolled: 3 });

    const sent = await sendStep(AS_OF_4);
    expect(sent.sent).toHaveLength(3);
    expect(sent.blocked).toEqual([]);
    expect(transportCalls()).toBe(3);
    expect(scheduledOf(leadOf(fixtures[3]))).toEqual([]);

    // The proposal is a human's to approve; nothing releases it - a second run leaves it pending and sends nothing more.
    const second = await run({ asOf: AS_OF_4 });
    expect([second.plan.planned, second.execute.candidates, transportCalls()]).toEqual([0, 0, 3]);
    expect(receiptsOf(leadOf(fixtures[3]))[0].status).toBe('pending_review');
  });
});

describe('acceptance 3 - the rollback: a brand pause mid-run', () => {
  it('blocks every unsent step with journey_hold:pause:brand; clearing it lets only newly planned decisions proceed; cancelled rows stay cancelled', async () => {
    // Four subjects in the cohort; the fourth is decided only once the pause is cleared.
    const all = cohortWorld(4, 5);
    const fixtures = all.slice(0, 3);
    const f4 = all[3];
    const rows = [];
    for (const f of fixtures) rows.push(await decideLive(f));
    const first = await run({ asOf: AS_OF_4 });
    expect(first.execute).toMatchObject({ enrolled: 3 });
    expect(T5x.scheduled.rows.every((r) => r.status === 'pending')).toBe(true);

    // The pause lands between enrolment and the send.
    const pause = applyStop('pause:brand', BRAND, 'email', `lead:${leadOf(fixtures[0])}`)!;
    const held = await sendStep(AS_OF_4);
    expect(held.sent).toEqual([]);
    expect(held.blocked.map((b) => b.reason)).toEqual(['journey_hold:pause:brand', 'journey_hold:pause:brand', 'journey_hold:pause:brand']);
    expect(transportCalls()).toBe(0);
    expect(T5x.scheduled.rows.map((r) => [r.status, (r.metadata as { blocked_reason: string }).blocked_reason])).toEqual(Array(3).fill(['cancelled', 'journey_hold:pause:brand']));

    const settled = await reconcile(AS_OF_4);
    expect(settled.outcomes).toMatchObject({ recorded: 3 });
    expect(T5.executions.rows.map((r) => [r.status, r.status_reason])).toEqual(Array(3).fill(['blocked', 'blocked:journey_hold:pause:brand']));
    expect(T.outcomes.rows.map((r) => [r.outcome_type, (r.metadata as { blocked_reason: string }).blocked_reason])).toEqual(Array(3).fill(['contact_blocked', 'journey_hold:pause:brand']));
    for (const f of fixtures) expect(transitionsOf(String(receiptsOf(leadOf(f))[0].id)).at(-1)).toEqual(['enrolled', 'blocked', 'blocked:journey_hold:pause:brand']);

    // The pause is cleared. The three decisions already have their (terminal) receipts: a re-plan replays, nothing new is written,
    // the cancelled rows stay cancelled - and a NEW decision, for a fourth subject decided now, proceeds.
    await T5.controls.update({ cleared_at: AS_OF_4, cleared_by_admin_id: 'admin:fixture' }, { where: { id: pause.id } });
    for (const row of rows) expect(await plan(row, { asOf: AS_OF_4 })).toMatchObject({ status: 'replayed' });
    expect(T5.executions.rows).toHaveLength(3);
    expect(T5x.scheduled.rows.every((r) => r.status === 'cancelled')).toBe(true);

    const later = new Date(AS_OF_4.getTime() + HOUR);
    clock.now = later;
    await decideLive(f4, { asOf: later });
    const second = await run({ asOf: later });
    expect(second.plan).toMatchObject({ planned: 1, replayed: 0 });
    expect(second.execute).toMatchObject({ candidates: 1, enrolled: 1 });
    const sent = await sendStep(later);
    expect(sent.sent).toHaveLength(1);
    expect(sent.blocked).toEqual([]);
    expect(transportCalls()).toBe(1);
    expect(m5.sendMail.mock.calls[0][0]).toMatchObject({ to: f4.lead!.email });
    await reconcile(later);
    expect(T5.executions.rows.map((r) => [r.lead_id, r.status])).toEqual([...fixtures.map((f) => [leadOf(f), 'blocked']), [leadOf(f4), 'completed']]);
    expect(T5x.scheduled.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled', 'cancelled', 'sent']);
  });
});
