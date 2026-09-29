const m = {
  snapshots: jest.fn(),
  transitions: jest.fn(),
  runs: jest.fn(),
  policies: jest.fn(),
  rules: jest.fn(),
  queuePolicies: jest.fn(),
  handoffs: jest.fn(),
  conversations: jest.fn(),
};

// `databaseUrl` because two of these services import a model FILE for its exported constants
// (`OPEN_HANDOFF_STATUSES`, `subjectRef`), and a model file loads `config/database`, which builds a
// Sequelize instance. It never connects - the models are mocked below - but it must be constructible.
jest.mock('../../../config/env', () => ({
  env: { nodeEnv: 'test', databaseUrl: 'postgres://test:test@localhost:5432/test' },
}));
jest.mock('../../../models', () => ({
  GrowthJourneyScoreSnapshot: { findAndCountAll: (...a: unknown[]) => m.snapshots(...a) },
  GrowthJourneyTransition: { findAndCountAll: (...a: unknown[]) => m.transitions(...a) },
  AiAgentActivityLog: { findAndCountAll: (...a: unknown[]) => m.runs(...a) },
  BrandOfferPolicy: { findAndCountAll: (...a: unknown[]) => m.policies(...a) },
  GrowthJourneyContentRule: { findAndCountAll: (...a: unknown[]) => m.rules(...a) },
  GrowthJourneyPolicy: { findAndCountAll: (...a: unknown[]) => m.queuePolicies(...a) },
  GrowthJourneyHandoff: { findAndCountAll: (...a: unknown[]) => m.handoffs(...a) },
  GrowthJourneyConversationOwnership: { findAndCountAll: (...a: unknown[]) => m.conversations(...a) },
}));

import { Op } from 'sequelize';
import { OPEN_HANDOFF_STATUSES } from '../../../models/GrowthJourneyHandoff';
import { SHADOW_AGENTS } from '../../../schemas/growthJourneySchema';
import { numericScores, readScoreSnapshots, readTransitions } from '../reads/decisionReadsAdmin';
import { readContentRules, readOfferPolicies } from '../reads/contentReads';
import { readOwnership, readQueuePolicies } from '../reads/handoffPolicyReads';
import { JOURNEY_CRON_AGENTS, readShadowRuns } from '../reads/shadowRunsRead';
import { DEFAULT_PAGE, MAX_PAGE } from '../reads/readPaging';

/**
 * T607 — the seven inspect reads.
 *
 * The properties, in the order they would hurt if wrong:
 *
 *   1. NO FREE TEXT LEAVES. `notes`, `source_evidence` and `stack_trace` are
 *      never requested; `reason`, `requested_by`, `approved_by`,
 *      `assigned_to_id` and `owner_id` go through `safeField`; and the score
 *      JSONB is reduced to numbers rather than echoed, because nothing in the
 *      schema makes it numeric.
 *   2. THE SCOPE IS THE CALLER'S. An empty scope reads nothing WITHOUT a query,
 *      on every read that has a brand column.
 *   3. THE AGENT FILTER CANNOT WIDEN past the three the registry declares.
 */

const BRAND_A = 'brand-a';
const BRAND_B = 'brand-b';
const AT = new Date('2026-09-28T12:00:00Z');
const row = (values: Record<string, unknown>) => ({ get: (k: string) => values[k] });
const attrsOf = (spy: jest.Mock): string[] => (spy.mock.calls[0][0] as { attributes: string[] }).attributes;
const whereOf = (spy: jest.Mock): Record<string, unknown> => (spy.mock.calls[0][0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  jest.clearAllMocks();
  for (const spy of Object.values(m)) spy.mockResolvedValue({ rows: [], count: 0 });
});

/* ── the score JSONB is made numeric, not trusted to be ─────────────────────── */

