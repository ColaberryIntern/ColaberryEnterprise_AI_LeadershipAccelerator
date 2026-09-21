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

import { createHash } from 'crypto';
import { sequelize } from '../../../config/database';
import { executionChannelOf } from '../decision/executionModeStamp';
import { journeyAutoReplySkip } from '../execution/autoReplyGuard';
import { ALI_OUTREACH_CAMPAIGN_KEY, FLOW_CAMPAIGN_KEYS } from '../execution/campaignKeys';
import { recordReplyOutcome } from '../execution/replyOutcome';
import { redecideOnReply } from '../execution/replyRedecide';
import type { JourneyCandidate, JourneyChannel } from '../governor/types';
import { brandRow, classified, counts } from './fixtures/phase3Fixtures';
import { b2bSubject, type HandoffFixture } from './fixtures/phase4Fixtures';
import { activeCampaign, applyStop, arrangeWorld5, AS_OF_4, clock, explorerFlags5, flags5, HOUR, m5, receiptsOf, refusalsOf, rolloutRow, STOPS, T, T5, T5x, transitionsOf, transportCalls, type StopKind } from './fixtures/phase5Harness';
import { approve, decideLive, decideWithCandidates, enrol, plan, reconcile, run, sendStep } from './fixtures/phase5Drivers';

/**
 * T519 — §16 K, G and I in Phase 5 form, through the real chain over the
 * Phase 5 world.
 *
 *   K  the kill switch and the four pauses, applied at plan, approval,
 *      enrolment and send time for email (20 cells) and at send time for Ali
 *      outreach (5): zero transport calls, the reason on the receipt and in
 *      the ledger, every time.
 *   G  a reply to a journey email preserves the campaign, the brand and the
 *      source, re-decides, meets no auto-reply, and the next decision's channel
 *      is never sms or voice.
 *   I  a subject eligible for an email, an Ali outreach and a handoff gets ONE
 *      selected action with the others suppressed by name, and at most one
 *      receipt - whichever way the tiers fall.
 */

const BRAND = 'colaberry-enterprise' as const;
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const REPLIED = counts({ inbound: { replied: 1 } });
const qualified = (key: string): HandoffFixture =>
  b2bSubject(BRAND, key, 'I', { classification: classified(BRAND, 'workflow_automation', 'automation_request'), counts: REPLIED, expect: { state: 'QUALIFIED_OPPORTUNITY', queue: null } });
const leadOf = (f: HandoffFixture): number => f.lead!.id;
const memberCtx = () => ({ platformIdentityId: 'pid-staff', tenantId: brandRow(BRAND).tenant_id, brandId: null, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [brandRow(BRAND).tenant_id], authorizedBrandIds: null });
const highIntentProfile = (leadId: number) => ({ get: (k: string) => ({ enrollment_id: null, lead_id: leadId, overlays: ['HIGH_INTENT'], e_score: 60, f_score: 5, primary_state: 'ACTIVE', signal_summary: { highestIntentTier: 3 } } as Record<string, unknown>)[k] });
const aliCandidate = (tier: 3 | 6 = 3): JourneyCandidate => ({ action_type: 'SEND_ALI_OUTREACH', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY, priority_tier: tier, intra_tier_score: 50, channel: 'email', required_assets: [], rationale: ['fixture: a HIGH_INTENT subject Ali would write to'] });
const humanTask = (tier: 4 | 7 = 4): JourneyCandidate => ({ action_type: 'CREATE_HUMAN_TASK', campaign_key: null, priority_tier: tier, intra_tier_score: 50, channel: 'none', required_assets: [], rationale: ['fixture: a sales task'] });

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
  expect(m5.createTransport).not.toHaveBeenCalled();
  expect(m5.sms).not.toHaveBeenCalled();
  expect(m5.voice).not.toHaveBeenCalled();
});

/** One qualified subject, the active flow, a REVIEW rollout on email (so every stage - plan, approval, enrolment, send - exists). */
function reviewWorld(): HandoffFixture {
  const f = qualified('k-subject');
  arrangeWorld5([f]);
  activeCampaign(BRAND, BIZ_FLOW);
  rolloutRow(BRAND, 'email', 'review');
  m5.contextFromAdminRequest.mockResolvedValue(memberCtx());
  return f;
}

type Stage = 'plan' | 'approval' | 'enrolment' | 'send';
const STAGES: readonly Stage[] = ['plan', 'approval', 'enrolment', 'send'];
const cells: Array<[StopKind, Stage]> = STOPS.flatMap((stop) => STAGES.map((stage): [StopKind, Stage] => [stop, stage]));

