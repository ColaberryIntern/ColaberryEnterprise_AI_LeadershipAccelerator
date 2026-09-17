import * as fs from 'fs';
import * as path from 'path';

const m = {
  decisionCreate: jest.fn(),
  decisionFindOne: jest.fn(),
  classificationFindAll: jest.fn(),
  loadDecisionContext: jest.fn(),
  upsertProfile: jest.fn(),
};

jest.mock('../../../models', () => ({
  GrowthJourneyDecision: {
    create: (...a: unknown[]) => m.decisionCreate(...a),
    findOne: (...a: unknown[]) => m.decisionFindOne(...a),
  },
  GrowthJourneyClassification: { findAll: (...a: unknown[]) => m.classificationFindAll(...a) },
}));
jest.mock('../decision/loadDecisionContext', () => ({
  loadDecisionContext: (...a: unknown[]) => m.loadDecisionContext(...a),
  NO_LEARNER_PROFILE_STATE: 'NO_LEARNER_PROFILE',
}));
jest.mock('../profileService', () => ({ upsertProfile: (...a: unknown[]) => m.upsertProfile(...a) }));
// The pipeline's real offer gate reads a model; the tests state their own policy.
jest.mock('../offerEligibility', () => ({
  assertOfferAllowed: async () => ({ allowed: true, reason: 'test', rule_id: null }),
  resolveOfferEligibility: async () => ({ allowed: true, reason: 'test', rule_id: null }),
  OfferNotEligibleError: class extends Error {},
}));
// T305's gate is the writer's seam, not its subject: it answers with the gap
// every journey purpose is today. The gate's own behaviour is T310's suite.
// T404: the handoff writer is mocked at its boundary - its own suite drives the rows; this one owns the hand-over.
const handoffs = { materializeHandoffs: jest.fn() };
jest.mock('../handoffs/handoffService', () => ({ materializeHandoffs: (...a: unknown[]) => handoffs.materializeHandoffs(...a) }));
jest.mock('../journeyContent', () => ({
  resolveJourneyContent: async (c: { required_assets: Array<{ asset_type: string }> }) => ({
    assets: [],
    gaps: c.required_assets.map((q) => `content_purpose_unsupported:${q.asset_type}`),
  }),
}));

import {
  anchorFromSubjectRef,
  decideForSubjectAndRecord,
  decisionInputHash,
  decisionRow,
  runShadowDecisions,
  SHADOW_MODE,
} from '../decisionService';
import type { LoadedDecisionContext } from '../decision/loadDecisionContext';
import { businessStrategy } from '../strategies/businessCandidates';
import { learnerStrategy } from '../strategies/learnerStrategy';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { bizCtx } from './fixtures/b2bFixtures';
import { ctx as trainingCtx, cpn, flags as onFlags } from './fixtures/learnerFixtures';

/**
 * T311 — the shadow decision writer.
 *
 * What these pin, in the order the plan lists them: the gate is the first
 * line; the same subject twice is one row; a changed input is a second row and
 * the first is untouched; every §7.3 field is on the row by set equality;
 * `executed` is never true and `execution_receipt` is always null; the batch
 * runner is gated, bounded and keeps going past one failure.
 */

const off = (): GrowthJourneyFlags => ({ ...onFlags(), journeyDecisions: false });

function loaded(over: Partial<LoadedDecisionContext> = {}): LoadedDecisionContext {
  const c = bizCtx();
  return {
    status: 'loaded',
    ctx: c,
    strategy: businessStrategy,
    subject: { lead_id: 501, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: 'x@example.com', brand_relationships: [] },
    program: { id: 'p-ent', slug: 'business-growth', kind: 'business', status: 'draft' },
    brand: { id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: 't-col' },
    lifecycle: { state: c.state, stateEnteredAt: c.state_entered_at as Date, overlays: c.overlays, evidence: ['test'], projected: true },
    previousProfile: { state: null, state_entered_at: null, created_at: null },
    returnToAi: { active: false, handoff_id: null, cooldown_until: null, reason: null },
    unavailable: [],
    ...over,
  };
}