describe('numericScores: the contract the column does not have', () => {
  it('keeps the finite numbers out of a ScoreVector and names every key it refused', () => {
    expect(numericScores({
      summary: 71.5,
      available: true,
      computed_at: '2026-09-28',
      dimensions: [
        { key: 'engagement', label: 'Engagement', value: 80, source: 'events', factors: [{ note: 'replied from ali@example.com' }] },
        { key: 'intent', label: 'Intent', value: null, source: 'form', factors: [] },
        { key: 'fit', value: 'high', factors: [] },
      ],
    })).toEqual({
      summary: 71.5,
      dimensions: [{ key: 'engagement', value: 80 }],
      non_numeric_keys: ['intent', 'fit'],
    });
  });

  it('a flat numeric map - the shape the plan expected - works the same way', () => {
    expect(numericScores({ summary: 3, e: 1, i: 2, note: 'call ali@example.com' })).toEqual({
      summary: 3,
      dimensions: [{ key: 'e', value: 1 }, { key: 'i', value: 2 }],
      non_numeric_keys: ['note'],
    });
  });

  it('NaN and Infinity are not numbers', () => {
    expect(numericScores({ summary: NaN, a: Infinity, b: -Infinity, c: 0 })).toEqual({
      summary: null,
      dimensions: [{ key: 'c', value: 0 }],
      non_numeric_keys: ['a', 'b'],
    });
  });

  it('null, an array and a string are all an empty result rather than a throw', () => {
    for (const bad of [null, undefined, [], ['a'], 'x', 7]) {
      expect(numericScores(bad)).toEqual({ summary: null, dimensions: [], non_numeric_keys: [] });
    }
  });

  it('caps a key at 64 characters, because nothing validates what is in there', () => {
    const long = 'k'.repeat(200);
    const out = numericScores({ [long]: 1 });
    expect(out.dimensions[0].key).toHaveLength(64);
  });
});

/* ── snapshots ──────────────────────────────────────────────────────────────── */

describe('score snapshots: the declared columns, and numbers out of the JSONB', () => {
  it('projects column by column and reduces `scores` to numbers', async () => {
    m.snapshots.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 's1', brand_id: BRAND_A, subject_ref: 'lead:9', as_of_date: '2026-09-27', state: 'ACTIVATING',
        scores: { summary: 12, dimensions: [{ key: 'e', value: 4, label: 'E', factors: ['x'] }] },
        score_gaps: ['fit', 7], created_at: AT,
      })],
    });
    const page = await readScoreSnapshots({ brandIds: [BRAND_A] });
    expect(page.rows).toEqual([{
      id: 's1', brand_id: BRAND_A, subject_ref: 'lead:9', as_of_date: '2026-09-27', state: 'ACTIVATING',
      scores: { summary: 12, dimensions: [{ key: 'e', value: 4 }], non_numeric_keys: [] },
      score_gaps: ['fit'],
      created_at: AT.toISOString(),
    }]);
    expect(JSON.stringify(page.rows)).not.toContain('factors');
    expect(JSON.stringify(page.rows)).not.toContain('label');
  });

  it('asks for the declared columns only - `overlays` is not one of them', async () => {
    await readScoreSnapshots({ brandIds: [BRAND_A] });
    expect(attrsOf(m.snapshots)).toEqual(['id', 'brand_id', 'subject_ref', 'as_of_date', 'state', 'scores', 'score_gaps', 'created_at']);
    expect(attrsOf(m.snapshots)).not.toContain('overlays');
  });

  it('filters by subject when asked, inside the brand scope', async () => {
    await readScoreSnapshots({ brandIds: [BRAND_A, BRAND_B], subjectRef: 'lead:9' });
    const where = whereOf(m.snapshots);
    expect((where.brand_id as Record<symbol, unknown>)[Op.in]).toEqual([BRAND_A, BRAND_B]);
    expect(where.subject_ref).toBe('lead:9');
  });

  it('an empty scope reads nothing, without a query', async () => {
    expect(await readScoreSnapshots({ brandIds: [] })).toEqual({ rows: [], total: 0, limit: DEFAULT_PAGE, offset: 0 });
    expect(m.snapshots).not.toHaveBeenCalled();
  });

  it('shares the one page cap', async () => {
    await readScoreSnapshots({ brandIds: [BRAND_A], limit: 10_000 });
    expect((m.snapshots.mock.calls[0][0] as { limit: number }).limit).toBe(MAX_PAGE);
  });
});

/* ── transitions ────────────────────────────────────────────────────────────── */

