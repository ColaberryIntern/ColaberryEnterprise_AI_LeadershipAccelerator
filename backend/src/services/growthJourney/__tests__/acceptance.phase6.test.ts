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
import { journeyAutoReplySkip } from '../execution/autoReplyGuard';
import { ALI_OUTREACH_CAMPAIGN_KEY } from '../execution/campaignKeys';
import { recordReplyOutcome } from '../execution/replyOutcome';
import { redecideOnReply } from '../execution/replyRedecide';
import type { JourneyCandidate } from '../governor/types';
import { acceptHandoff, dispositionHandoff } from '../handoffs/dispositionService';
import { loadPersonJourney } from '../personJourneyService';
import { runScheduledShadowDecisions } from '../runShadowDecisionsNightly';
import { brandRow } from './fixtures/phase3Fixtures';
import { learnerScenarios } from './fixtures/phase4Fixtures';
import { handoffsOf, printTable, tally, writes } from './fixtures/phase4Harness';
import { activeCampaign, applyStop, AS_OF_4, campaignByKey, clock, explorerFlags5, flags5, HOUR, m3, m5, receiptsOf, refusalsOf, rolloutRow, sendStopReason, STOPS, T, T5, T5x, transitionsOf, transportCalls, type StopKind } from './fixtures/phase5Harness';
import { approve, decide, decideLive, decideWithCandidates, enrol, plan, reconcile, sendStep } from './fixtures/phase5Drivers';
import { arrive, candidatesOf, later, leadOf, learnerAssets, note, table, throughTransport, world, type Row } from './fixtures/phase6Drivers';
import { BIZ_FLOW, foreignCtx, HUMAN, LEARNER_RESTART_KEY, memberCtxFor, scenarioA, scenarioB, scenarioBSend, scenarioC, scenarioD, scenarioE, scenarioF, scenarioH, scenarioJ, scenarioL, speaksForAService } from './fixtures/phase6Scenarios';

/**
 * T601 — §16 A–L, end to end, for the brand the brief names, through the REAL
 * chain over the Phase 5 world: the Phase 2 ladder on the arrival → the
 * governor → the Phase 4 handoff → the Phase 5 plan, approval, enrolment,
 * send-time hold and mocked transport. The demo table at the end is the
 * script the brief asks for. Nothing here reaches a real transport.
 */


let sqlSpy: jest.SpyInstance;
let txSpy: jest.SpyInstance;
beforeAll(() => {
  // The one raw read the chain makes: Explorer's content registry. It answers with the world's declared learner assets.
  sqlSpy = jest.spyOn(sequelize, 'query').mockImplementation((async (sql: unknown) => (typeof sql === 'string' && sql.includes('FROM explorer_content_assets') ? [...learnerAssets()] : [])) as never);
  txSpy = jest.spyOn(sequelize, 'transaction').mockImplementation(((...a: unknown[]) => m5.transaction(...a)) as never);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  printTable('Phase 6 §16 A–L — fixture → queue → status → assigned → execution', table);
  sqlSpy.mockRestore();
  txSpy.mockRestore();
  jest.restoreAllMocks();
});
afterEach(() => {
  expect(m5.createTransport).not.toHaveBeenCalled();
  expect(m5.sms).not.toHaveBeenCalled();
  expect(m5.voice).not.toHaveBeenCalled();
  clock.now = AS_OF_4;
});


/* ── A ───────────────────────────────────────────────────────────────────────── */

