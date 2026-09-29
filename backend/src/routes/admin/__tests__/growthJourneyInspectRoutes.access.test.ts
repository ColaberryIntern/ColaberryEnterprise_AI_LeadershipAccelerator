import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T607 — the seven inspect routes' access matrix, the boundary, and the privacy
 * property end to end.
 *
 * `requireAdmin`, the router, the controllers, the Zod schemas and the four read
 * services are REAL; only the models, the membership bridge and the audit sink
 * are mocked. So the adversarial values below travel the whole way out: a score
 * JSONB whose factors quote an address, a transition reason and requester
 * carrying one, an approver, a queue assignee and a conversation owner - and no
 * `@` reaches any of the seven responses.
 *
 * The last describe is the one that would have caught a real bug rather than a
 * regression: `/handoffs/policies` only works because this router is mounted
 * ABOVE the Phase 4 router that owns `/handoffs/:id`, and the control proves
 * the wrong order swallows it.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false };
// `databaseUrl`: the router reaches two model FILES for their exported constants, and a model file
// builds a Sequelize instance at load. It never connects (the models are mocked), but it must exist.
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', databaseUrl: 'postgres://test:test@localhost:5432/test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));

const m = {
  snapshots: jest.fn(), transitions: jest.fn(), runs: jest.fn(), policies: jest.fn(),
  rules: jest.fn(), queuePolicies: jest.fn(), handoffs: jest.fn(), conversations: jest.fn(),
  receipts: jest.fn(), outcomes: jest.fn(), handoffCount: jest.fn(), outcomeCount: jest.fn(),
  holdoutPolicy: jest.fn(), decisionCount: jest.fn(), decisionFindAll: jest.fn(), conversionOutcomes: jest.fn(),
  decisions: jest.fn(), executions: jest.fn(), agents: jest.fn(),
};
jest.mock('../../../models', () => ({
  GrowthJourneyScoreSnapshot: { findAndCountAll: (...a: unknown[]) => m.snapshots(...a) },
  GrowthJourneyTransition: { findAndCountAll: (...a: unknown[]) => m.transitions(...a) },
  AiAgentActivityLog: { findAndCountAll: (...a: unknown[]) => m.runs(...a) },
  BrandOfferPolicy: { findAndCountAll: (...a: unknown[]) => m.policies(...a) },
  GrowthJourneyContentRule: { findAndCountAll: (...a: unknown[]) => m.rules(...a) },
  GrowthJourneyPolicy: {
    findAndCountAll: (...a: unknown[]) => m.queuePolicies(...a),
    findOne: (...a: unknown[]) => m.holdoutPolicy(...a),
  },
  GrowthJourneyHandoff: {
    findAndCountAll: (...a: unknown[]) => m.handoffs(...a),
    findAll: (...a: unknown[]) => m.handoffs(...a),
    count: (...a: unknown[]) => m.handoffCount(...a),
  },
  GrowthJourneyConversationOwnership: { findAndCountAll: (...a: unknown[]) => m.conversations(...a) },
  GrowthJourneyExecution: { findAndCountAll: (...a: unknown[]) => m.receipts(...a), findAll: (...a: unknown[]) => m.executions(...a) },
  GrowthJourneyOutcome: {
    findAndCountAll: (...a: unknown[]) => m.outcomes(...a),
    findAll: (...a: unknown[]) => m.conversionOutcomes(...a),
  },
  GrowthJourneyDecision: {
    findAll: (...a: unknown[]) => m.decisionFindAll(...a),
    count: (...a: unknown[]) => m.decisionCount(...a),
  },
  AiAgent: { findAll: (...a: unknown[]) => m.agents(...a) },
}));
jest.mock('../../../services/growthJourney/outcomes/handoffRatesQuery', () => ({
  loadHandoffRates: jest.fn().mockResolvedValue({ all: {}, by_queue: {} }),
  DEFAULT_RATES_WINDOW_DAYS: 30,
}));
jest.mock('../../../services/marketingAnalyticsService', () => ({ getCampaignMetricsByJourney: jest.fn().mockResolvedValue([]) }));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyReadRoutes from '../growthJourneyReadRoutes';
import { getJourneyQueuePoliciesHandler } from '../../../controllers/growthJourneyInspectController';