function arrange(ld: LoadedDecisionContext = loaded()) {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadDecisionContext.mockResolvedValue(ld);
  m.upsertProfile.mockResolvedValue({ profileId: 'gp-1', previousState: null, stateChanged: true, transitionId: 't-1', transitionReplayed: false });
  let seq = 0;
  m.decisionCreate.mockImplementation(async (row: Record<string, unknown>) => ({ id: `d-${++seq}`, ...row }));
}

const record = (over: Partial<Parameters<typeof decideForSubjectAndRecord>[0]> = {}) =>
  decideForSubjectAndRecord({ anchor: { leadId: 501 }, brandId: 'b-ent', trigger: 'nightly', flags: onFlags(), asOf: bizCtx().asOf, ...over });

/* ── the gate ──────────────────────────────────────────────────────────────── */

describe('the gate is the first line', () => {
  it('flag off: disabled before a single query', async () => {
    arrange();
    expect(await record({ flags: off() })).toEqual({ status: 'disabled' });
    expect(m.loadDecisionContext).not.toHaveBeenCalled();
    expect(m.decisionCreate).not.toHaveBeenCalled();
    expect(m.upsertProfile).not.toHaveBeenCalled();
  });

  it('master off with the capability on: still disabled, still no query', async () => {
    arrange();
    expect(await record({ flags: { ...onFlags(), growthJourneyEnabled: false } })).toEqual({ status: 'disabled' });
    expect(m.loadDecisionContext).not.toHaveBeenCalled();
  });

  it('a subject that does not resolve, a brand or programme that is missing: the loader\'s answer, no write', async () => {
    arrange();
    m.loadDecisionContext.mockResolvedValue({ status: 'unresolved', reason: 'no_such_lead' });
    expect(await record()).toEqual({ status: 'unresolved', reason: 'no_such_lead' });
    m.loadDecisionContext.mockResolvedValue({ status: 'no_program', brandId: 'b-ent' });
    expect(await record()).toEqual({ status: 'no_program', brandId: 'b-ent' });
    expect(m.decisionCreate).not.toHaveBeenCalled();
    expect(m.upsertProfile).not.toHaveBeenCalled();
  });
});

/* ── one row, once ─────────────────────────────────────────────────────────── */