describe('A - a CPN free-training signup', () => {
  it('keeps CPN attribution, is decided under CPN\'s learner programme with no service candidate, and can never enrol into a Training campaign', async () => {
    const s = scenarioA();
    world([s]);
    const arrived = await arrive(s);
    expect(arrived.signals.source_step).toBe(3);
    rolloutRow('cpn', 'email', 'review');
    // Explorer's own campaign, registered where it belongs: under Colaberry Training. CPN may never reach it.
    activeCampaign('colaberry-training', LEARNER_RESTART_KEY);
    const { row } = await decide(s.fixture);
    expect(row.brand_id).toBe(brandRow('cpn').id);
    expect(row.state_at_decision).toBe(s.fixture.expect.state);
    expect(candidatesOf(row).some(speaksForAService)).toBe(false);
    expect(handoffsOf(s.fixture)).toEqual([]);
    expect([row.selected_action, row.selected_channel, row.mode]).toEqual(['SEND_EMAIL', 'email', 'live']);
    // Under CPN, Explorer's activation email carries NO campaign key - the key is Training's; the planner refuses it by name.
    expect(candidatesOf(row).find((c) => c.action_type === 'SEND_EMAIL')?.campaign_key).toBeNull();
    expect(await plan(row)).toEqual({ status: 'refused', reason: 'campaign_not_registered', channel: 'email' });
    expect(receiptsOf(leadOf(s.fixture))).toEqual([]);
    expect(refusalsOf(String(row.id))).toEqual(['campaign_not_registered']);
    expect(transportCalls()).toBe(0);
    note(s.fixture, `refused:${(s.execution as { reason: string }).reason}`);
  });
});

/* ── the letters on the Phase 4 learner fixtures ────────────────────────────── */

describe('the Phase 4 learner fixtures carry the brief\'s letters', () => {
  it('every CPN fixture is A and every Colaberry Training fixture is B - the labels Phase 4 had swapped', () => {
    const rows = learnerScenarios().map((f) => [f.brand, f.scenario, f.key.split('/')[1].split('-')[0]]);
    expect(rows).toHaveLength(4);
    for (const [brand, scenario, prefix] of rows) {
      expect([scenario, prefix]).toEqual(brand === 'cpn' ? ['A', 'A'] : ['B', 'B']);
    }
  });
});

/* ── B ───────────────────────────────────────────────────────────────────────── */

describe('B - a Colaberry Training explorer', () => {
  it('enrolment-ready in conversation escalates to admissions; activating does not, and never proposes the enrolment offer', async () => {
    const { ready, activating } = scenarioB();
    world([ready, activating]);
    const r = await decide(ready.fixture);
    expect(r.row.state_at_decision).toBe('ENROLLMENT_READY');
    expect(handoffsOf(ready.fixture).map((h) => h.owner_queue)).toEqual(['admissions']);
    const a = await decide(activating.fixture);
    expect(a.row.state_at_decision).toBe('ACTIVATING');
    expect(handoffsOf(activating.fixture)).toEqual([]);
    expect(candidatesOf(a.row).map((c) => c.action_type)).not.toContain('SEND_ENROLLMENT_OFFER');
    note(ready.fixture, '-');
    note(activating.fixture, '-');
  });

  it('the recovery email goes through the real chain once: planned for review, approved, enrolled into Explorer\'s registered campaign, sent, completed', async () => {
    const s = scenarioBSend();
    world([s]);
    rolloutRow('colaberry-training', 'email', 'review');
    activeCampaign('colaberry-training', LEARNER_RESTART_KEY);
    const row = await decideLive(s.fixture);
    const selected = candidatesOf(row).find((c) => c.action_type === row.selected_action)!;
    expect([row.selected_action, selected.campaign_key]).toEqual(['SEND_EMAIL', LEARNER_RESTART_KEY]);
    expect(speaksForAService(selected)).toBe(false);
    await throughTransport(row, s.fixture, selected.campaign_key!);
    note(s.fixture, 'completed');
  });
});

/* ── C, D, E: the programme's queue, the human's disposition, the existing systems ── */

describe('C - Colaberry Business, training for 50 employees', () => {
  it('Business Training, the sales queue, and the account, context and pipeline only on a human\'s qualified', async () => {
    const s = scenarioC();
    world([s]);
    await arrive(s);
    const { row } = await decide(s.fixture);
    expect([row.state_at_decision, row.selected_action]).toEqual(['DISCOVERY_READY', 'WAIT']);
    const [handoff] = handoffsOf(s.fixture) as Row[];
    expect(handoff).toMatchObject({ owner_queue: 'sales', status: 'assigned' });
    expect(tally()).toMatchObject({ organizations: 0, pipeline_advances: 0 });
    await acceptHandoff(handoff as never, HUMAN, later(1));
    const d = await dispositionHandoff(handoff as never, { disposition: 'qualified', reason: 'budget and a named owner' }, HUMAN, later(2));
    const want = s.fixture.expect.integration!;
    expect(d.integration?.writes).toEqual(want.writes);
    expect(tally()).toMatchObject({ organizations: want.organizations, context_patches: want.context_patches, pipeline_advances: want.pipeline_advances, engagements: 0, projects: 0 });
    expect(receiptsOf(leadOf(s.fixture))).toEqual([]);
    note(s.fixture, d.integration?.writes.join('+') ?? '-');
  });
});