const JOURNEY = '/api/admin/growth-journey';
/** The seven, and whether the read is brand-scoped (shadow runs is not — its table has no brand). */
const ROUTES = [
  ['decisions/snapshots', true],
  ['decisions/transitions', true],
  ['shadow/runs', false],
  ['content/policies', true],
  ['content/rules', true],
  ['handoffs/policies', true],
  ['handoffs/ownership', true],
  ['experiments', true],
] as const;
const PATHS = ROUTES.map(([p]) => p);
const SCOPED = ROUTES.filter(([, scoped]) => scoped).map(([p]) => p);

const TENANT = '10000000-0000-4000-8000-000000000002';
const BRAND = '20000000-0000-4000-8000-000000000002';
const OTHER_BRAND = '20000000-0000-4000-8000-000000000009';

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
const app = () => express().use(express.json()).use(growthJourneyReadRoutes);
const auth = (r: request.Test, role = 'admin') => r.set('Authorization', `Bearer ${token(role)}`);
const memberOf = (brandId: string | null, authorized: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId: TENANT, brandId, organizationId: null, roles: ['tenant_admin'],
  isPlatformSuperAdmin: false, authorizedTenantIds: [TENANT], authorizedBrandIds: authorized,
});

function setMaster(on: boolean): void {
  growthJourney.growthJourneyEnabled = on;
  if (on) process.env.GROWTH_JOURNEY_ENABLED = 'true';
  else delete process.env.GROWTH_JOURNEY_ENABLED;
}

const AT = new Date('2026-09-28T10:00:00Z');
const row = (values: Record<string, unknown>) => ({ get: (k: string) => values[k] });

beforeEach(() => {
  jest.clearAllMocks();
  setMaster(true);
  for (const spy of [m.snapshots, m.transitions, m.runs, m.policies, m.rules, m.queuePolicies, m.handoffs, m.conversations, m.receipts, m.outcomes]) {
    spy.mockResolvedValue({ rows: [], count: 0 });
  }
  m.handoffCount.mockResolvedValue(0);
  m.outcomeCount.mockResolvedValue(0);
  m.holdoutPolicy.mockResolvedValue(null);
  m.decisionCount.mockResolvedValue(0);
  m.decisionFindAll.mockResolvedValue([]);
  m.conversionOutcomes.mockResolvedValue([]);
  m.executions.mockResolvedValue([]);
  m.agents.mockResolvedValue([]);
  contextFromAdminRequest.mockResolvedValue(memberOf(null, [BRAND]));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setMaster(false);
  expect(recordAccessDecision).not.toHaveBeenCalled(); // a GET is never audited
  jest.restoreAllMocks();
});

