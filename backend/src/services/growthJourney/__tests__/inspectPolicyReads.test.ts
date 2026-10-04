const m = {
  policies: jest.fn(),
  rules: jest.fn(),
  queuePolicies: jest.fn(),
  handoffs: jest.fn(),
  conversations: jest.fn(),
};

// `databaseUrl` because `handoffPolicyReads` imports two model FILES for their exported constants
// (`OPEN_HANDOFF_STATUSES`, `subjectRef`), and a model file loads `config/database`, which builds a
// Sequelize instance. It never connects - the models are mocked below - but it must be constructible.
jest.mock('../../../config/env', () => ({
  env: { nodeEnv: 'test', databaseUrl: 'postgres://test:test@localhost:5432/test' },
}));
jest.mock('../../../models', () => ({
  BrandOfferPolicy: { findAndCountAll: (...a: unknown[]) => m.policies(...a) },
  GrowthJourneyContentRule: { findAndCountAll: (...a: unknown[]) => m.rules(...a) },
  GrowthJourneyPolicy: { findAndCountAll: (...a: unknown[]) => m.queuePolicies(...a) },
  GrowthJourneyHandoff: { findAndCountAll: (...a: unknown[]) => m.handoffs(...a) },
  GrowthJourneyConversationOwnership: { findAndCountAll: (...a: unknown[]) => m.conversations(...a) },
}));

import { Op } from 'sequelize';
import { OPEN_HANDOFF_STATUSES } from '../../../models/GrowthJourneyHandoff';
import { readContentRules, readOfferPolicies } from '../reads/contentReads';
import { readOwnership, readQueuePolicies } from '../reads/handoffPolicyReads';

/**
 * T607 — the CONTENT and HANDOFF-POLICY inspect reads: what a brand may offer,
 * what content is approved to say it, how the queues are configured, and who is
 * holding a person right now.
 *
 * Split verbatim out of `inspectReads.test.ts` when that file passed the
 * 500-line ceiling. The properties are the same three: no free text leaves
 * (`notes`, `source_evidence` and the two JSONB lists), the scope is the
 * caller's, and an empty scope reads nothing WITHOUT a query.
 */

const BRAND_A = 'brand-a';
const AT = new Date('2026-09-28T12:00:00Z');
const row = (values: Record<string, unknown>) => ({ get: (k: string) => values[k] });
const attrsOf = (spy: jest.Mock): string[] => (spy.mock.calls[0][0] as { attributes: string[] }).attributes;
const whereOf = (spy: jest.Mock): Record<string, unknown> => (spy.mock.calls[0][0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  jest.clearAllMocks();
  for (const spy of Object.values(m)) spy.mockResolvedValue({ rows: [], count: 0 });
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

  it('a landing page or a required approval carrying an address is redacted', async () => {
    // Operator-authored config rather than subject text, so this is belt and braces - but a
    // `mailto:` in a landing-page list would otherwise put an address in the response.
    m.policies.mockResolvedValue({
      count: 1,
      rows: [row({
        id: 'p2', brand_id: BRAND_A, offer_family: 'ai_consulting', decision: 'allow', status: 'active',
        effective_from: AT, effective_to: null,
        approved_landing_pages: ['https://x.test/a', 'mailto:sales@colaberry.com'],
        approved_claims: [], approved_ctas: [], required_approvals: ['legal', 'sign-off ali@example.com'],
      })],
    });
    const page = await readOfferPolicies({ brandIds: [BRAND_A] });
    expect(page.rows[0].approved_landing_pages).toEqual(['https://x.test/a', 'redacted']);
    expect(page.rows[0].required_approvals).toEqual(['legal', 'redacted']);
    expect(JSON.stringify(page.rows)).not.toContain('@');
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