describe('D - Colaberry Business, workflow automation', () => {
  it('Workflow Automation - never Business Training - and the discovery-ready one goes to sales', async () => {
    const { discovery } = scenarioD();
    world([discovery]);
    await arrive(discovery);
    const { row } = await decide(discovery.fixture);
    expect(row.state_at_decision).toBe('DISCOVERY_READY');
    expect(handoffsOf(discovery.fixture).map((h) => h.owner_queue)).toEqual(['sales']);
    expect(candidatesOf(row).map((c) => c.campaign_key)).not.toContain(BIZ_FLOW);
    note(discovery.fixture, '-');
  });

  it('the AI qualification flow executes once through the real chain for a qualified opportunity', async () => {
    const { qualification } = scenarioD();
    world([qualification]);
    rolloutRow('colaberry-enterprise', 'email', 'review');
    activeCampaign('colaberry-enterprise', BIZ_FLOW);
    const row = await decideLive(qualification.fixture);
    expect([row.selected_action, row.selected_channel]).toEqual(['SEND_EMAIL', 'email']);
    expect(candidatesOf(row).find((c) => c.action_type === 'SEND_EMAIL')?.campaign_key).toBe(BIZ_FLOW);
    await throughTransport(row, qualification.fixture, BIZ_FLOW);
    note(qualification.fixture, 'completed');
  });
});

describe('E - AI Flotation, an application request', () => {
  it('Application Build, the solution architect, and the existing intake once - replayed unchanged', async () => {
    const s = scenarioE();
    world([s]);
    await arrive(s);
    const { row } = await decide(s.fixture);
    expect(row.state_at_decision).toBe('DISCOVERY_READY');
    const [handoff] = handoffsOf(s.fixture) as Row[];
    expect(handoff).toMatchObject({ owner_queue: 'solution_architect', status: 'assigned' });
    await acceptHandoff(handoff as never, HUMAN, later(1));
    const d = await dispositionHandoff(handoff as never, { disposition: 'qualified', reason: 'scope agreed' }, HUMAN, later(2));
    expect(d.integration?.writes).toEqual(['flotation_intake']);
    const first = tally();
    expect(first).toMatchObject({ organizations: 1, engagements: 1, projects: 1, pipeline_advances: 0 });
    const again = await dispositionHandoff(handoff as never, { disposition: 'qualified', reason: 'scope agreed' }, HUMAN, later(3)).catch((e: Error) => e);
    expect(tally()).toEqual(first);
    expect(again instanceof Error || (again as { integration?: { status: string } }).integration?.status !== 'written').toBe(true);
    note(s.fixture, 'flotation_intake');
  });
});

/* ── F ───────────────────────────────────────────────────────────────────────── */