describe('K - the kill switch and the four pauses, at every stage, for email: 20 cells', () => {
  it.each(cells)('%s applied at %s time: 0 transport calls, the reason on the receipt and in the ledger', async (stop, stage) => {
    const f = reviewWorld();
    const lead = leadOf(f);
    const subjectRef = `lead:${lead}`;
    const row = await decideLive(f);

    if (stage === 'plan') {
      applyStop(stop, BRAND, 'email', subjectRef);
      const r = await plan(row);
      expect(r).toEqual({ status: 'refused', reason: `mode_not_live:${stop}`, channel: 'email' });
      expect(receiptsOf(lead)).toEqual([]);
      expect(refusalsOf(String(row.id))).toEqual([`mode_not_live:${stop}`]);
      expect(transportCalls()).toBe(0);
      return;
    }

    const planned = await plan(row);
    expect(planned).toMatchObject({ status: 'planned', mode: 'review' });
    const receiptId = String(receiptsOf(lead)[0].id);
    expect(receiptsOf(lead)[0].status).toBe('pending_review');

    if (stage === 'approval') {
      // Approval never sends and never re-runs the ladder (T509): the stop set before it is caught by the adapter, which does.
      applyStop(stop, BRAND, 'email', subjectRef);
      expect(await approve(receiptId)).toMatchObject({ outcome: 'approved' });
      expect(await enrol(receiptId)).toEqual({ status: 'blocked', receiptId, reason: stop });
    } else {
      expect(await approve(receiptId)).toMatchObject({ outcome: 'approved' });
      if (stage === 'enrolment') {
        applyStop(stop, BRAND, 'email', subjectRef);
        expect(await enrol(receiptId)).toEqual({ status: 'blocked', receiptId, reason: stop });
      } else {
        expect(await enrol(receiptId)).toMatchObject({ status: 'enrolled', receiptId });
        expect(T5x.scheduled.rows.map((r) => r.status)).toEqual(['pending']);
        applyStop(stop, BRAND, 'email', subjectRef);
        const held = await sendStep();
        expect(held).toEqual({ sent: [], blocked: [{ id: String(T5x.scheduled.rows[0].id), reason: `journey_hold:${stop}` }] });
        await reconcile();
      }
    }

    expect(transportCalls()).toBe(0);
    expect(m5.enrol).toHaveBeenCalledTimes(stage === 'send' ? 1 : 0);
    const receipt = receiptsOf(lead)[0];
    if (stage === 'send') {
      expect(receipt).toMatchObject({ status: 'blocked', status_reason: `blocked:journey_hold:${stop}` });
      expect(transitionsOf(receiptId).at(-1)).toEqual(['enrolled', 'blocked', `blocked:journey_hold:${stop}`]);
      expect(T.outcomes.rows.map((o) => [o.outcome_type, (o.metadata as { blocked_reason: string }).blocked_reason])).toEqual([['contact_blocked', `journey_hold:${stop}`]]);
    } else {
      // Returned to approved, the attempt restored: a hold is not an attempt; the reason is on the row and in the ledger.
      expect(receipt).toMatchObject({ status: 'approved', status_reason: `blocked:${stop}`, attempts: 0 });
      expect(transitionsOf(receiptId).at(-1)).toEqual(['enrolling', 'approved', `blocked:${stop}`]);
    }
    expect(JSON.stringify(T5x.ledger.rows)).not.toContain('@');
  });
});

describe('K - the five stops at send time, for Ali outreach', () => {
  /** A live SEND_ALI_OUTREACH decision (the real governor over the widened strategy), planned for review, approved, enrolled through T516's branch. */
  async function enrolledAliReceipt(): Promise<{ receiptId: string; lead: number }> {
    const f = qualified('k-ali');
    arrangeWorld5([f]);
    activeCampaign(BRAND, ALI_OUTREACH_CAMPAIGN_KEY, 'c-ali');
    rolloutRow(BRAND, 'ali_outreach', 'review');
    m5.contextFromAdminRequest.mockResolvedValue(memberCtx());
    m5.explorerProfileFindOne.mockResolvedValue(highIntentProfile(leadOf(f)));
    const { row } = await decideWithCandidates(f, () => [aliCandidate()]);
    expect([row.selected_action, row.mode, row.eligibility.execution_mode.reason]).toEqual(['SEND_ALI_OUTREACH', 'live', 'rollout']);
    expect(await plan(row)).toMatchObject({ status: 'planned', mode: 'review' });
    const receiptId = String(receiptsOf(leadOf(f))[0].id);
    expect(await approve(receiptId)).toMatchObject({ outcome: 'approved' });
    expect(await enrol(receiptId)).toMatchObject({ status: 'enrolled', channel: 'ali_outreach' });
    expect(m5.enrolCampaign).toHaveBeenCalledWith('c-ali', [leadOf(f)]);
    expect(T5x.scheduled.rows.map((r) => [r.campaign_id, r.status])).toEqual([['c-ali', 'pending']]);
    return { receiptId, lead: leadOf(f) };
  }

  it.each(STOPS)('%s applied after enrolment: the send is held with journey_hold, 0 transport calls, the reason on the receipt and in the ledger', async (stop) => {
    const { receiptId, lead } = await enrolledAliReceipt();
    applyStop(stop, BRAND, 'ali_outreach', `lead:${lead}`);
    const held = await sendStep();
    expect(held).toEqual({ sent: [], blocked: [{ id: String(T5x.scheduled.rows[0].id), reason: `journey_hold:${stop}` }] });
    await reconcile();
    expect(transportCalls()).toBe(0);
    expect(receiptsOf(lead)[0]).toMatchObject({ status: 'blocked', status_reason: `blocked:journey_hold:${stop}`, channel: 'ali_outreach' });
    expect(transitionsOf(receiptId).at(-1)).toEqual(['enrolled', 'blocked', `blocked:journey_hold:${stop}`]);
  });

  it('control: with no stop the same Ali send goes through the hold to the transport, once', async () => {
    const { lead } = await enrolledAliReceipt();
    const sent = await sendStep();
    expect(sent.blocked).toEqual([]);
    expect(sent.sent).toHaveLength(1);
    expect(transportCalls()).toBe(1);
    await reconcile();
    expect(receiptsOf(lead)[0].status).toBe('completed');
  });
});