describe('transitions: the state out of the JSONB, and the reason redacted', () => {
  it('projects `from_value.state` / `to_value.state` and never the JSONB itself', async () => {
    m.transitions.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 't1', brand_id: BRAND_A, program_id: 'p1', subject_ref: 'lead:9',
        transition_type: 'state_changed', status: 'applied',
        from_value: { state: 'EXPLORING', overlays: ['high_intent'] },
        to_value: { state: 'ACTIVATING' },
        reason: 'enrolment ready', requested_by: 'system', created_at: AT,
      })],
    });
    const page = await readTransitions({ brandIds: [BRAND_A] });
    expect(page.rows[0]).toEqual({
      id: 't1', brand_id: BRAND_A, program_id: 'p1', subject_ref: 'lead:9',
      transition_type: 'state_changed', status: 'applied',
      from_state: 'EXPLORING', to_state: 'ACTIVATING',
      reason: 'enrolment ready', reason_redacted: false,
      requested_by: 'system', requested_by_redacted: false,
      created_at: AT.toISOString(),
    });
    expect(JSON.stringify(page.rows)).not.toContain('overlays');
  });

  it('a JSONB with no `state`, or a non-object, is null rather than a guess', async () => {
    m.transitions.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 't2', brand_id: BRAND_A, program_id: null, subject_ref: 'lead:9',
        transition_type: 'path_assigned', status: 'applied',
        from_value: null, to_value: { path: 'learner' }, reason: 'x', requested_by: 'system', created_at: AT,
      })],
    });
    const page = await readTransitions({ brandIds: [BRAND_A] });
    expect(page.rows[0].from_state).toBeNull();
    expect(page.rows[0].to_state).toBeNull();
  });

  it('an adversarial reason and requester are REDACTED and say so', async () => {
    m.transitions.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 't3', brand_id: BRAND_A, program_id: null, subject_ref: 'lead:9',
        transition_type: 'state_changed', status: 'applied', from_value: null, to_value: null,
        reason: 'operator ali@example.com asked for it', requested_by: 'admin:ali@example.com', created_at: AT,
      })],
    });
    const page = await readTransitions({ brandIds: [BRAND_A] });
    expect(page.rows[0]).toMatchObject({
      reason: 'redacted', reason_redacted: true, requested_by: 'redacted', requested_by_redacted: true,
    });
    expect(JSON.stringify(page.rows)).not.toContain('@');
  });

  it('never asks for `evidence`, `idempotency_key` or `lead_id`', async () => {
    await readTransitions({ brandIds: [BRAND_A] });
    for (const forbidden of ['evidence', 'idempotency_key', 'lead_id']) {
      expect(attrsOf(m.transitions)).not.toContain(forbidden);
    }
  });

  it('an empty scope reads nothing, without a query', async () => {
    expect((await readTransitions({ brandIds: [] })).total).toBe(0);
    expect(m.transitions).not.toHaveBeenCalled();
  });
});

/* ── shadow runs ────────────────────────────────────────────────────────────── */