describe('F - AI Flotation asked for business training', () => {
  it('the ladder refuses and refers it to Colaberry Business, records the boundary, and the decision hands it to a human\'s review with no service candidate', async () => {
    const { refused } = scenarioF();
    world([refused]);
    const arrived = await arrive(refused);
    expect(arrived.evidence).toContain('brand_boundary:explicit_deny');
    const { row } = await decide(refused.fixture);
    expect(row.state_at_decision).toBe('IDEA_OR_PROBLEM_CAPTURED');
    expect(candidatesOf(row).map((c) => c.campaign_key)).not.toContain(BIZ_FLOW);
    expect(handoffsOf(refused.fixture).map((h) => h.owner_queue)).toEqual(['human_review']);
    note(refused.fixture, '-');
  });

  it('a leaked business-training path: no candidate speaks for it, a forged Business-flow candidate is refused by the governor, and a campaign stamped with another brand\'s home is refused at plan time', async () => {
    const { leaked } = scenarioF();
    const { qualification } = scenarioD();
    world([leaked, qualification]);
    rolloutRow('ai-flotation', 'email', 'review');
    rolloutRow('colaberry-enterprise', 'email', 'review');
    activeCampaign('colaberry-enterprise', BIZ_FLOW);
    const { row } = await decide(leaked.fixture);
    expect(candidatesOf(row).some((c) => c.campaign_key === BIZ_FLOW)).toBe(false);
    // A forged candidate naming the Business flow under AI Flotation never becomes the decision: the governor's brand boundary refuses it by name.
    const forged = await decideWithCandidates(leaked.fixture, () => [{ action_type: 'SEND_EMAIL', campaign_key: BIZ_FLOW, priority_tier: 2, intra_tier_score: 90, channel: 'email', required_assets: [], rationale: ['forged: a leaked business-training flow'] }]);
    expect(forged.row.selected_action).not.toBe('SEND_EMAIL');
    expect(forged.suppressed.filter((s) => s.action_type === 'SEND_EMAIL').map((s) => s.reason)).toHaveLength(1);
    expect(receiptsOf(leadOf(leaked.fixture))).toEqual([]);
    // The registry's own half: a Business decision whose flow campaign turns out to be stamped with AI Flotation's home is refused at plan time.
    const biz = await decideLive(qualification.fixture);
    const campaign = campaignByKey(BIZ_FLOW)!;
    campaign.brand_id = brandRow('ai-flotation').id;
    campaign.tenant_id = brandRow('ai-flotation').tenant_id;
    expect(await plan(biz)).toEqual({ status: 'refused', reason: 'campaign_not_brand_scoped', channel: 'email' });
    expect(receiptsOf(leadOf(qualification.fixture))).toEqual([]);
    expect(transportCalls()).toBe(0);
    // A pending row someone forged directly on the Business campaign for this lead is NOT the hold's to stop - by the hold's own
    // rule (sendHold.ts: no open receipt -> not held; a manual enrolment into a registered campaign is not the journey's to stop).
    // The boundary for a leak is the adapter's brand scoping above, and the campaign engine's own gates; the cell pins the rule.
    T5x.scheduled.insert({ lead_id: leadOf(leaked.fixture), campaign_id: `c-${BIZ_FLOW}`, sequence_id: 'seq-forged', step_index: 0, status: 'pending', sent_at: null, metadata: null });
    const manual = await sendStep();
    expect(manual.blocked).toEqual([]);
    expect(manual.sent).toHaveLength(1);
    expect(receiptsOf(leadOf(leaked.fixture))).toEqual([]);
    note(leaked.fixture, 'refused by the governor; a mis-stamped campaign refused at plan; a manual row is not held');
  });
});

/* ── G ───────────────────────────────────────────────────────────────────────── */

describe('G - a reply to a cold email', () => {
  it('preserves the campaign, brand and source; re-decides under the campaign\'s brand; meets no auto-reply while the receipt is open; never unlocks sms or voice', async () => {
    const { qualification } = scenarioD();
    world([qualification]);
    rolloutRow('colaberry-enterprise', 'email', 'review');
    m5.enrol.mockImplementation(async (leadId: number, sequenceId: string, campaignId: string) => {
      for (const step of [0, 1]) T5x.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: sequenceId, step_index: step, status: 'pending', sent_at: null, metadata: null });
    });
    const lead = leadOf(qualification.fixture);
    activeCampaign('colaberry-enterprise', BIZ_FLOW);
    const first = await decideLive(qualification.fixture);
    expect(await plan(first)).toMatchObject({ status: 'planned' });
    const receiptId = String(receiptsOf(lead)[0].id);
    await approve(receiptId);
    expect(await enrol(receiptId)).toMatchObject({ status: 'enrolled' });
    expect((await sendStep(clock.now, { only: (r) => r.step_index === 0 })).sent).toHaveLength(1);
    await reconcile();
    expect(receiptsOf(lead)[0].status).toBe('in_progress');
    const campaignId = String(T5x.scheduled.rows[0].campaign_id);
    const at = later(1);
    clock.now = at;
    T.communication.insert({ lead_id: lead, channel: 'email', direction: 'inbound', metadata: { campaign_id: campaignId, provider_message_id: '<msg-1@mail.example>' }, created_at: at });
    expect(await recordReplyOutcome({ leadId: lead, campaignId, providerMessageId: '<msg-1@mail.example>', flags: flags5(), asOf: at })).toMatchObject({ status: 'recorded', execution_id: receiptId });
    expect(await journeyAutoReplySkip(lead, flags5())).toBe('open_receipt');
    const re = await redecideOnReply({ leadId: lead, campaignId, flags: flags5(), explorerFlags: explorerFlags5(), asOf: at });
    expect(re).toEqual({ status: 'decided', brands: [{ brand_id: brandRow('colaberry-enterprise').id, source: 'campaign', result: 'recorded' }] });
    const next = T5x.decisions.rows[1];
    expect(next).toMatchObject({ trigger: 'reply', brand_id: brandRow('colaberry-enterprise').id, lead_id: lead });
    expect(['sms', 'voice']).not.toContain(next.selected_channel);
    expect(await plan(first, { asOf: at })).toEqual({ status: 'refused', reason: 'stale_decision_reply_newer', channel: 'email' });
    expect(transportCalls()).toBe(1);
    expect(JSON.stringify([...T5x.ledger.rows, ...T.outcomes.rows])).not.toContain('@');
    note(qualification.fixture, 'in_progress + reply re-decided');
  });
});