describe('G - a reply to a journey email', () => {
  it('preserves the campaign, brand and source; re-decides under the campaign\'s brand; meets no auto-reply while the receipt is open; the next decision\'s channel is never sms or voice', async () => {
    const f = reviewWorld();
    const lead = leadOf(f);
    // A two-step sequence, so the receipt is still OPEN (in_progress) when the reply lands.
    m5.enrol.mockImplementation(async (leadId: number, sequenceId: string, campaignId: string) => {
      for (const step of [0, 1]) T5x.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: sequenceId, step_index: step, status: 'pending', sent_at: null, metadata: null });
    });
    const first = await decideLive(f);
    expect(await plan(first)).toMatchObject({ status: 'planned', mode: 'review' });
    const receiptId = String(receiptsOf(lead)[0].id);
    expect(await approve(receiptId)).toMatchObject({ outcome: 'approved' });
    expect(await enrol(receiptId)).toMatchObject({ status: 'enrolled' });
    // Step 0 goes; step 1 is not due yet, so the sequence - and the receipt - is still in flight.
    expect((await sendStep(clock.now, { only: (r) => r.step_index === 0 })).sent).toHaveLength(1);
    await reconcile();
    expect(receiptsOf(lead)[0].status).toBe('in_progress');
    expect(transportCalls()).toBe(1);
    const campaignId = String(T5x.scheduled.rows[0].campaign_id);

    // The reply arrives an hour later: the inbound row, then what the classification hook does with it.
    const later = new Date(AS_OF_4.getTime() + HOUR);
    clock.now = later;
    T.communication.insert({ lead_id: lead, channel: 'email', direction: 'inbound', metadata: { campaign_id: campaignId, provider_message_id: '<msg-1@mail.example>' }, created_at: later });

    // the outcome, on the receipt, keyed by the campaign and the provider id - the campaign preserved
    const outcome = await recordReplyOutcome({ leadId: lead, campaignId, providerMessageId: '<msg-1@mail.example>', flags: flags5(), asOf: later });
    // the key is the message id's HASH: an RFC Message-Id is `<local@domain>`, and no `@` may reach the outcome row or the ledger
    const mid = `mid:${createHash('sha256').update('msg-1@mail.example').digest('hex').slice(0, 32)}`;
    expect(outcome).toEqual({ status: 'recorded', execution_id: receiptId, source_ref: `${receiptId}:reply:${mid}` });
    const replied = T.outcomes.rows.find((o) => o.outcome_type === 'contact_replied')!;
    expect(replied).toMatchObject({ source_ref: `${receiptId}:reply:${mid}`, metadata: { campaign_id: campaignId } });
    expect(await recordReplyOutcome({ leadId: lead, campaignId, providerMessageId: '<msg-1@mail.example>', flags: flags5(), asOf: later })).toMatchObject({ status: 'replayed' });

    // no auto-reply: the journey owns the conversation while its receipt is open
    expect(await journeyAutoReplySkip(lead, flags5())).toBe('open_receipt');

    // the re-decision, under the campaign's brand, from the reply - the brand and the source preserved on the new row
    const redecided = await redecideOnReply({ leadId: lead, campaignId, flags: flags5(), explorerFlags: explorerFlags5(), asOf: later });
    expect(redecided).toEqual({ status: 'decided', brands: [{ brand_id: brandRow(BRAND).id, source: 'campaign', result: 'recorded' }] });
    const rows = T5x.decisions.rows;
    expect(rows).toHaveLength(2);
    const next = rows[1];
    expect(next).toMatchObject({ trigger: 'reply', brand_id: brandRow(BRAND).id, lead_id: lead });
    expect(next.idempotency_key).not.toBe(first.idempotency_key);
    expect(['sms', 'voice']).not.toContain(next.selected_channel);
    const channel = executionChannelOf({ selected_action: String(next.selected_action), selected_channel: next.selected_channel as JourneyChannel | null });
    expect(['sms', 'voice']).not.toContain(channel.channel);

    // The reply STALES the first decision for any later plan (a reply newer than the decision, before the unique is even asked);
    // the open receipt keeps a second one from executing on the same person.
    expect(await plan(first, { asOf: later })).toEqual({ status: 'refused', reason: 'stale_decision_reply_newer', channel: 'email' });
    if (next.mode === 'live') expect(await plan(next, { asOf: later })).toMatchObject({ status: 'refused', reason: 'open_execution_exists' });
    expect(receiptsOf(lead)).toHaveLength(1);
    expect(transportCalls()).toBe(1);
    expect(JSON.stringify([...T5x.ledger.rows, ...T.outcomes.rows])).not.toContain('@');
  });
});