describe('shadow runs: the three registered agents, and nothing a throw wrote', () => {
  it('the filter is the registry, and the schema restates it exactly', () => {
    expect(JOURNEY_CRON_AGENTS).toEqual(['GrowthJourneyShadowDecisions', 'GrowthJourneyExecutor', 'GrowthJourneyHandoffDigest']);
    // The one cross-check that catches a fourth agent being registered without this read learning of it.
    expect([...SHADOW_AGENTS]).toEqual([...JOURNEY_CRON_AGENTS]);
    expect(JOURNEY_CRON_AGENTS).not.toContain('GrowthJourneyHandoffs');
  });

  it('never requests `stack_trace`, `details` or `reason`', async () => {
    await readShadowRuns({ asOf: AT });
    expect(attrsOf(m.runs)).toEqual(['id', 'action', 'result', 'duration_ms', 'trace_id', 'created_at']);
    for (const forbidden of ['stack_trace', 'details', 'reason', 'before_state', 'after_state', 'execution_context']) {
      expect(attrsOf(m.runs)).not.toContain(forbidden);
    }
  });

  it('filters `action` to the three, over the asked window', async () => {
    await readShadowRuns({ windowDays: 30, asOf: AT });
    const where = whereOf(m.runs);
    expect((where.action as Record<symbol, unknown>)[Op.in]).toEqual([...JOURNEY_CRON_AGENTS]);
    const window = where.created_at as Record<symbol, Date>;
    expect(window[Op.gte]).toEqual(new Date('2026-08-29T12:00:00Z'));
    expect(window[Op.lte]).toEqual(AT);
  });

  it('an `agent` filter can only NARROW - an unregistered name cannot widen the list', async () => {
    await readShadowRuns({ agent: 'GrowthJourneyExecutor', asOf: AT });
    expect((whereOf(m.runs).action as Record<symbol, unknown>)[Op.in]).toEqual(['GrowthJourneyExecutor']);
    m.runs.mockClear();
    await readShadowRuns({ agent: 'OpenClawContentAgent', asOf: AT });
    expect((whereOf(m.runs).action as Record<symbol, unknown>)[Op.in]).toEqual([...JOURNEY_CRON_AGENTS]);
  });

  it('projects the agent out of `action`, and says there are no per-run counts', async () => {
    m.runs.mockResolvedValue({
      count: 1,
      rows: [row({ id: 'r1', action: 'GrowthJourneyExecutor', result: 'success', duration_ms: 1200, trace_id: 'tr-1', created_at: AT })],
    });
    const out = await readShadowRuns({ asOf: AT });
    expect(out.rows).toEqual([{ id: 'r1', agent: 'GrowthJourneyExecutor', result: 'success', duration_ms: 1200, trace_id: 'tr-1', started_at: AT.toISOString() }]);
    expect(out.counts_available).toBe(false);
    expect(out.agents).toEqual([...JOURNEY_CRON_AGENTS]);
  });

  it('is NOT brand-scoped, on purpose: the table has no brand and a cron run is one process', async () => {
    const out = await readShadowRuns({ asOf: AT });
    expect(m.runs).toHaveBeenCalledTimes(1); // no membership, and it still reads
    expect(Object.keys(whereOf(m.runs))).toEqual(['action', 'created_at']);
    expect(JSON.stringify(out.rows)).not.toContain('brand');
  });

  it('clamps the window and the page', async () => {
    await readShadowRuns({ windowDays: 5_000, limit: 10_000, asOf: AT });
    expect((m.runs.mock.calls[0][0] as { limit: number }).limit).toBe(MAX_PAGE);
    expect((whereOf(m.runs).created_at as Record<symbol, Date>)[Op.gte]).toEqual(new Date('2025-09-28T12:00:00Z'));
  });
});

/* ── content: offer policies and content rules ──────────────────────────────── */

describe('offer policies: the row, never the notes, and no verdict', () => {
  it('never asks for `notes`, and reports claims and CTAs as counts', async () => {
    m.policies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'p1', brand_id: BRAND_A, offer_family: 'business_training', decision: 'deny', status: 'active',
        effective_from: AT, effective_to: null,
        approved_landing_pages: ['https://x.test/a', 'https://x.test/b'],
        approved_claims: ['c1', 'c2', 'c3'], approved_ctas: ['book'], required_approvals: ['legal'],
      })],
    });
    const page = await readOfferPolicies({ brandIds: [BRAND_A] });
    expect(attrsOf(m.policies)).not.toContain('notes');
    expect(page.rows[0]).toEqual({
      id: 'p1', brand_id: BRAND_A, offer_family: 'business_training', decision: 'deny', status: 'active',
      effective_from: AT.toISOString(), effective_to: null,
      approved_landing_pages: ['https://x.test/a', 'https://x.test/b'],
      approved_landing_pages_total: 2, claims_count: 3, ctas_count: 1, required_approvals: ['legal'],
    });
  });

  it('answers the row, not an eligibility verdict', async () => {
    m.policies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'p1', brand_id: BRAND_A, offer_family: 'business_training', decision: 'allow', status: 'paused',
        effective_from: AT, effective_to: null, approved_landing_pages: [], approved_claims: [], approved_ctas: [], required_approvals: [],
      })],
    });
    const page = await readOfferPolicies({ brandIds: [BRAND_A] });
    // A paused `allow` is not an `allowed: true` - that judgement belongs to offerEligibility.
    expect(page.rows[0]).not.toHaveProperty('allowed');
    expect(page.rows[0]).not.toHaveProperty('reason');
    expect(page.rows[0]).toMatchObject({ decision: 'allow', status: 'paused' });
  });

  it('filters by family, decision and status inside the brand scope', async () => {
    await readOfferPolicies({ brandIds: [BRAND_A], offerFamily: 'ai_consulting', decision: 'deny', status: 'active' });
    expect(whereOf(m.policies)).toMatchObject({ offer_family: 'ai_consulting', decision: 'deny', status: 'active' });
  });

  it('an empty scope reads nothing, without a query', async () => {
    expect((await readOfferPolicies({ brandIds: [] })).total).toBe(0);
    expect(m.policies).not.toHaveBeenCalled();
  });
});