/* ── H ───────────────────────────────────────────────────────────────────────── */

describe('H - one person, a Training enrolment and a Business lead', () => {
  it('two isolated contexts, one receipt per brand, and a 360 that shows both to a member of the tenant and nothing to a stranger', async () => {
    const { enterprise, training } = scenarioH();
    world([enterprise, training]);
    rolloutRow('colaberry-enterprise', 'email', 'review');
    rolloutRow('colaberry-training', 'email', 'review');
    activeCampaign('colaberry-enterprise', BIZ_FLOW);
    activeCampaign('colaberry-training', LEARNER_RESTART_KEY);
    const lead = leadOf(enterprise.fixture);
    expect(leadOf(training.fixture)).toBe(lead);
    const e = await decideLive(enterprise.fixture);
    const t = await decideLive(training.fixture);
    expect(e.brand_id).not.toBe(t.brand_id);
    expect(candidatesOf(t).some(speaksForAService)).toBe(false);
    await throughTransport(e as Row, enterprise.fixture, BIZ_FLOW);
    const tSel = candidatesOf(t).find((c) => c.action_type === t.selected_action)!;
    await throughTransport(t as Row, training.fixture, tSel.campaign_key!);
    const receipts = receiptsOf(lead);
    expect(receipts.map((r) => r.brand_id).sort()).toEqual([brandRow('colaberry-enterprise').id, brandRow('colaberry-training').id].sort());
    expect(transportCalls()).toBe(2);
    // The 360: a member of the tenant sees both relationships; a stranger to the tenant sees nothing at all - byte-identical to no such person.
    const mine = await loadPersonJourney({ leadId: lead, ctx: memberCtxFor('colaberry-enterprise') as never, limit: 25 });
    expect(mine.status).toBe('found');
    if (mine.status === 'found') {
      expect(new Set(mine.person.decisions.map((d) => d.brand_id)).size).toBe(2);
      expect(mine.person.subject.lead_id).toBe(lead);
      expect(JSON.stringify(mine.person)).not.toContain('@');
    }
    const theirs = await loadPersonJourney({ leadId: lead, ctx: foreignCtx() as never, limit: 25 });
    expect(theirs).toEqual({ status: 'not_found' });
    note(enterprise.fixture, 'completed');
    note(training.fixture, 'completed');
  });
});

/* ── I ───────────────────────────────────────────────────────────────────────── */