describe('I - one selected action, the others suppressed, at most one receipt', () => {
  it.each([
    ['Ali outreach outranks (tier 3; the task at 4, the flow email at 5): it is selected, the email and the task are suppressed as lower priority', 3 as const, 4 as const, 'SEND_ALI_OUTREACH', 'ali_outreach'],
    ['the email outranks (Ali at 6, the task at 7): it is selected, Ali and the task are suppressed', 6 as const, 7 as const, 'SEND_EMAIL', 'email'],
  ])('%s; the plan writes exactly one receipt and replays after', async (_name, aliTier, taskTier, winner, channel) => {
    const f = qualified('i-subject');
    arrangeWorld5([f]);
    activeCampaign(BRAND, BIZ_FLOW);
    activeCampaign(BRAND, ALI_OUTREACH_CAMPAIGN_KEY, 'c-ali');
    rolloutRow(BRAND, 'email', 'review');
    rolloutRow(BRAND, 'ali_outreach', 'review');
    m5.contextFromAdminRequest.mockResolvedValue(memberCtx());
    m5.explorerProfileFindOne.mockResolvedValue(highIntentProfile(leadOf(f)));

    const { row, replayed, suppressed } = await decideWithCandidates(f, () => [aliCandidate(aliTier), humanTask(taskTier)]);
    expect(replayed).toBe(false);
    expect(row.selected_action).toBe(winner);
    expect(row.mode).toBe('live');
    const others = ['SEND_EMAIL', 'SEND_ALI_OUTREACH', 'CREATE_HUMAN_TASK'].filter((a) => a !== winner);
    expect(suppressed.map((s) => s.action_type).sort()).toEqual(others.sort());
    for (const s of suppressed) expect(s.reason).toMatch(/^lower priority than tier \d \(|^outranked within tier/);
    expect((row.candidates as Array<{ action_type: string }>).map((c) => c.action_type).sort()).toEqual(['CREATE_HUMAN_TASK', 'SEND_ALI_OUTREACH', 'SEND_EMAIL']);

    expect(await plan(row)).toMatchObject({ status: 'planned', mode: 'review' });
    expect(await plan(row)).toMatchObject({ status: 'replayed' });
    expect(receiptsOf(leadOf(f)).map((r) => [r.channel, r.status])).toEqual([[channel, 'pending_review']]);
    // and the batch, which excludes every decision that already has a receipt in the window, plans nothing new
    const s = await run();
    expect(s.plan).toMatchObject({ candidates: 0, planned: 0, replayed: 0 });
    expect(receiptsOf(leadOf(f))).toHaveLength(1);
    expect(transportCalls()).toBe(0);
  });

  it('the same subject decided again on the same facts replays its row: still one decision, still one receipt', async () => {
    const f = qualified('i-replay');
    arrangeWorld5([f]);
    activeCampaign(BRAND, BIZ_FLOW);
    activeCampaign(BRAND, ALI_OUTREACH_CAMPAIGN_KEY, 'c-ali');
    rolloutRow(BRAND, 'email', 'review');
    rolloutRow(BRAND, 'ali_outreach', 'review');
    m5.explorerProfileFindOne.mockResolvedValue(highIntentProfile(leadOf(f)));
    const a = await decideWithCandidates(f, () => [aliCandidate(), humanTask()]);
    const b = await decideWithCandidates(f, () => [aliCandidate(), humanTask()]);
    expect([a.replayed, b.replayed, a.row.id === b.row.id]).toEqual([false, true, true]);
    expect(T5x.decisions.rows).toHaveLength(1);
    await plan(a.row);
    await plan(b.row);
    expect(T5.executions.rows).toHaveLength(1);
  });
});
