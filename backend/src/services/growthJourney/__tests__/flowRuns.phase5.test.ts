jest.mock('../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.ledger(...a) }));
jest.mock('../../../models', () => require('./fixtures/phase4Harness').modelsMock);
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
jest.mock('../../launchSafety', () => ({ ...jest.requireActual('../../launchSafety'), isKillSwitchActive: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.killSwitch(...a) }));
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

import { anchorOf4, AS_OF_4, arrangeWorld, flags4, handoffsOf } from './fixtures/phase4Harness';
import { m } from './fixtures/phase3Harness';
import { brandRow, classified, counts } from './fixtures/phase3Fixtures';
import { b2bSubject, type HandoffFixture } from './fixtures/phase4Fixtures';
import { sequelize } from '../../../config/database';
import { decideForSubjectAndRecord, decisionInputHash } from '../decisionService';
import { FLOW_CAMPAIGN_KEYS } from '../execution/campaignKeys';
import { bizCtx } from './fixtures/b2bFixtures';

/**
 * T506 — an approved Layer 2 flow becomes a Governor candidate, through the
 * REAL pipeline over the Phase 4 world: the loader reads the flow campaign, the
 * strategy proposes, the decision is recorded. Two brands, one approved row:
 * Colaberry Business selects its flow; AI Flotation is handed the SAME approved
 * row for any key it asks about and still selects nothing, because the campaign
 * belongs to another brand and the loader only ever asks for its own key.
 */

const sqlSpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const FLO_FLOW = FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions;
const REPLIED = counts({ inbound: { replied: 1 } });

type Row = Record<string, unknown> & { selected_action: string | null; reason: string; candidates: Array<{ action_type: string; campaign_key: string | null }>; suppressed: unknown[]; deferred_actions: Array<{ would: string; payload: Record<string, unknown> }>; eligibility: { not_emitted: Array<{ generator: string; reason: string }> } };

const qualifiedBusiness = (): HandoffFixture =>
  b2bSubject('colaberry-enterprise', 'flow-qualified', 'I', { classification: classified('colaberry-enterprise', 'workflow_automation', 'automation_request'), counts: REPLIED, expect: { state: 'QUALIFIED_OPPORTUNITY', queue: null } });
const qualifiedFlotation = (): HandoffFixture =>
  b2bSubject('ai-flotation', 'flow-qualified', 'I', { classification: classified('ai-flotation', 'application_build', 'build_request'), counts: REPLIED, expect: { state: 'BUILD_QUALIFIED', queue: null } });

/** The approved Colaberry Business flow campaign, as the loader's read would return it. */
const approvedBizFlow = () => ({ id: 'c-biz-flow', tenant_id: brandRow('colaberry-enterprise').tenant_id, brand_id: brandRow('colaberry-enterprise').id, status: 'draft', approval_status: 'approved', sequence_id: 's-biz-flow' });

async function decide(f: HandoffFixture): Promise<Row> {
  const r = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), asOf: AS_OF_4 });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return r.row as unknown as Row;
}
const askedKeys = () => m.campaignFindOne.mock.calls.map((c) => (c[0] as { where: { settings: { campaign_key: string } } }).where.settings.campaign_key);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  sqlSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('Colaberry Business, QUALIFIED_OPPORTUNITY', () => {
  it('with NO approved flow: WAIT, the discovery deferral stays with its gap named, and the generator says why', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    const row = await decide(f);
    expect(row.state_at_decision).toBe('QUALIFIED_OPPORTUNITY');
    expect(row.selected_action).toBe('WAIT');
    expect(row.reason).toBe('no_candidate:qualified_state_needs_layer_2:QUALIFIED_OPPORTUNITY');
    expect(row.deferred_actions.find((d) => d.would === 'discovery_questions')?.payload).toMatchObject({ layer: 2, gap: 'no_approved_flow:discovery_questions' });
    expect(row.eligibility.not_emitted).toContainEqual({ generator: 'discoveryQuestions', reason: 'no_approved_flow:discovery_questions' });
    expect(askedKeys()).toEqual([BIZ_FLOW]);
    expect(handoffsOf(f)).toHaveLength(0);
  });

  it('with the flow APPROVED: SEND_EMAIL through the flow, one action selected, the deferral gone, still no handoff', async () => {
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const row = await decide(f);
    expect(row.selected_action).toBe('SEND_EMAIL');
    expect(row.selected_channel).toBe('email');
    expect(row.candidates.map((c) => [c.action_type, c.campaign_key])).toEqual([['SEND_EMAIL', BIZ_FLOW]]);
    expect(row.suppressed).toEqual([]);
    expect(row.deferred_actions.map((d) => d.would)).toEqual(['scheduling_offer']);
    expect(row.eligibility.not_emitted.some((n) => n.generator === 'discoveryQuestions')).toBe(false);
    expect(handoffsOf(f)).toHaveLength(0);
    expect(JSON.stringify(row)).not.toContain('@');
  });

  it('the approval is a fact the decision rests on: a subject decided WAIT before it is decided AGAIN once the flow is approved, not replayed', async () => {
    // The verifier's finding: with the approval outside the input hash, the second run computed SEND_EMAIL and then
    // landed on the first run's WAIT row (same key, `replayed: true`) - Ali's approval changed nothing until T507.
    const f = qualifiedBusiness();
    arrangeWorld([f]);
    const first = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), asOf: AS_OF_4 });
    if (first.status !== 'recorded') throw new Error(first.status);
    expect([first.replayed, first.row.selected_action]).toEqual([false, 'WAIT']);

    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const second = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), asOf: AS_OF_4 });
    if (second.status !== 'recorded') throw new Error(second.status);
    expect([second.replayed, second.row.selected_action]).toEqual([false, 'SEND_EMAIL']);
    expect(second.row.idempotency_key).not.toBe(first.row.idempotency_key);

    // And the approval alone, with nothing else changed, replays its own row - one decision per set of facts.
    const third = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), asOf: AS_OF_4 });
    if (third.status !== 'recorded') throw new Error(third.status);
    expect([third.replayed, third.row.idempotency_key]).toEqual([true, second.row.idempotency_key]);
  });

  it('the approval alone does not override a human in the thread: the flow is withheld like every other email', async () => {
    // A human's call two hours ago: the T402 derivation opens the ownership row, and the AI's commercial outreach pauses.
    const f = { ...qualifiedBusiness(), humanActivity: { type: 'call', hoursAgo: 2 } } as HandoffFixture;
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const row = await decide(f);
    expect(row.selected_action).toBe('WAIT');
    expect(row.eligibility.not_emitted).toContainEqual({ generator: 'discoveryQuestions', reason: 'human_in_conversation' });
  });
});