describe('I - competing email, Ali outreach and human task', () => {
  it.each([
    ['Ali outreach outranks', 3 as const, 4 as const, 'SEND_ALI_OUTREACH', 'ali_outreach'],
    ['the email outranks', 6 as const, 7 as const, 'SEND_EMAIL', 'email'],
  ])('%s: one winner, the others suppressed by name, one receipt, replayed after', async (_n, aliTier, taskTier, winner, channel) => {
    const { qualification } = scenarioD();
    world([qualification]);
    activeCampaign('colaberry-enterprise', BIZ_FLOW);
    activeCampaign('colaberry-enterprise', ALI_OUTREACH_CAMPAIGN_KEY, 'c-ali');
    rolloutRow('colaberry-enterprise', 'email', 'review');
    rolloutRow('colaberry-enterprise', 'ali_outreach', 'review');
    m5.explorerProfileFindOne.mockResolvedValue({ get: (k: string) => ({ enrollment_id: null, lead_id: leadOf(qualification.fixture), overlays: ['HIGH_INTENT'], e_score: 60, f_score: 5, primary_state: 'ACTIVE', signal_summary: { highestIntentTier: 3 } } as Record<string, unknown>)[k] });
    const ali: JourneyCandidate = { action_type: 'SEND_ALI_OUTREACH', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY, priority_tier: aliTier, intra_tier_score: 50, channel: 'email', required_assets: [], rationale: ['fixture'] };
    const task: JourneyCandidate = { action_type: 'CREATE_HUMAN_TASK', campaign_key: null, priority_tier: taskTier, intra_tier_score: 50, channel: 'none', required_assets: [], rationale: ['fixture'] };
    const { row, suppressed } = await decideWithCandidates(qualification.fixture, () => [ali, task]);
    expect([row.selected_action, row.mode]).toEqual([winner, 'live']);
    expect(suppressed.map((s) => s.action_type).sort()).toEqual(['CREATE_HUMAN_TASK', 'SEND_ALI_OUTREACH', 'SEND_EMAIL'].filter((a) => a !== winner).sort());
    expect(await plan(row)).toMatchObject({ status: 'planned' });
    expect(await plan(row)).toMatchObject({ status: 'replayed' });
    expect(receiptsOf(leadOf(qualification.fixture)).map((r) => [r.channel, r.status])).toEqual([[channel, 'pending_review']]);
    note(qualification.fixture, `${winner} pending_review`);
  });
});

/* ── J ───────────────────────────────────────────────────────────────────────── */

describe('J - stale or invalid source data', () => {
  it('scores computed 27 hours ago: the decision is refused by name - never a zeroed score, no handoff, no receipt', async () => {
    const { stale } = scenarioJ();
    world([stale]);
    rolloutRow('colaberry-training', 'email', 'review');
    m3.explorerProfileFindByPk.mockResolvedValue({ created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date(clock.now.getTime() - 27 * HOUR) });
    const { row } = await decide(stale.fixture);
    expect(String(row.reason)).toMatch(/freshness:stale/);
    expect([row.selected_action, row.candidates]).toEqual(['WAIT', []]);
    // T310: a refusal still records the human step the subject was waiting on, so the state-driven handoff exists; what the
    // human reads carries NO score from the stale profile - the packet says scores are unavailable, and why.
    for (const h of handoffsOf(stale.fixture)) {
      const packet = h.evidence as { signals: { scores: { available?: boolean; components?: unknown[] } } };
      expect(packet.signals.scores).toMatchObject({ available: false });
      expect(packet.signals.scores.components ?? []).toEqual([]);
      expect(JSON.stringify(packet.signals.scores)).not.toMatch(/"value":\s*0[,}]/);
    }
    expect(await plan(row)).toMatchObject({ status: 'refused' });
    expect(receiptsOf(leadOf(stale.fixture))).toEqual([]);
    note(stale.fixture, `refused:${String(row.reason)}`);
  });

  it('untrusted text on the lead never reaches the packet a human reads', async () => {
    const { untrusted } = scenarioJ();
    world([untrusted]);
    await decide(untrusted.fixture);
    const [row] = handoffsOf(untrusted.fixture);
    const packet = JSON.stringify(row.evidence);
    expect(packet).not.toContain('DROP TABLE');
    expect(packet).not.toContain('<script');
    expect(packet).not.toContain('onerror');
    expect(packet).not.toContain('@');
    note(untrusted.fixture, 'packet clean');
  });
});

/* ── K: the learner-brand cells Phase 5 lacked ───────────────────────────────── */