describe('content rules: never the source evidence, and the approver redacted', () => {
  it('never asks for `source_evidence`, counts the claims, and redacts `approved_by`', async () => {
    m.rules.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'r1', brand_id: BRAND_A, offer_family: 'learner_paid_training', collection_key: null, asset_id: 'a1',
        version: 3, approval_status: 'approved', approved_by: 'ali@example.com', approved_at: AT,
        approved_claims: [{ c: 1 }, { c: 2 }], access_tier: 'free', effective_from: AT, expires_at: null,
      })],
    });
    const page = await readContentRules({ brandIds: [BRAND_A] });
    expect(attrsOf(m.rules)).not.toContain('source_evidence');
    expect(page.rows[0]).toMatchObject({
      version: 3, approval_status: 'approved', approved_by: 'redacted', approved_by_redacted: true, claims_count: 2,
    });
    expect(JSON.stringify(page.rows)).not.toContain('@');
  });

  it('never asks for any of the other JSONB lists either', async () => {
    await readContentRules({ brandIds: [BRAND_A] });
    for (const forbidden of ['source_evidence', 'eligible_programs', 'eligible_paths', 'audience_personas', 'overlays', 'approved_urls']) {
      expect(attrsOf(m.rules)).not.toContain(forbidden);
    }
  });

  it('an empty scope reads nothing, without a query', async () => {
    expect((await readContentRules({ brandIds: [] })).total).toBe(0);
    expect(m.rules).not.toHaveBeenCalled();
  });
});

/* ── handoff policy and ownership ───────────────────────────────────────────── */

describe('queue policies: the configured numbers, not the live ones', () => {
  it('never asks for `settings`, and redacts the assignee id', async () => {
    m.queuePolicies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'q1', brand_id: BRAND_A, policy_type: 'queue_assignee', owner_queue: 'sales',
        daily_capacity: null, sla_hours: 24, assigned_to_type: 'user', assigned_to_id: 'ali@example.com',
        cooldown_days: null, status: 'active',
      })],
    });
    const page = await readQueuePolicies({ brandIds: [BRAND_A] });
    expect(attrsOf(m.queuePolicies)).not.toContain('settings');
    expect(page.rows[0]).toEqual({
      id: 'q1', brand_id: BRAND_A, policy_type: 'queue_assignee', owner_queue: 'sales',
      daily_capacity: null, sla_hours: 24, assigned_to_type: 'user',
      assigned_to_id: 'redacted', assigned_to_id_redacted: true, cooldown_days: null, status: 'active',
    });
  });

  it('a null assignee stays null rather than becoming the string "unknown"', async () => {
    m.queuePolicies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'q2', brand_id: BRAND_A, policy_type: 'queue_capacity', owner_queue: 'admissions',
        daily_capacity: 12, sla_hours: 24, assigned_to_type: null, assigned_to_id: null, cooldown_days: null, status: 'active',
      })],
    });
    const page = await readQueuePolicies({ brandIds: [BRAND_A] });
    expect(page.rows[0]).toMatchObject({ assigned_to_id: null, assigned_to_id_redacted: false, daily_capacity: 12 });
  });

  it('reports no `used` figure - that computation belongs to capacityService', async () => {
    m.queuePolicies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'q3', brand_id: BRAND_A, policy_type: 'queue_capacity', owner_queue: 'sales',
        daily_capacity: 5, sla_hours: 24, assigned_to_type: null, assigned_to_id: null, cooldown_days: null, status: 'active',
      })],
    });
    const page = await readQueuePolicies({ brandIds: [BRAND_A] });
    for (const computed of ['used', 'remaining', 'capacity_status', 'reason']) {
      expect(page.rows[0]).not.toHaveProperty(computed);
    }
  });

  it('an empty scope reads nothing, without a query', async () => {
    expect((await readQueuePolicies({ brandIds: [] })).total).toBe(0);
    expect(m.queuePolicies).not.toHaveBeenCalled();
  });
});

