import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T410 — Person 360 on the same harness as the other Growth Journey routes:
 * `requireAdmin`, the router, the controller, the service and the REAL
 * `leadContextService` reader are exercised; the models are an in-memory
 * world of one lead with rows under three brands in two tenants; the
 * membership bridge is mocked at its boundary.
 *
 * The matrix (401 · 404 flag off · 400 · 200 · 404 nothing visible · 403 scope
 * not granted), then the confidentiality cases: a tenant admin sees their
 * tenant's relationships and not the other tenant's; a brand-restricted
 * operator sees ONLY their brand's relationship rows for a lead with two in
 * the same tenant; every collection is scoped the same way; the response
 * carries no address even when a human's note does.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: true, journeyExecution: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/growthJourney/integration/integrateDisposition', () => ({ integrateDisposition: jest.fn() }));
jest.mock('../../../services/growthJourney/classificationService', () => ({ overrideClassification: jest.fn() }));
jest.mock('../../../services/growthJourney/offerEligibility', () => ({ OfferNotEligibleError: class extends Error {} }));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: jest.fn().mockResolvedValue(undefined) }));

/* ── the in-memory world ────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;
const TENANT = { cpn: '10000000-0000-4000-8000-000000000001', colaberry: '10000000-0000-4000-8000-000000000002' };
const BRAND = { cpn: '20000000-0000-4000-8000-000000000001', training: '20000000-0000-4000-8000-000000000002', enterprise: '20000000-0000-4000-8000-000000000003' };
const LEAD = 501;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
}
const world: Record<string, Row[]> = { contexts: [], classifications: [], decisions: [], transitions: [], handoffs: [], outcomes: [], conversations: [] };
const calls: Record<string, Row[]> = {};
const table = (name: string) => ({
  findAll: async (q: { where: Row; attributes?: string[]; limit?: number }) => {
    (calls[name] ??= []).push(q);
    return world[name].filter((r) => matches(r, q.where)).slice(0, q.limit ?? 1000);
  },
  findOne: async (q: { where: Row }) => {
    (calls[name] ??= []).push(q);
    return world[name].find((r) => matches(r, q.where)) ?? null;
  },
});
const leads = new Set<number>([LEAD]);
jest.mock('../../../models', () => ({
  Lead: { findByPk: async (id: number) => (leads.has(id) ? { id } : null) },
  LeadTenantContext: table('contexts'),
  GrowthJourneyClassification: table('classifications'),
  GrowthJourneyDecision: table('decisions'),
  GrowthJourneyTransition: table('transitions'),
  GrowthJourneyHandoff: table('handoffs'),
  GrowthJourneyOutcome: table('outcomes'),
  GrowthJourneyConversationOwnership: table('conversations'),
  GrowthJourneyEnrollment: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyPolicy: { findOne: jest.fn() },
}));

import growthJourneyRoutes from '../growthJourneyRoutes';

const BASE = '/api/admin/growth-journey';
const URL = `${BASE}/people/${LEAD}`;
const token = () => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(growthJourneyRoutes); return a; }
const get = (url: string) => request(app()).get(url).set('Authorization', `Bearer ${token()}`);
const memberOf = (tenantId: string, brandId: string | null = null, authorizedBrandIds: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId, brandId, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [tenantId], authorizedBrandIds,
});
const superAdmin = () => ({ platformIdentityId: 'pid-0', tenantId: null, brandId: null, organizationId: null, roles: ['platform_superadmin'], isPlatformSuperAdmin: true, authorizedTenantIds: [], authorizedBrandIds: null });

const D = (s: string) => new Date(s);
function seedWorld(): void {
  for (const k of Object.keys(world)) world[k].length = 0;
  for (const k of Object.keys(calls)) delete calls[k];
  world.contexts.push(
    { id: 'ctx-cpn', lead_id: LEAD, tenant_id: TENANT.cpn, brand_id: BRAND.cpn, organization_id: null, relationship_type: 'learner', status: 'active', pipeline_stage: null, lead_temperature: 'warm', consent_contact: true, consent_source: 'form', consent_at: D('2026-08-01T00:00:00Z'), first_touch_at: D('2026-08-01T00:00:00Z'), last_touch_at: D('2026-09-01T00:00:00Z'), assigned_platform_identity_id: null, metadata: { note: 'ask for cpn.contact@example.com' } },
    { id: 'ctx-ent', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, organization_id: 'org-1', relationship_type: 'client', status: 'active', pipeline_stage: 'meeting_scheduled', lead_temperature: 'hot', consent_contact: true, consent_source: 'form', consent_at: D('2026-08-15T00:00:00Z'), first_touch_at: D('2026-08-15T00:00:00Z'), last_touch_at: D('2026-09-10T00:00:00Z'), assigned_platform_identity_id: 'pid-9', metadata: null },
    { id: 'ctx-tr', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.training, organization_id: null, relationship_type: 'learner', status: 'active', pipeline_stage: null, lead_temperature: 'cool', consent_contact: false, consent_source: null, consent_at: null, first_touch_at: D('2026-07-01T00:00:00Z'), last_touch_at: D('2026-07-02T00:00:00Z'), assigned_platform_identity_id: null, metadata: null },
  );
  world.classifications.push(
    { id: 'c-ent', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, subject_ref: 'lead:501', enrollment_id: null, trigger: 'form', journey_program_slug: 'business-growth', primary_path: 'workflow_automation', secondary_paths: [], intent: null, confidence: 0.9, source_step: 3, requires_human_review: false, status: 'proposed', locked: false, referral_target_brand_id: null, ai_involved: false, override_of: null, decided_by: null, created_at: D('2026-08-16T00:00:00Z'), evidence: ['override_reason:mail me at someone@example.com'] },
    { id: 'c-cpn', lead_id: LEAD, tenant_id: TENANT.cpn, brand_id: BRAND.cpn, subject_ref: 'lead:501', enrollment_id: 'e-1', trigger: 'lead_ingest', journey_program_slug: 'cpn-scholars', primary_path: 'learner_free_training', secondary_paths: [], intent: null, confidence: 0.8, source_step: 3, requires_human_review: false, status: 'proposed', locked: false, referral_target_brand_id: null, ai_involved: false, override_of: null, decided_by: null, created_at: D('2026-08-02T00:00:00Z'), evidence: [] },
  );
  world.decisions.push(
    { id: 'd-ent', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, program_id: 'p-ent', subject_ref: 'lead:501', enrollment_id: null, classification_id: 'c-ent', trigger: 'nightly', decision_date: '2026-09-15', mode: 'shadow', selected_action: 'WAIT', selected_path: 'workflow_automation', selected_channel: null, state_at_decision: 'EXPLORING_SOLUTIONS', overlays_at_decision: [], reason: 'content_gap', requires_human_review: false, ai_involved: false, executed: false, decided_by: 'governor:v1', created_at: D('2026-09-15T04:20:00Z'), candidates: [{ action_type: 'SEND_EMAIL', to: 'lead@example.com' }], scores: { fit: 70 }, contact_evidence: { email: 'lead@example.com' } },
  );
  world.transitions.push({ id: 't-ent', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, program_id: 'p-ent', subject_ref: 'lead:501', enrollment_id: null, transition_type: 'state_changed', from_value: { state: 'PROBLEM_IDENTIFIED' }, to_value: { state: 'EXPLORING_SOLUTIONS' }, status: 'applied', reason: 'lifecycle', requested_by: 'growth_journey:lifecycle', created_at: D('2026-09-14T00:00:00Z'), evidence: ['x'] });
  world.handoffs.push(
    { id: 'h-ent', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, program_id: 'p-ent', subject_ref: 'lead:501', enrollment_id: null, decision_id: 'd-ent', owner_queue: 'sales', assigned_to_type: 'human', assigned_to_id: 'staff-1', ticket_id: 'tk-1', assignment_blocked_reason: null, priority: 'high', urgent: false, reason: 'commercial_state:PROPOSAL_SENT', sla_due_at: D('2026-09-16T00:00:00Z'), status: 'dispositioned', disposition: 'qualified', disposition_reason: 'budget confirmed, follow up with cfo@bigco.com', disposition_at: D('2026-09-16T10:00:00Z'), dispositioned_by: 'admin:staff-1', return_to_ai: null, integration_refused: null, accepted_at: D('2026-09-15T12:00:00Z'), expired_at: null, source: 'decision_deferral', created_at: D('2026-09-15T04:21:00Z'), evidence: { links: { person: '/admin/people/lead:501' }, contact: 'lead@example.com' }, talking_points: ['asked about invoicing'] },
    { id: 'h-tr', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.training, program_id: 'p-tr', subject_ref: 'lead:501', enrollment_id: 'e-2', decision_id: 'd-tr', owner_queue: 'admissions', assigned_to_type: null, assigned_to_id: null, ticket_id: null, assignment_blocked_reason: 'capacity_full', priority: 'medium', urgent: false, reason: 'learner:stalled', sla_due_at: null, status: 'queued', disposition: null, disposition_reason: null, disposition_at: null, dispositioned_by: null, return_to_ai: null, integration_refused: null, accepted_at: null, expired_at: null, source: 'decision_deferral', created_at: D('2026-09-10T04:21:00Z'), evidence: {}, talking_points: [] },
  );
  world.outcomes.push({ id: 'o-ent', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, subject_ref: 'lead:501', handoff_id: 'h-ent', decision_id: 'd-ent', outcome_type: 'opportunity_stage', source: 'leads.pipeline_stage', source_ref: '501:meeting_scheduled', occurred_at: D('2026-09-16T10:00:00Z'), value: null, metadata: { stage: 'meeting_scheduled' }, created_at: D('2026-09-16T10:00:00Z') });
  world.conversations.push({ id: 'own-1', lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, owner_type: 'human', owner_id: 'staff-1', channel: 'email', source: 'handoff_accepted', since_at: D('2026-09-15T12:00:00Z'), cleared_at: null });
}

beforeEach(() => {
  growthJourney.growthJourneyEnabled = true;
  contextFromAdminRequest.mockReset().mockResolvedValue(memberOf(TENANT.colaberry));
  seedWorld();
});

describe('the matrix', () => {
  it('401 without a token, and the bridge is never asked', async () => {
    expect((await request(app()).get(URL)).status).toBe(401);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('404 with the master flag off - the route does not exist', async () => {
    growthJourney.growthJourneyEnabled = false;
    const res = await get(URL);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('400 for a lead id that is not a positive integer, and for a limit out of range', async () => {
    expect((await get(`${BASE}/people/abc`)).status).toBe(400);
    expect((await get(`${BASE}/people/0`)).status).toBe(400);
    expect((await get(`${URL}?limit=500`)).status).toBe(400);
  });

  it('200 for a tenant admin: the 360 with every collection scoped to the tenant, summaries only, and the limit echoed', async () => {
    const res = await get(`${URL}?limit=10`);
    expect(res.status).toBe(200);
    expect(res.body.subject).toEqual({ lead_id: LEAD, subject_ref: 'lead:501', enrollment_ids: ['e-2'] });
    expect(res.body.scope).toEqual({ tenant_id: TENANT.colaberry, brand_id: null, brand_restricted: false });
    expect(res.body.relationships.map((r: Row) => r.id).sort()).toEqual(['ctx-ent', 'ctx-tr']);
    expect(res.body.classifications.map((r: Row) => r.id)).toEqual(['c-ent']);
    expect(res.body.decisions.map((r: Row) => r.id)).toEqual(['d-ent']);
    expect(res.body.transitions.map((r: Row) => r.id)).toEqual(['t-ent']);
    expect(res.body.handoffs.map((r: Row) => r.id).sort()).toEqual(['h-ent', 'h-tr']);
    expect(res.body.outcomes.map((r: Row) => r.id)).toEqual(['o-ent']);
    expect(res.body.conversation).toEqual({ id: 'own-1', tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, owner_type: 'human', owner_id: 'staff-1', channel: 'email', source: 'handoff_accepted', since_at: '2026-09-15T12:00:00.000Z' });
    expect(res.body.limit).toBe(10);
    // Summaries, never blobs: the decision's candidates/scores/contact evidence, the handoff's packet and talking points, the classification's evidence trace, the context's metadata.
    expect(res.body.decisions[0]).not.toHaveProperty('candidates');
    expect(res.body.decisions[0]).not.toHaveProperty('scores');
    expect(res.body.decisions[0]).not.toHaveProperty('contact_evidence');
    expect(res.body.handoffs.find((r: Row) => r.id === 'h-ent')).not.toHaveProperty('evidence');
    expect(res.body.handoffs.find((r: Row) => r.id === 'h-ent')).not.toHaveProperty('talking_points');
    expect(res.body.classifications[0]).not.toHaveProperty('evidence');
    expect(res.body.relationships[0]).not.toHaveProperty('metadata');
    // Every lead-keyed read carried the caller's tenant scope and the lead.
    for (const name of ['classifications', 'decisions', 'transitions', 'handoffs', 'outcomes', 'conversations']) {
      expect(calls[name][0].where).toMatchObject({ lead_id: LEAD, tenant_id: TENANT.colaberry });
      if (name !== 'conversations') expect(calls[name][0]).toMatchObject({ limit: 10 });
    }
  });

  it('404 - byte-identical to an unknown lead - when the caller can see nothing of the person: the CPN operator opening a lead with only Colaberry rows, and anyone opening lead 999', async () => {
    world.contexts.splice(0, 1); world.classifications.splice(1, 1); // no CPN rows left
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn));
    const hidden = await get(URL);
    const unknown = await get(`${BASE}/people/999`);
    expect(hidden.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(hidden.text).toBe(unknown.text);
  });

  it('403 for a requested tenant or brand the caller was not granted - refuse, never widen', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry));
    expect((await get(`${URL}?tenant_id=${TENANT.cpn}`)).status).toBe(403);
    expect((await get(`${URL}?brand_id=${BRAND.cpn}`)).status).toBe(403);
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    expect((await get(`${URL}?brand_id=${BRAND.training}`)).status).toBe(403);
  });
});

describe('confidentiality', () => {
  it('a Colaberry tenant admin sees the Enterprise and Training relationships and NOT the CPN one - the other tenant\'s relationship does not exist for them', async () => {
    const res = await get(URL);
    expect(res.status).toBe(200);
    expect(res.body.relationships.map((r: Row) => r.brand_id).sort()).toEqual([BRAND.training, BRAND.enterprise].sort());
    expect(res.text).not.toContain(TENANT.cpn);
    expect(res.text).not.toContain('cpn-scholars');
  });

  it('a Training-only operator (brand-restricted) sees ONLY the Training relationship row for a lead with two in the same tenant - and only Training rows in every other collection', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    const res = await get(URL);
    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ tenant_id: TENANT.colaberry, brand_id: null, brand_restricted: true });
    expect(res.body.relationships.map((r: Row) => r.id)).toEqual(['ctx-tr']);
    expect(res.body.handoffs.map((r: Row) => r.id)).toEqual(['h-tr']);
    expect(res.body.classifications).toEqual([]);
    expect(res.body.decisions).toEqual([]);
    expect(res.body.outcomes).toEqual([]);
    expect(res.body.conversation).toBeNull();
    expect(res.text).not.toContain(BRAND.enterprise);
    for (const name of ['classifications', 'decisions', 'transitions', 'handoffs', 'outcomes', 'conversations']) {
      expect(calls[name][0].where).toMatchObject({ lead_id: LEAD, tenant_id: TENANT.colaberry, brand_id: [BRAND.training] });
    }
  });

  it('a requested brand inside the tenant narrows the same way; a platform superadmin sees every relationship in every tenant', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, null));
    const narrowed = await get(`${URL}?brand_id=${BRAND.enterprise}`);
    expect(narrowed.status).toBe(200);
    expect(narrowed.body.relationships.map((r: Row) => r.id)).toEqual(['ctx-ent']);
    expect(narrowed.body.handoffs.map((r: Row) => r.id)).toEqual(['h-ent']);
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const all = await get(URL);
    expect(all.status).toBe(200);
    expect(all.body.relationships.map((r: Row) => r.id).sort()).toEqual(['ctx-cpn', 'ctx-ent', 'ctx-tr']);
    expect(all.body.classifications.map((r: Row) => r.id).sort()).toEqual(['c-cpn', 'c-ent']);
  });

  it('the response text carries no address - the seeded decision, handoff packet, context metadata and classification trace all do, and the human\'s note is scrubbed at the boundary', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const res = await get(URL);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('@');
    const h = res.body.handoffs.find((r: Row) => r.id === 'h-ent');
    expect(h.disposition_reason).toBe('budget confirmed, follow up with [redacted]');
  });
});