describe('K - the kill switch and the four pauses, for a Colaberry Training learner, at every stage', () => {
  type Stage = 'plan' | 'approval' | 'enrolment' | 'send';
  const STAGES: readonly Stage[] = ['plan', 'approval', 'enrolment', 'send'];
  const cells: Array<[StopKind, Stage]> = STOPS.flatMap((stop) => STAGES.map((stage): [StopKind, Stage] => [stop, stage]));

  it.each(cells)('%s at %s time: no contact, the reason on the receipt and in the ledger', async (stop, stage) => {
    const s = scenarioBSend();
    world([s]);
    rolloutRow('colaberry-training', 'email', 'review');
    activeCampaign('colaberry-training', LEARNER_RESTART_KEY);
    const lead = leadOf(s.fixture);
    const subjectRef = `enrollment:${s.fixture.subject.enrollment_id}`;
    const row = await decideLive(s.fixture);
    if (stage === 'plan') {
      applyStop(stop, 'colaberry-training', 'email', subjectRef);
      expect(await plan(row)).toEqual({ status: 'refused', reason: `mode_not_live:${stop}`, channel: 'email' });
      expect(receiptsOf(lead)).toEqual([]);
      expect(refusalsOf(String(row.id))).toEqual([`mode_not_live:${stop}`]);
      expect(transportCalls()).toBe(0);
      return;
    }
    expect(await plan(row)).toMatchObject({ status: 'planned', mode: 'review' });
    const receiptId = String(receiptsOf(lead)[0].id);
    if (stage === 'approval') applyStop(stop, 'colaberry-training', 'email', subjectRef);
    expect(await approve(receiptId)).toMatchObject({ outcome: 'approved' });
    if (stage === 'enrolment') applyStop(stop, 'colaberry-training', 'email', subjectRef);
    if (stage === 'send') {
      expect(await enrol(receiptId)).toMatchObject({ status: 'enrolled' });
      applyStop(stop, 'colaberry-training', 'email', subjectRef);
      const held = await sendStep();
      expect(held).toEqual({ sent: [], blocked: [{ id: String(T5x.scheduled.rows[0].id), reason: sendStopReason(stop) }] });
      await reconcile();
      expect(receiptsOf(lead)[0]).toMatchObject({ status: 'blocked', status_reason: `blocked:${sendStopReason(stop)}` });
    } else {
      expect(await enrol(receiptId)).toEqual({ status: 'blocked', receiptId, reason: stop });
      expect(receiptsOf(lead)[0]).toMatchObject({ status: 'approved', status_reason: `blocked:${stop}` });
      expect(transitionsOf(receiptId).at(-1)).toEqual(['enrolling', 'approved', `blocked:${stop}`]);
    }
    expect(transportCalls()).toBe(0);
    expect(JSON.stringify(T5x.ledger.rows)).not.toContain('@');
  });
});

/* ── L ───────────────────────────────────────────────────────────────────────── */

describe('L - more sales-ready subjects than the day\'s capacity', () => {
  it('one slot: the urgent one is assigned with the reason on the row, the other queues as capacity_full, and re-decided next day it is still theirs - not lost', async () => {
    const [first, second] = scenarioL();
    world([first, second], { capacity: { 'colaberry-enterprise/sales': 1 } });
    // The nightly: every decision of the run, then ONE ranked assignment pass per brand x queue - urgency first, never arrival.
    const nightly = await runScheduledShadowDecisions({ flags: flags5(), asOf: AS_OF_4 });
    expect(nightly).toMatchObject({ skipped: false, brands: 1, recorded: 2 });
    const [a] = handoffsOf(first.fixture) as Row[];
    const [b] = handoffsOf(second.fixture) as Row[];
    expect([a.urgent, b.urgent]).toEqual([false, true]);
    expect(Number(a.expected_value)).toBeGreaterThan(Number(b.expected_value));
    expect(b.status).toBe('assigned');
    expect(a).toMatchObject({ status: 'queued', assignment_blocked_reason: 'capacity_full' });
    expect(writes.tickets).toHaveLength(1);
    const again = await decide(first.fixture, { asOf: later(24) });
    expect(again.row.selected_action).toBe('WAIT');
    expect(handoffsOf(first.fixture)).toHaveLength(1);
    expect(T5.executions.rows).toEqual([]);
    note(first.fixture, `next day: ${String(again.row.reason)}`);
    note(second.fixture, '-');
  });
});