describe('the status matrix, on all eight routes', () => {
  it.each(PATHS)('401 unauthenticated: %s', async (path) => {
    expect((await request(app()).get(`${JOURNEY}/${path}`)).status).toBe(401);
  });

  it.each(PATHS)('403 for a scoped management role: %s', async (path) => {
    expect((await auth(request(app()).get(`${JOURNEY}/${path}`), 'manager')).status).toBe(403);
  });

  it.each(PATHS)('404 with the master flag off, before anything is read: %s', async (path) => {
    setMaster(false);
    const res = await auth(request(app()).get(`${JOURNEY}/${path}`));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it.each(PATHS)('200 for an admin: %s', async (path) => {
    expect((await auth(request(app()).get(`${JOURNEY}/${path}`))).status).toBe(200);
  });

  it.each(SCOPED)('403 on a brand outside the caller\'s scope, before any read: %s', async (path) => {
    contextFromAdminRequest.mockResolvedValue(memberOf(null, [BRAND]));
    const res = await auth(request(app()).get(`${JOURNEY}/${path}?brand_id=${OTHER_BRAND}`));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Brand not in scope', error_class: 'AuthorizationError' });
    for (const spy of [m.snapshots, m.transitions, m.policies, m.rules, m.queuePolicies, m.handoffs,
      m.conversations, m.holdoutPolicy, m.decisionCount, m.conversionOutcomes]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it.each(SCOPED)('an admin with no membership gets an empty page, not an error: %s', async (path) => {
    contextFromAdminRequest.mockResolvedValue(memberOf(null, []));
    const res = await auth(request(app()).get(`${JOURNEY}/${path}`));
    expect(res.status).toBe(200);
    for (const spy of [m.snapshots, m.transitions, m.policies, m.rules, m.queuePolicies, m.handoffs,
      m.conversations, m.holdoutPolicy, m.decisionCount, m.conversionOutcomes]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('shadow runs is the one read that is not brand-scoped, and says so', () => {
  it('answers an admin with NO membership, because a cron run has no brand to scope', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(null, []));
    const res = await auth(request(app()).get(`${JOURNEY}/shadow/runs`));
    expect(res.status).toBe(200);
    expect(m.runs).toHaveBeenCalledTimes(1); // unlike every other read on this router
    expect(res.body.scope).toEqual({ tenant_id: TENANT, brand_id: null, program_id: null });
    expect(res.body.counts_available).toBe(false);
  });

  it('a `brand_id` is not accepted, so the answer never claims a filter that did not run', async () => {
    const res = await auth(request(app()).get(`${JOURNEY}/shadow/runs?brand_id=${BRAND}`));
    expect(res.status).toBe(200);
    expect(res.body.scope.brand_id).toBeNull();
    expect(Object.keys((m.runs.mock.calls[0][0] as { where: Record<string, unknown> }).where)).toEqual(['action', 'created_at']);
  });
});

describe('the query is validated at the boundary', () => {
  it.each([
    ['decisions/snapshots?limit=101', 'the page cap'],
    ['decisions/transitions?limit=0', 'a zero page'],
    ['decisions/snapshots?subject_ref=lead:ali@example.com', 'an address in a subject filter'],
    ['decisions/transitions?subject_ref=not-a-pointer', 'a subject that is not a pointer'],
    ['shadow/runs?window_days=366', 'the window cap'],
    ['shadow/runs?agent=OpenClawContentAgent', 'an agent outside the registry'],
    ['shadow/runs?result=maybe', 'a result outside the model union'],
    ['content/policies?offer_family=not_a_family', 'an unknown offer family'],
    ['content/policies?decision=maybe', 'a decision outside allow/deny'],
    ['content/policies?status=archived', 'a status outside the model union'],
    ['content/rules?approval_status=aaaaaaaaaaaaaaaaaaa', 'an over-long approval status'],
    ['handoffs/policies?owner_queue=marketing', 'a queue outside the six'],
    ['handoffs/ownership?offset=-1', 'a negative offset'],
  ])('400 on %s (%s), before anything is read', async (qs) => {
    const res = await auth(request(app()).get(`${JOURNEY}/${qs}`));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('accepts the vocabularies it declares', async () => {
    for (const qs of [
      'decisions/snapshots?subject_ref=lead:9',
      'decisions/transitions?subject_ref=enrollment:11111111-2222-4333-8444-555555555555',
      'shadow/runs?agent=GrowthJourneyExecutor&result=failed&window_days=365',
      'content/policies?offer_family=business_training&decision=deny&status=active',
      'content/rules?approval_status=draft',
      'handoffs/policies?policy_type=queue_capacity&owner_queue=sales',
      // T608 added this type to the union, so T607's cell asserting it was a 400 became wrong.
      // The queue-policy read filters by it like any other type; the holdout row simply has no
      // `owner_queue`, so it answers an empty page rather than a refusal.
      'handoffs/policies?policy_type=holdout_experiment',
    ]) {
      expect((await auth(request(app()).get(`${JOURNEY}/${qs}`))).status).toBe(200);
    }
  });
});

describe('the privacy property, end to end through the real services', () => {
  it('no `@` reaches any of the eight responses - values, JSONB keys and JSONB lists alike', async () => {
    m.snapshots.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 's1', brand_id: BRAND, subject_ref: 'lead:9', as_of_date: '2026-09-27', state: 'ACTIVATING',
        // The JSONB nothing validates: a factor quoting a reply, and a non-numeric dimension.
        // Poisoned in four places at once: a factor, a dimension KEY, a non-numeric value, and a gap.
        scores: { summary: 40, dimensions: [{ key: 'engagement', label: 'Engagement', value: 9, source: 'reply', factors: ['replied from ali@example.com'] }, { key: 'owner ali@example.com', value: 2 }, { key: 'note', value: 'call bob@example.org' }] },
        score_gaps: ['fit', 'no_reply_from bob@example.org'], created_at: AT,
      })],
    });
    m.transitions.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 't1', brand_id: BRAND, program_id: null, subject_ref: 'lead:9', transition_type: 'state_changed',
        status: 'applied', from_value: { state: 'EXPLORING', note: 'x@y.com' }, to_value: { state: 'ACTIVATING' },
        reason: 'operator ali@example.com asked', requested_by: 'admin:ali@example.com', created_at: AT,
      })],
    });
    m.runs.mockResolvedValue({
      count: 1,
      rows: [row({ id: 'r1', action: 'GrowthJourneyExecutor', result: 'failed', duration_ms: 12, trace_id: 'tr', created_at: AT })],
    });
    m.policies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'p1', brand_id: BRAND, offer_family: 'business_training', decision: 'deny', status: 'active',
        effective_from: AT, effective_to: null,
        approved_landing_pages: ['https://x.test/a', 'mailto:sales@colaberry.com'],
        approved_claims: ['c'], approved_ctas: [], required_approvals: ['legal', 'sign-off ali@example.com'],
        notes: 'spoke to ali@example.com about this',
      })],
    });
    m.rules.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'cr1', brand_id: BRAND, offer_family: null, collection_key: 'k', asset_id: null, version: 1,
        approval_status: 'draft', approved_by: 'ali@example.com', approved_at: AT, approved_claims: [],
        access_tier: null, effective_from: null, expires_at: null,
        source_evidence: [{ quote: 'from bob@example.org' }],
      })],
    });
    m.queuePolicies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'q1', brand_id: BRAND, policy_type: 'queue_assignee', owner_queue: 'sales', daily_capacity: null,
        sla_hours: 24, assigned_to_type: 'user', assigned_to_id: 'rep@example.com', cooldown_days: null, status: 'active',
      })],
    });
    m.handoffs.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'h1', brand_id: BRAND, subject_ref: 'lead:9', owner_queue: 'sales', status: 'accepted',
        assigned_to_type: 'user', assigned_to_id: 'rep@example.com', accepted_at: AT, created_at: AT,
      })],
    });
    m.conversations.mockResolvedValue({
      count: 1,
      rows: [row({ id: 'c1', brand_id: BRAND, lead_id: 9, owner_type: 'human', owner_id: 'rep@example.com', channel: 'email', source: 'handoff_accepted', since_at: AT })],
    });
    // `/experiments` was in PATHS from the moment it existed, but `beforeEach` leaves the policy
    // null - so this cell walked that route over an empty body and could not have failed whatever
    // the code did. An ACTIVE policy now, with an address in the one operator-authored list the
    // response carries. (T608's second verifier pass caught exactly this.)
    m.holdoutPolicy.mockResolvedValue({
      get: (k: string) => ({
        brand_id: BRAND,
        status: 'active',
        settings: { experiment_key: 'gj_lift', control_share: 0.25, candidate_types: ['SEND_EMAIL', 'ali@example.com'] },
      })[k],
    });
    m.decisionCount.mockResolvedValue(12);
    m.conversionOutcomes.mockResolvedValue([{ get: () => 'd-1' }]);
    m.decisionFindAll.mockResolvedValue([{ get: () => 'lead:9' }]);

    for (const path of PATHS) {
      const res = await auth(request(app()).get(`${JOURNEY}/${path}`));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('@');
    }
  });

  it('an operator-authored `candidate_types` carrying an address is REDACTED, not echoed', async () => {
    m.holdoutPolicy.mockResolvedValue({
      get: (k: string) => ({
        brand_id: BRAND,
        status: 'active',
        settings: { experiment_key: 'gj_lift', control_share: 0.25, candidate_types: ['SEND_EMAIL', 'ali@example.com'] },
      })[k],
    });
    const res = await auth(request(app()).get(`${JOURNEY}/experiments`));
    expect(res.status).toBe(200);
    // The real action type survives; the address does not.
    expect(res.body.brands[0].policy.candidate_types).toEqual(['SEND_EMAIL', 'redacted']);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('the snapshot row keeps the numbers and drops the factors that carried the text', async () => {
    m.snapshots.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 's1', brand_id: BRAND, subject_ref: 'lead:9', as_of_date: '2026-09-27', state: null,
        scores: { summary: 40, dimensions: [{ key: 'engagement', value: 9, factors: ['replied from ali@example.com'] }, { key: 'rep@example.com', value: 4 }, { key: 'note', value: 'call bob@example.org' }] },
        score_gaps: [], created_at: AT,
      })],
    });
    const res = await auth(request(app()).get(`${JOURNEY}/decisions/snapshots`));
    expect(res.body.rows[0].scores).toEqual({
      summary: 40,
      dimensions: [{ key: 'engagement', value: 9 }, { key: 'redacted', value: 4 }],
      non_numeric_keys: ['note'],
    });
    expect(Object.keys(res.body.rows[0])).toEqual(['id', 'brand_id', 'subject_ref', 'as_of_date', 'state', 'scores', 'score_gaps', 'created_at']);
  });

  it('the content-rule row carries no `source_evidence` key at all', async () => {
    m.rules.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'cr1', brand_id: BRAND, offer_family: null, collection_key: 'k', asset_id: null, version: 2,
        approval_status: 'draft', approved_by: 'ops', approved_at: null, approved_claims: [{ a: 1 }],
        access_tier: null, effective_from: null, expires_at: null, source_evidence: [{ quote: 'x' }],
      })],
    });
    const res = await auth(request(app()).get(`${JOURNEY}/content/rules`));
    expect(Object.keys(res.body.rows[0])).not.toContain('source_evidence');
    expect(res.body.rows[0]).toMatchObject({ version: 2, claims_count: 1, approved_by: 'ops' });
  });
});