describe('ownership: two facts, kept apart', () => {
  it('reads the open handoffs and the uncleared conversation rows, and says which statuses count as open', async () => {
    m.handoffs.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'h1', brand_id: BRAND_A, subject_ref: 'lead:9', owner_queue: 'sales', status: 'accepted',
        assigned_to_type: 'user', assigned_to_id: 'rep-1', accepted_at: AT, created_at: new Date('2026-09-20T00:00:00Z'),
      })],
    });
    m.conversations.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'c1', brand_id: BRAND_A, lead_id: 9, owner_type: 'human', owner_id: 'rep-1',
        channel: 'email', source: 'handoff_accepted', since_at: AT,
      })],
    });
    const out = await readOwnership({ brandIds: [BRAND_A] });
    expect((whereOf(m.handoffs).status as Record<symbol, unknown>)[Op.in]).toEqual([...OPEN_HANDOFF_STATUSES]);
    expect(whereOf(m.conversations).cleared_at).toBeNull();
    expect(out.handoffs.rows[0]).toMatchObject({ subject_ref: 'lead:9', since: AT.toISOString(), since_source: 'accepted_at' });
    expect(out.conversations.rows[0]).toMatchObject({ subject_ref: 'lead:9', owner_type: 'human', since: AT.toISOString() });
    expect(out.open_handoff_statuses).toEqual([...OPEN_HANDOFF_STATUSES]);
  });

  it('`since` falls back to `created_at` when nobody has accepted, and says so', async () => {
    const created = new Date('2026-09-20T00:00:00Z');
    m.handoffs.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'h2', brand_id: BRAND_A, subject_ref: 'lead:10', owner_queue: 'sales', status: 'queued',
        assigned_to_type: null, assigned_to_id: null, accepted_at: null, created_at: created,
      })],
    });
    const out = await readOwnership({ brandIds: [BRAND_A] });
    expect(out.handoffs.rows[0]).toMatchObject({ since: created.toISOString(), since_source: 'created_at', owner_id: null });
  });

  it('the conversation row gets its `subject_ref` from the shared builder, not a guess', async () => {
    m.conversations.mockResolvedValue({
      count: 1,
      rows: [row({ id: 'c2', brand_id: BRAND_A, lead_id: 41, owner_type: 'ai', owner_id: null, channel: null, source: 'human_activity', since_at: AT })],
    });
    const out = await readOwnership({ brandIds: [BRAND_A] });
    expect(out.conversations.rows[0].subject_ref).toBe('lead:41');
  });

  it('both owner ids go through safeField', async () => {
    m.handoffs.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'h3', brand_id: BRAND_A, subject_ref: 'lead:11', owner_queue: 'ali', status: 'assigned',
        assigned_to_type: 'user', assigned_to_id: 'ali@example.com', accepted_at: null, created_at: AT,
      })],
    });
    m.conversations.mockResolvedValue({
      count: 1,
      rows: [row({ id: 'c3', brand_id: BRAND_A, lead_id: 11, owner_type: 'human', owner_id: 'rep@example.com', channel: null, source: 'manual_claim', since_at: AT })],
    });
    const out = await readOwnership({ brandIds: [BRAND_A] });
    expect(out.handoffs.rows[0]).toMatchObject({ owner_id: 'redacted', owner_id_redacted: true });
    expect(out.conversations.rows[0]).toMatchObject({ owner_id: 'redacted', owner_id_redacted: true });
    expect(JSON.stringify(out)).not.toContain('@');
  });

  it('never asks for the handoff JSONB', async () => {
    await readOwnership({ brandIds: [BRAND_A] });
    for (const forbidden of ['evidence', 'talking_points', 'qualification_gaps', 'return_to_ai']) {
      expect(attrsOf(m.handoffs)).not.toContain(forbidden);
    }
  });

  it('an empty scope reads NEITHER table', async () => {
    const out = await readOwnership({ brandIds: [], limit: 50, offset: 10 });
    expect(out).toEqual({
      handoffs: { rows: [], total: 0 },
      conversations: { rows: [], total: 0 },
      limit: 50,
      offset: 10,
      open_handoff_statuses: OPEN_HANDOFF_STATUSES,
    });
    expect(m.handoffs).not.toHaveBeenCalled();
    expect(m.conversations).not.toHaveBeenCalled();
  });
});