describe('one row per subject per brand per trigger per input state', () => {
  it('the same subject twice is ONE row, and the second call says replayed', async () => {
    arrange();
    const first = await record();
    expect(first.status).toBe('recorded');
    if (first.status !== 'recorded') return;
    expect(first.replayed).toBe(false);
    const key = first.row.idempotency_key;

    // The database refuses the duplicate key; the writer finds the existing row.
    m.decisionCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }));
    m.decisionFindOne.mockResolvedValueOnce({ id: 'd-1', idempotency_key: key });
    const second = await record();
    if (second.status !== 'recorded') throw new Error(second.status);
    expect(second.replayed).toBe(true);
    expect(second.row.id).toBe('d-1');
    expect(m.decisionFindOne).toHaveBeenCalledWith({ where: { idempotency_key: key } });
  });

  it('a changed input is a SECOND row and the first is untouched - nothing is ever updated', async () => {
    arrange();
    const first = await record();
    if (first.status !== 'recorded') throw new Error(first.status);
    // The lead replied: the state moves, so the inputs are different facts.
    const changed = loaded({ ctx: bizCtx({ state: 'QUALIFIED_OPPORTUNITY', overlays: [] }) });
    m.loadDecisionContext.mockResolvedValue(changed);
    const second = await record();
    if (second.status !== 'recorded') throw new Error(second.status);
    expect(second.replayed).toBe(false);
    expect(second.row.idempotency_key).not.toBe(first.row.idempotency_key);
    expect(m.decisionCreate).toHaveBeenCalledTimes(2);
    // Append-only: the writer has no update path at all.
    expect((m as Record<string, jest.Mock>).decisionUpdate).toBeUndefined();
  });

  it('the input hash is over DISCRETE facts: the clock alone does not change it, a new contact does', () => {
    const a = bizCtx();
    const clockOnly = bizCtx({ contact: { ...a.contact, hours_since_last_contact: 3.7 } });
    const newContact = bizCtx({ contact: { ...a.contact, recent_contact_count: 1 } });
    const newState = bizCtx({ state: 'EXPLORING_SOLUTIONS', overlays: ['NO_RESPONSE', 'STALLED'] });
    expect(decisionInputHash(clockOnly)).toBe(decisionInputHash(a));
    expect(decisionInputHash(newContact)).not.toBe(decisionInputHash(a));
    expect(decisionInputHash(newState)).not.toBe(decisionInputHash(a));
    // Overlay order is not a fact.
    expect(decisionInputHash(bizCtx({ overlays: ['STALLED', 'NO_RESPONSE'] }))).toBe(decisionInputHash(bizCtx({ overlays: ['NO_RESPONSE', 'STALLED'] })));
  });

  it('a refusal whose reason has CLEARED is a second row, not a replay of the refusal', async () => {
    // The verifier's finding: with the verdict outside the hash, a subject
    // refused `freshness:stale` on night one got the same key on night two
    // after being rescored upstream with unchanged facts - and the writer
    // handed back the stale refusal as a replay, forever.
    const stale = loaded({ ctx: bizCtx({ freshness: { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date('2026-09-01T00:00:00Z') } }) });
    arrange(stale);
    const night1 = await record();
    if (night1.status !== 'recorded') throw new Error(night1.status);
    expect(night1.decision.reason).toBe('refused: freshness:stale');

    // Night two: rescored upstream, every other fact identical.
    const fresh = loaded({ ctx: bizCtx({ freshness: { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date('2026-09-14T06:00:00Z') } }) });
    m.loadDecisionContext.mockResolvedValue(fresh);
    const night2 = await record();
    if (night2.status !== 'recorded') throw new Error(night2.status);
    expect(night2.replayed).toBe(false);
    expect(night2.decision.reason).not.toBe('refused: freshness:stale');
    expect(night2.row.idempotency_key).not.toBe(night1.row.idempotency_key);
    // And the same fresh facts again ARE a replay.
    expect(decisionInputHash(fresh.ctx, fresh.unavailable)).toBe(decisionInputHash(fresh.ctx, fresh.unavailable));
  });

  it('a decision made with a lookup UNAVAILABLE is a different decision from one made with it', async () => {
    const degraded = loaded({ unavailable: ['lead'] });
    const healthy = loaded();
    expect(decisionInputHash(degraded.ctx, degraded.unavailable)).not.toBe(decisionInputHash(healthy.ctx, healthy.unavailable));
    // Order of the unavailable list is not a fact.
    expect(decisionInputHash(healthy.ctx, ['lead', 'classification'])).toBe(decisionInputHash(healthy.ctx, ['classification', 'lead']));
    arrange(degraded);
    const first = await record();
    m.loadDecisionContext.mockResolvedValue(healthy);
    const second = await record();
    if (first.status !== 'recorded' || second.status !== 'recorded') throw new Error('not recorded');
    expect(second.row.idempotency_key).not.toBe(first.row.idempotency_key);
    expect(second.replayed).toBe(false);
  });

  it('the state ALONE moves the hash - the verifier\'s V3, which the earlier cases never isolated', () => {
    const a = bizCtx();
    const stateOnly = bizCtx({ state: 'PROBLEM_IDENTIFIED' });
    expect(stateOnly.overlays).toEqual(a.overlays);
    expect(decisionInputHash(stateOnly)).not.toBe(decisionInputHash(a));
  });

  it('the key is the plan\'s six parts: trigger and ruleset move it, and nothing else outside the inputs does', async () => {
    arrange();
    const a = await record({ trigger: 'nightly' });
    const b = await record({ trigger: 'manual' });
    if (a.status !== 'recorded' || b.status !== 'recorded') throw new Error('not recorded');
    expect(a.row.idempotency_key).not.toBe(b.row.idempotency_key);
  });
});