describe('the experiments read (T608)', () => {
  it('a brand with no policy answers a named absence and counts nothing', async () => {
    const res = await auth(request(app()).get(`${JOURNEY}/experiments`));
    expect(res.status).toBe(200);
    expect(res.body.brands).toEqual([{ brand_id: BRAND, status: 'no_policy', policy: null, lift: null }]);
    // No experiment key to count by, so the decision counts are never asked for.
    expect(m.decisionCount).not.toHaveBeenCalled();
    expect(m.conversionOutcomes).not.toHaveBeenCalled();
    expect(res.body.conversion_outcomes).toEqual(['enrolled_paid', 'subscription_active', 'project_started']);
  });

  it('an active policy reports the lift as UNAVAILABLE below the floor of 100 per arm', async () => {
    m.holdoutPolicy.mockResolvedValue({
      get: (k: string) => ({ brand_id: BRAND, status: 'active', settings: { experiment_key: 'gj_lift', control_share: 0.5 } })[k],
    });
    m.decisionCount.mockResolvedValue(12);
    // Three conversion outcomes, all landing on decisions in the arm - so `converted` is the number
    // of distinct SUBJECTS, which is the unit `MIN_ARM_N` is a floor on.
    m.conversionOutcomes.mockResolvedValue([{ get: () => 'd-1' }, { get: () => 'd-2' }, { get: () => 'd-3' }]);
    m.decisionFindAll.mockResolvedValue([
      { get: () => 'lead:1' }, { get: () => 'lead:2' }, { get: () => 'lead:2' },
    ]);
    const res = await auth(request(app()).get(`${JOURNEY}/experiments`));
    expect(res.status).toBe(200);
    const brand = res.body.brands[0];
    expect(brand.status).toBe('active');
    expect(brand.lift).toMatchObject({ experiment_key: 'gj_lift', min_arm_n: 100, capped: false });
    // THE UNIT IS PEOPLE. `growth_journey_decisions` is append-only - one row per subject per
    // decision_date - so counting rows would inflate `n` by the number of days a subject stays
    // eligible, and would inflate the arms unevenly (a control subject keeps getting WAIT rows).
    // `MIN_ARM_N = 100` is a floor on people, so the count must be DISTINCT subject_ref.
    expect(m.decisionCount.mock.calls[0][0]).toMatchObject({ distinct: true, col: 'subject_ref' });
    // Two distinct subjects out of three conversion rows.
    expect(brand.lift.treatment).toEqual({ n: 12, converted: 2, capped: false });
    expect(brand.lift.lift.known).toBe(false);
    expect(brand.lift.lift.reason).toContain('needs 100 per arm');
  });

  it('an arm larger than the cap is refused rather than counted over a slice', async () => {
    m.holdoutPolicy.mockResolvedValue({
      get: (k: string) => ({ brand_id: BRAND, status: 'active', settings: { experiment_key: 'gj_lift', control_share: 0.5 } })[k],
    });
    m.decisionCount.mockResolvedValue(5_001);
    const res = await auth(request(app()).get(`${JOURNEY}/experiments`));
    const lift = res.body.brands[0].lift;
    expect(lift).toMatchObject({ capped: true, max_arm_decisions: 5_000 });
    // An UNCOUNTED arm reports null, never 0 - and the lift is not a number at all.
    expect(lift.treatment).toEqual({ n: 5_001, converted: null, capped: true });
    expect(lift.lift.known).toBe(false);
    expect(lift.lift.reason).toContain('arm_capped');
    expect(m.decisionFindAll).not.toHaveBeenCalled();
  });

  it('a capped arm against a real one NEVER serves a negative lift from an uncounted numerator', async () => {
    // The defect this replaced: `converted: 0` on the capped arm went into `computeLift`, and
    // `wilsonInterval(0, n)` answers `known: true, point: 0` - so a capped treatment arm against a
    // converting control reported that the message made things WORSE, from a numerator nobody
    // counted. "Say insufficient data, not a plausible-looking number."
    m.holdoutPolicy.mockResolvedValue({
      get: (k: string) => ({ brand_id: BRAND, status: 'active', settings: { experiment_key: 'gj_lift', control_share: 0.5 } })[k],
    });
    m.decisionCount.mockImplementation(async (q: { where: { holdout_group: string } }) => (q.where.holdout_group === 'treatment' ? 5_001 : 200));
    m.conversionOutcomes.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ get: () => `d-${i}` })));
    m.decisionFindAll.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ get: () => `lead:${i}` })));
    const res = await auth(request(app()).get(`${JOURNEY}/experiments`));
    const lift = res.body.brands[0].lift;
    expect(lift.treatment).toEqual({ n: 5_001, converted: null, capped: true });
    expect(lift.lift.known).toBe(false);
    expect(lift.lift).not.toHaveProperty('point');
    expect(JSON.stringify(lift.lift)).not.toContain('-0.');
  });

  it('a `window_days` beyond the cap is a 400, and the default is 90', async () => {
    expect((await auth(request(app()).get(`${JOURNEY}/experiments?window_days=366`))).status).toBe(400);
    const res = await auth(request(app()).get(`${JOURNEY}/experiments`));
    expect(res.body.window_days).toBe(90);
  });
});