describe('the input hash and the approval', () => {
  it('an approved flow moves the hash; none, empty or absent is the SAME key as before T506, and order does not matter', () => {
    const a = bizCtx({ state: 'QUALIFIED_OPPORTUNITY' });
    expect(decisionInputHash(bizCtx({ state: 'QUALIFIED_OPPORTUNITY', approvedFlows: [] }))).toBe(decisionInputHash(a));
    expect(decisionInputHash(bizCtx({ state: 'QUALIFIED_OPPORTUNITY', approvedFlows: undefined }))).toBe(decisionInputHash(a));
    expect(decisionInputHash(bizCtx({ state: 'QUALIFIED_OPPORTUNITY', approvedFlows: [BIZ_FLOW] }))).not.toBe(decisionInputHash(a));
    expect(decisionInputHash(bizCtx({ state: 'QUALIFIED_OPPORTUNITY', approvedFlows: [BIZ_FLOW, FLO_FLOW] }))).toBe(
      decisionInputHash(bizCtx({ state: 'QUALIFIED_OPPORTUNITY', approvedFlows: [FLO_FLOW, BIZ_FLOW] })),
    );
  });
});

describe('AI Flotation, BUILD_QUALIFIED - the brand boundary', () => {
  it('handed the APPROVED Colaberry Business row for any key, it still selects nothing: it asked only for its own key, and the row is another brand\'s', async () => {
    const f = qualifiedFlotation();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue(approvedBizFlow());
    const row = await decide(f);
    expect(row.state_at_decision).toBe('BUILD_QUALIFIED');
    expect(row.selected_action).toBe('WAIT');
    expect(row.candidates).toEqual([]);
    expect(askedKeys()).toEqual([FLO_FLOW]);
    expect(row.deferred_actions.find((d) => d.would === 'discovery_questions')?.payload).toMatchObject({ gap: 'no_approved_flow:discovery_questions' });
    expect(JSON.stringify(row)).not.toContain(BIZ_FLOW);
  });

  it('with ITS OWN flow approved it selects that one - and never the Colaberry Business key', async () => {
    const f = qualifiedFlotation();
    arrangeWorld([f]);
    m.campaignFindOne.mockResolvedValue({ id: 'c-flo-flow', tenant_id: brandRow('ai-flotation').tenant_id, brand_id: brandRow('ai-flotation').id, status: 'draft', approval_status: 'approved', sequence_id: 's-flo-flow' });
    const row = await decide(f);
    expect(row.candidates.map((c) => [c.action_type, c.campaign_key])).toEqual([['SEND_EMAIL', FLO_FLOW]]);
    expect(JSON.stringify(row)).not.toContain(BIZ_FLOW);
  });
});