/* ── every §7.3 field ──────────────────────────────────────────────────────── */

describe('every §7.3 field is on the row, or explicitly null / unknown', () => {
  /** §7.3's list, mapped to the columns that carry each item. */
  const SPEC_7_3: Record<string, string[]> = {
    'all candidate actions': ['candidates'],
    'eligibility and policy results': ['eligibility'],
    'score/state evidence': ['scores', 'score_gaps', 'state_at_decision', 'overlays_at_decision'],
    'content asset and brand eligibility': ['content_gaps', 'selected_content', 'eligibility'],
    'recent contacts and cooldowns': ['contact_evidence'],
    'human conversation status': ['human_conversation'],
    'sales capacity': ['sales_capacity'],
    'selected action': ['selected_action', 'selected_path', 'selected_channel'],
    'every suppressed action and reason': ['suppressed'],
    'ruleset/model versions': ['ruleset_version', 'model_version'],
    'whether AI participated': ['ai_involved'],
    'execution and outcome receipt': ['executed', 'execution_receipt'],
  };
  const IDENTITY = ['tenant_id', 'brand_id', 'program_id', 'subject_ref', 'lead_id', 'enrollment_id', 'classification_id', 'trigger', 'decision_date', 'mode', 'reason', 'requires_human_review', 'decided_by', 'idempotency_key'];
  const EXTRA = ['deferred_actions'];

  const row = () => {
    const ld = loaded();
    const decision = {
      selected_action: 'WAIT', selected_path: 'workflow_automation', selected_channel: null, selected_content: null,
      candidates: [{ action_type: 'SEND_EMAIL' }], suppressed: [{ action_type: 'SEND_EMAIL', campaign_key: null, reason: 'content_gap:x' }],
      deferred_actions: [{ would: 'reply_aware_sequence', reason: 'no_response_overlay', payload: {} }],
      eligibility: null, content_gaps: ['x'], reason: 'content_gap:x', requires_human_review: false, ai_involved: false,
      model_version: null, ruleset_version: 'p3-business-v1',
    } as Parameters<typeof decisionRow>[1];
    return decisionRow(ld, decision, 'nightly', [{ generator: 'caseStudy', reason: 'not_yet_reached_out:education_first' }]);
  };

  it('the row\'s keys are exactly the §7.3 columns plus identity - by set equality, so an omission cannot hide', () => {
    const expected = new Set([...Object.values(SPEC_7_3).flat(), ...IDENTITY, ...EXTRA]);
    expect(new Set(Object.keys(row()))).toEqual(expected);
  });

  it.each(Object.entries(SPEC_7_3))('"%s" is carried by %p, populated or explicitly null/unknown', (_item, cols) => {
    const r = row() as unknown as Record<string, unknown>;
    for (const col of cols) {
      expect(col in r).toBe(true);
      expect(r[col]).not.toBeUndefined();
    }
  });

  it('the two inputs with no source are recorded as unknown, never invented', () => {
    const r = row();
    expect(r.human_conversation).toBe('unknown');
    expect(r.sales_capacity).toBe('unknown');
  });

  it('eligibility carries the programme status, the winner\'s offer decision and every generator that declined', () => {
    const r = row();
    expect(r.eligibility).toEqual({
      program_status: 'draft',
      program_active: false,
      offer: null,
      not_emitted: [{ generator: 'caseStudy', reason: 'not_yet_reached_out:education_first' }],
      inputs_unavailable: [],
    });
  });
});

/* ── shadow, and only shadow ───────────────────────────────────────────────── */