describe('the mount order that makes `/handoffs/policies` reachable at all', () => {
  /** A stand-in for Phase 4's `GET /api/admin/growth-journey/handoffs/:id`. */
  const byIdRouter = () => {
    const r = express.Router();
    r.get(`${JOURNEY}/handoffs/:id`, (_req, res) => { res.json({ swallowed_by: 'handoffs/:id' }); });
    return r;
  };

  it('mounted FIRST, as `adminRoutes` does, the policies route wins', async () => {
    const a = express().use(express.json()).use(growthJourneyReadRoutes).use(byIdRouter());
    const res = await auth(request(a).get(`${JOURNEY}/handoffs/policies`));
    expect(res.status).toBe(200);
    expect(res.body.swallowed_by).toBeUndefined();
    expect(res.body).toHaveProperty('rows');
  });

  it('CONTROL: mounted second, `/handoffs/:id` swallows it - which is why the order is pinned', async () => {
    const a = express().use(express.json()).use(byIdRouter()).use(growthJourneyReadRoutes);
    const res = await auth(request(a).get(`${JOURNEY}/handoffs/policies`));
    expect(res.body).toEqual({ swallowed_by: 'handoffs/:id' });
  });

  it('`adminRoutes.ts` really does mount the read router above the Phase 4 one', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'adminRoutes.ts'), 'utf8') as string;
    const read = src.indexOf('router.use(growthJourneyReadRoutes)');
    const main = src.indexOf('router.use(growthJourneyRoutes)');
    expect(read).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(-1);
    expect(read).toBeLessThan(main);
  });
});

describe('the failure path is one body for the whole read surface', () => {
  it('a read that throws is a 500 carrying only the error class', async () => {
    m.queuePolicies.mockRejectedValue(Object.assign(new Error('nope'), { name: 'SequelizeConnectionError' }));
    const res = await auth(request(app()).get(`${JOURNEY}/handoffs/policies`));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Journey read failed', error_class: 'SequelizeConnectionError' });
  });

  it('every handler is exported and wired - no route points at a stub', () => {
    expect(typeof getJourneyQueuePoliciesHandler).toBe('function');
  });
});