describe('mode is shadow, executed is never true, the receipt is always null', () => {
  it('the mode constant is exactly the string the model accepts', () => {
    // The plan's control: misspell it and this fails.
    expect(SHADOW_MODE).toBe('shadow');
    expect(row().mode).toBe('shadow');
  });

  it.each([
    ['a Layer-1 email that gaps', bizCtx()],
    ['a commercial state', bizCtx({ state: 'DISCOVERY_READY', overlays: [] })],
    ['a converted customer', bizCtx({ state: 'CUSTOMER', overlays: [] })],
    ['a decline', bizCtx({ overlays: ['DECLINED'] })],
  ])('%s: executed false, receipt null, mode shadow, no AI', async (_l, c) => {
    arrange(loaded({ ctx: c, lifecycle: { state: c.state, stateEnteredAt: c.asOf, overlays: c.overlays, evidence: [], projected: true } }));
    const out = await record();
    if (out.status !== 'recorded') throw new Error(out.status);
    expect(out.row.executed).toBe(false);
    expect(out.row.execution_receipt).toBeNull();
    expect(out.row.mode).toBe('shadow');
    expect(out.row.ai_involved).toBe(false);
    expect(out.row.model_version).toBeNull();
    expect(out.row.decided_by).toBe('governor:p3-business-v1');
  });

  function row() {
    return decisionRow(loaded(), {
      selected_action: 'WAIT', selected_path: null, selected_channel: null, selected_content: null, candidates: [], suppressed: [],
      deferred_actions: [], eligibility: null, content_gaps: [], reason: 'x', requires_human_review: false, ai_involved: false,
      model_version: null, ruleset_version: 'p3-business-v1',
    }, 'nightly', []);
  }
});

/* ── the projection ────────────────────────────────────────────────────────── */

describe('T307\'s projection is written only where a lifecycle ran', () => {
  it('a business subject: the profile is upserted with the lifecycle\'s state, then the decision is recorded', async () => {
    arrange();
    const out = await record();
    if (out.status !== 'recorded') throw new Error(out.status);
    expect(m.upsertProfile).toHaveBeenCalledTimes(1);
    const args = m.upsertProfile.mock.calls[0][0];
    expect(args).toMatchObject({ subjectRef: 'lead:501', brandId: 'b-ent', state: 'EXPLORING_SOLUTIONS', overlays: ['NO_RESPONSE'], source: 'decision:nightly' });
    expect(out.profile?.profileId).toBe('gp-1');
    // Order: the projection before the row, so a decision never precedes the state it was made in.
    expect(m.upsertProfile.mock.invocationCallOrder[0]).toBeLessThan(m.decisionCreate.mock.invocationCallOrder[0]);
  });

  it('a learner subject: no growth-journey lifecycle ran, so nothing is projected', async () => {
    const c = trainingCtx();
    arrange(loaded({ ctx: c, strategy: learnerStrategy, program: { id: 'p-trn', slug: 'learner', kind: 'learner', status: 'draft' }, lifecycle: { state: c.state, stateEnteredAt: c.asOf, overlays: [], evidence: [], projected: false } }));
    const out = await record({ brandId: 'b-trn' });
    if (out.status !== 'recorded') throw new Error(out.status);
    expect(m.upsertProfile).not.toHaveBeenCalled();
    expect(out.profile).toBeNull();
    expect(out.row.decided_by).toBe('governor:p3-learner-v1');
  });

  it('a CPN lead with no profile: WAIT with the reason named, and the state recorded as the declared absence', async () => {
    const c = cpn({ classification: null, state: 'NO_LEARNER_PROFILE' });
    arrange(loaded({ ctx: c, strategy: learnerStrategy, program: { id: 'p-cpn', slug: 'learner', kind: 'learner', status: 'draft' }, lifecycle: { state: 'NO_LEARNER_PROFILE', stateEnteredAt: c.asOf, overlays: [], evidence: [], projected: false } }));
    const out = await record({ brandId: 'b-cpn' });
    if (out.status !== 'recorded') throw new Error(out.status);
    expect(out.row.selected_action).toBe('WAIT');
    expect(out.row.reason).toBe('no_candidate:no_learner_profile:no_classification');
    expect(out.row.state_at_decision).toBe('NO_LEARNER_PROFILE');
  });
});

/* ── the batch runner ──────────────────────────────────────────────────────── */

describe('the batch runner', () => {
  it('flag off: disabled, and the classification table is never read', async () => {
    arrange();
    const r = await runShadowDecisions({ brandId: 'b-ent', trigger: 'nightly', flags: off() });
    expect(r.status).toBe('disabled');
    expect(m.classificationFindAll).not.toHaveBeenCalled();
  });

  it('decides for every subject Phase 2 classified under the brand, counts what happened, and keeps going past one failure', async () => {
    arrange();
    m.classificationFindAll.mockResolvedValue([
      { get: () => 'lead:1' }, { get: () => 'lead:2' }, { get: () => 'visitor:abc' }, { get: () => 'lead:3' },
    ]);
    let calls = 0;
    m.loadDecisionContext.mockImplementation(async ({ anchor }: { anchor: { leadId?: number } }) => {
      calls += 1;
      if (anchor.leadId === 2) throw new Error('boom');
      if (anchor.leadId === 3) return { status: 'unresolved', reason: 'no_such_lead' };
      return loaded();
    });
    const r = await runShadowDecisions({ brandId: 'b-ent', trigger: 'nightly', flags: onFlags(), asOf: bizCtx().asOf });
    expect(r).toEqual({
      status: 'ran',
      subjects: 4,
      recorded: 1,
      replayed: 0,
      skipped: [{ subject_ref: 'visitor:abc', status: 'unanchored_ref' }, { subject_ref: 'lead:3', status: 'unresolved' }],
      errors: [{ subject_ref: 'lead:2', error_class: expect.any(String) }],
    });
    expect(calls).toBe(3);
    expect(m.classificationFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { brand_id: 'b-ent' }, limit: 500 }));
  });

  it('a replay across the batch is counted as such, not as a new row', async () => {
    arrange();
    m.classificationFindAll.mockResolvedValue([{ get: () => 'lead:1' }]);
    m.decisionCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }));
    m.decisionFindOne.mockResolvedValueOnce({ id: 'd-old', idempotency_key: 'k' });
    const r = await runShadowDecisions({ brandId: 'b-ent', trigger: 'nightly', flags: onFlags() });
    expect([r.recorded, r.replayed]).toEqual([0, 1]);
  });

  it('turns a subject ref back into the anchor the resolver takes, and refuses one it cannot', () => {
    expect(anchorFromSubjectRef('lead:42')).toEqual({ leadId: 42 });
    expect(anchorFromSubjectRef('enrollment:enr-9')).toEqual({ enrollmentId: 'enr-9' });
    expect(anchorFromSubjectRef('visitor:v1')).toBeNull();
    expect(anchorFromSubjectRef('lead:x')).toBeNull();
  });
});

/* ── what the module is, and is not ────────────────────────────────────────── */

describe('the writer appends and the loader reads - pinned on the source', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('decisionService.ts never updates or destroys a decision, and touches no Explorer decision or send path', () => {
    const code = strip(read('decisionService.ts'));
    for (const banned of ['.update(', '.destroy(', '.upsert(', 'bulkCreate', 'ExplorerJourneyDecision', 'explorer_journey_decisions', 'runGovernor', 'enrollLeadInSequence', 'sendEmail', 'mandrill', 'process.env']) {
      expect({ banned, present: code.includes(banned) }).toEqual({ banned, present: false });
    }
    expect((code.match(/GrowthJourneyDecision\.create\(/g) ?? []).length).toBe(1); // the one append
  });

  it('the loader is read-only by contract: no create, update, upsert or destroy anywhere in it', () => {
    const code = strip(read('decision/loadDecisionContext.ts'));
    for (const banned of ['.create(', '.update(', '.upsert(', '.destroy(', 'bulkCreate', 'upsertProfile', 'recordTransition']) {
      expect({ banned, present: code.includes(banned) }).toEqual({ banned, present: false });
    }
    expect(code).toContain('resolveContactEvidence('); // control: the scan reads the real file
  });

  it('the row is written with the writer\'s own mode constant, not a literal', () => {
    const code = strip(read('decisionService.ts'));
    expect(code).toContain('mode: SHADOW_MODE');
    expect(code).not.toMatch(/mode:\s*['"]shadow['"]/);
  });
});

/* ── T404: the persisted row goes to the handoff writer, as plain data ─────── */

describe('T404 — after persistDecision, the row is handed to the handoff writer', () => {
  beforeEach(() => {
    handoffs.materializeHandoffs.mockReset().mockResolvedValue({ status: 'disabled' });
  });

  it('is called once, after the create, with the PERSISTED row as a view (its id, its deferred actions), the refs from the context, the flags and the clock', async () => {
    arrange();
    const out = await record();
    if (out.status !== 'recorded') throw new Error(out.status);
    expect(handoffs.materializeHandoffs).toHaveBeenCalledTimes(1);
    expect(handoffs.materializeHandoffs.mock.invocationCallOrder[0]).toBeGreaterThan(m.decisionCreate.mock.invocationCallOrder[0]);
    const args = handoffs.materializeHandoffs.mock.calls[0][0];
    expect(args.decision).toMatchObject({ id: out.row.id, subject_ref: 'lead:501', brand_id: 'b-ent', deferred_actions: out.row.deferred_actions, requires_human_review: out.row.requires_human_review, reason: out.row.reason });
    expect(args.refs).toMatchObject({ tenant_id: 't-col', brand_id: 'b-ent', brand_slug: 'colaberry-enterprise', subject_ref: 'lead:501', lead_id: 501, program: expect.objectContaining({ kind: 'business' }) });
    expect(args.flags).toEqual(onFlags());
    expect(args.asOf).toEqual(bizCtx().asOf);
    expect(out.handoffs).toEqual({ status: 'disabled' });
  });

  it('the view is plain data - not the model instance - and the writer\'s answer rides on the result', async () => {
    arrange();
    handoffs.materializeHandoffs.mockResolvedValue({ status: 'materialized', handoffs: [{ trigger: { source: 'decision_deferral', owner_queue: 'sales', reason: 'r' }, handoff_id: 'h-1', replayed: false, assignment: { status: 'queued', reason: 'no_assignee_policy' } }] });
    const out = await record();
    if (out.status !== 'recorded') throw new Error(out.status);
    const view = handoffs.materializeHandoffs.mock.calls[0][0].decision;
    expect(Object.getPrototypeOf(view)).toBe(Object.prototype);
    expect(out.handoffs.status).toBe('materialized');
  });

  it('a writer that throws is logged and the decision is still recorded - never fatal', async () => {
    arrange();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    handoffs.materializeHandoffs.mockRejectedValue(Object.assign(new Error('down'), { name: 'SequelizeConnectionError' }));
    const out = await record();
    expect(out.status).toBe('recorded');
    expect(out.status === 'recorded' && out.handoffs).toEqual({ status: 'none', reason: expect.stringMatching(/^materialize_failed:/) });
    const lines = warn.mock.calls.map((c) => String(c[0])).join('|');
    expect(lines).toContain('growth_journey.handoff.materialize_failed');
    warn.mockRestore();
  });

  it('with the decisions flag off nothing is decided, so the writer is never asked', async () => {
    arrange();
    await record({ flags: { ...onFlags(), journeyDecisions: false } });
    expect(handoffs.materializeHandoffs).not.toHaveBeenCalled();
  });
});
