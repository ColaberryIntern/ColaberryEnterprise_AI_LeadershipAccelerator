import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T405 — the human's handoff queue and their three moves, on the same harness
 * as the classification and decision routes: `requireAdmin`, the router, the
 * guard functions AND the state machine (`dispositionService`, `returnToAi`,
 * the ownership writer, the outcome recorder) are REAL; the models are an
 * in-memory store that enforces the two unique indexes the services rely on,
 * and the membership bridge, the audit writer and the ledger are mocked at
 * their boundary. Every status code below is the one the shipped code returns.
 *
 * The matrix is T229's, applied to two reads and three audited writes; the
 * second half walks `queued → accepted → returned_to_ai` through the routes and
 * pins what the rows, the outcome index and the ledger hold afterwards.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: true, journeyExecution: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

/* ── the in-memory world ────────────────────────────────────────────────────── */

type Row = Record<string, unknown> & { id: string; update: jest.Mock };
const handoffs = new Map<string, Row>();
const ownership: Array<Record<string, unknown>> = [];
const outcomes: Array<Record<string, unknown>> = [];
let cooldownPolicy: { cooldown_days: number; status: string } | null = null;
const uniqueError = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });

const findByPk = jest.fn();
const fromStore = async (id: string) => handoffs.get(id) ?? null;
const findAndCountAll = jest.fn<Promise<{ rows: unknown[]; count: number }>, [unknown]>();
const handoffCreate = jest.fn();
const handoffDestroy = jest.fn();
let seq = 0;
jest.mock('../../../models', () => ({
  GrowthJourneyEnrollment: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyClassification: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyDecision: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyHandoff: {
    findByPk: (...a: unknown[]) => findByPk(...(a as [string])),
    findAndCountAll: (...a: unknown[]) => findAndCountAll(a[0]),
    create: (...a: unknown[]) => handoffCreate(...a),
    destroy: (...a: unknown[]) => handoffDestroy(...a),
  },
  GrowthJourneyConversationOwnership: {
    create: async (row: Record<string, unknown>) => {
      if (ownership.some((r) => r.lead_id === row.lead_id && r.brand_id === row.brand_id && r.cleared_at === null)) throw uniqueError();
      const stored = { id: `own-${++seq}`, ...row };
      ownership.push(stored);
      return stored;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      ownership.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
    update: async (values: Record<string, unknown>, { where }: { where: Record<string, unknown> }) => {
      const hit = ownership.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      for (const r of hit) Object.assign(r, values);
      return [hit.length];
    },
  },
  GrowthJourneyOutcome: {
    create: async (row: Record<string, unknown>) => {
      if (outcomes.some((r) => r.source === row.source && r.source_ref === row.source_ref)) throw uniqueError();
      const stored = { id: `out-${++seq}`, ...row };
      outcomes.push(stored);
      return stored;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      outcomes.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
  },
  GrowthJourneyPolicy: {
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      cooldownPolicy && where.policy_type === 'cooldown' && where.owner_queue === null ? { ...cooldownPolicy, brand_id: where.brand_id } : null,
  },
}));
// The sibling controllers on the same router import these at load; mocked at
// their boundary exactly as the T229 and T312 harnesses do.
jest.mock('../../../services/growthJourney/offerEligibility', () => {
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: Record<string, unknown>) { super('Offer not eligible'); this.name = 'OfferNotEligibleError'; }
  }
  return { OfferNotEligibleError };
});
jest.mock('../../../services/growthJourney/classificationService', () => ({ overrideClassification: jest.fn() }));
const logEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/ledgerService', () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyRoutes from '../growthJourneyRoutes';
import { TenantAccessError } from '../../../modules/tenancy/tenantAuthorization';
import { HANDOFF_LIST_ATTRIBUTES } from '../../../controllers/growthJourneyHandoffController';
import { DEFAULT_RETURN_COOLDOWN_DAYS } from '../../../services/growthJourney/handoffs/returnToAi';

const BASE = '/api/admin/growth-journey';
const TENANT = { cpn: '10000000-0000-4000-8000-000000000001', colaberry: '10000000-0000-4000-8000-000000000002', aiFlotation: '10000000-0000-4000-8000-000000000003' };
const BRAND = { cpn: '20000000-0000-4000-8000-000000000001', training: '20000000-0000-4000-8000-000000000002', enterprise: '20000000-0000-4000-8000-000000000003', aiFlotation: '20000000-0000-4000-8000-000000000004' };
const ROW_ID = '30000000-0000-4000-8000-000000000001';
const STAFF_EMAIL = 'staff@colaberry.com';
const DAY = 86_400_000;

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: STAFF_EMAIL, role }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(growthJourneyRoutes); return a; }
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

const memberOf = (tenantId: string, brandId: string | null = null, authorizedBrandIds: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId, brandId, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [tenantId], authorizedBrandIds,
});

/** A stored handoff, as the T404 writer leaves it: queued, ranked, its packet on the row. */
function seed(tenantId: string, brandId: string, over: Record<string, unknown> = {}): Row {
  const row: Row = {
    id: ROW_ID, tenant_id: tenantId, brand_id: brandId, program_id: 'p-ent', subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, decision_id: 'd-1', organization_id: null,
    owner_queue: 'sales', assigned_to_type: null, assigned_to_id: null, ticket_id: null, assignment_blocked_reason: 'no_assignee_policy',
    priority: 'high', expected_value: 62, urgent: false, reason: 'commercial_state:PROPOSAL_SENT',
    evidence: { brand_program_path: { brand: 'colaberry-enterprise', program: { slug: 'business-growth', kind: 'business' }, path: 'workflow_automation' }, links: { person: '/admin/people/lead:501' } },
    qualification_gaps: ['budget_signal:no_source'], talking_points: ['asked about invoicing automation'], best_channel: 'email', consent_basis: 'explicit_opt_in', sla_due_at: null,
    status: 'queued', disposition: null, disposition_reason: null, disposition_at: null, dispositioned_by: null, return_to_ai: null, accepted_at: null, expired_at: null,
    source: 'decision_deferral', idempotency_key: 'k-1', created_at: new Date('2026-09-15T00:00:00Z'), updated_at: new Date('2026-09-15T00:00:00Z'),
    update: jest.fn(),
    ...over,
  };
  row.update.mockImplementation(async (patch: Record<string, unknown>) => { Object.assign(row, patch, { updated_at: new Date() }); return row; });
  handoffs.set(row.id, row);
  return row;
}

const LIST = `${BASE}/handoffs`;
const DETAIL = `${BASE}/handoffs/${ROW_ID}`;
const ACCEPT = `${DETAIL}/accept`;
const DISPOSITION = `${DETAIL}/disposition`;
const RELEASE = `${DETAIL}/release`;
const NOT_READY = { disposition: 'not_ready', reason: 'budget cycle restarts in Q1; revisit then' };
const WRITES: Array<[string, string, Record<string, unknown>]> = [
  ['accept', ACCEPT, {}],
  ['disposition', DISPOSITION, NOT_READY],
  ['release', RELEASE, {}],
];
const post = (url: string, body: Record<string, unknown>) => auth(request(app()).post(url)).send(body);

beforeEach(() => {
  handoffs.clear(); ownership.length = 0; outcomes.length = 0; cooldownPolicy = null; seq = 0;
  findByPk.mockReset().mockImplementation(fromStore); findAndCountAll.mockReset().mockResolvedValue({ rows: [], count: 0 });
  handoffCreate.mockReset(); handoffDestroy.mockReset();
  logEvent.mockClear(); recordAccessDecision.mockClear();
  contextFromAdminRequest.mockReset().mockResolvedValue(memberOf(TENANT.colaberry, null));
  growthJourney.growthJourneyEnabled = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  // No route creates or destroys a handoff: the writer is T404's, the row only ever changes state here.
  expect(handoffCreate).not.toHaveBeenCalled();
  expect(handoffDestroy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the status matrix, on all five routes', () => {
  it('401 unauthenticated', async () => {
    expect((await request(app()).get(LIST)).status).toBe(401);
    expect((await request(app()).get(DETAIL)).status).toBe(401);
    for (const [, url, body] of WRITES) expect((await request(app()).post(url).send(body)).status).toBe(401);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('404 on every route when the master flag is off, before anything is read or audited', async () => {
    growthJourney.growthJourneyEnabled = false;
    seed(TENANT.colaberry, BRAND.enterprise);
    const responses = [await auth(request(app()).get(LIST)), await auth(request(app()).get(DETAIL))];
    for (const [, url, body] of WRITES) responses.push(await post(url, body));
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    }
    expect(findByPk).not.toHaveBeenCalled();
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
    expect(handoffs.get(ROW_ID)?.status).toBe('queued');
  });

  it('200 in-brand: the list, the detail with its packet, and each write', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    const row = seed(TENANT.colaberry, BRAND.enterprise);
    findAndCountAll.mockResolvedValue({ rows: [row], count: 1 });
    const list = await auth(request(app()).get(LIST));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, limit: 25, offset: 0, status: 'open', owner_queue: null });
    expect(list.body.rows[0].id).toBe(ROW_ID);

    const detail = await auth(request(app()).get(DETAIL));
    expect(detail.status).toBe(200);
    expect(detail.body.handoff).toMatchObject({ id: ROW_ID, status: 'queued', owner_queue: 'sales', subject_ref: 'lead:501', qualification_gaps: ['budget_signal:no_source'] });
    expect(detail.body.handoff.evidence).toBeUndefined();
    expect(detail.body.packet).toEqual(row.evidence);
    // Reads are never audited (an audit row would be a write on a GET).
    expect(recordAccessDecision).not.toHaveBeenCalled();

    expect((await post(ACCEPT, {})).status).toBe(200);
    expect((await post(RELEASE, {})).status).toBe(200);
    expect((await post(ACCEPT, {})).status).toBe(200);
    expect((await post(DISPOSITION, NOT_READY)).status).toBe(200);
    expect(recordAccessDecision).toHaveBeenCalledTimes(4);
    for (const call of recordAccessDecision.mock.calls) expect(call[0]).toMatchObject({ resourceType: 'growth_journey_handoff', resourceId: ROW_ID, decision: 'allowed', reason: 'granted', actorEmail: STAFF_EMAIL });
  });

  describe.each(WRITES)('%s', (action, url, body) => {
    it('404 cross-tenant - byte-identical to not-found, the row untouched, the refusal audited', async () => {
      contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
      const row = seed(TENANT.aiFlotation, BRAND.aiFlotation, { status: 'accepted' });
      const foreign = await post(url, body);
      handoffs.clear();
      const missing = await post(url, body);
      expect([foreign.status, missing.status]).toEqual([404, 404]);
      expect(foreign.text).toBe(missing.text);
      expect(Object.fromEntries(Object.entries(foreign.headers).filter(([k]) => k !== 'date' && k !== 'etag'))).toEqual(
        Object.fromEntries(Object.entries(missing.headers).filter(([k]) => k !== 'date' && k !== 'etag')),
      );
      expect(row.update).not.toHaveBeenCalled();
      expect(row.status).toBe('accepted');
      expect(recordAccessDecision).toHaveBeenCalledTimes(1);
      expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'growth_journey_handoff', action, resourceId: ROW_ID, decision: 'denied', reason: 'TenantIsolationViolation' }));
      expect(logEvent).not.toHaveBeenCalled();
    });

    it('403 cross-brand within one tenant (a Training member on an Enterprise handoff): refused, audited as denied, nothing written', async () => {
      contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
      const row = seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted' });
      const res = await post(url, body);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error_class: 'AuthorizationError' });
      // The refusal carries none of the row: the caller learns it exists, not what it says.
      expect(res.text).not.toContain('lead:501');
      expect(res.text).not.toContain('invoicing');
      expect(row.update).not.toHaveBeenCalled();
      expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ action, resourceId: ROW_ID, decision: 'denied', reason: 'AuthorizationError', actorEmail: STAFF_EMAIL }));
      expect(logEvent).not.toHaveBeenCalled();
      expect(ownership).toHaveLength(0);
      expect(outcomes).toHaveLength(0);
    });

    it('G2: a brand-restricted member who OMITS ?brand_id= is refused another brand with 403', async () => {
      contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
      const row = seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted' });
      expect((await post(url, body)).status).toBe(403);
      expect(row.update).not.toHaveBeenCalled();
      expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ action, decision: 'denied' }));
    });

    it('the audited guard runs BEFORE the state machine: a refused write on a row in the wrong state is the refusal, never a 409', async () => {
      contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
      // A state no move is legal from - the guard answers first, so the caller never learns that either.
      seed(TENANT.colaberry, BRAND.enterprise, { status: 'dispositioned' });
      const res = await post(url, body);
      expect(res.status).toBe(403);
      expect(res.body.error_class).toBe('AuthorizationError');
      expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ action, decision: 'denied' }));
    });
  });

  it('404 cross-tenant on the detail, byte-identical to not-found; 403 cross-brand; G2 on the detail', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    seed(TENANT.aiFlotation, BRAND.aiFlotation);
    const foreign = await auth(request(app()).get(DETAIL));
    handoffs.clear();
    const missing = await auth(request(app()).get(DETAIL));
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(foreign.text).toBe(missing.text);

    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    seed(TENANT.colaberry, BRAND.enterprise);
    const cross = await auth(request(app()).get(DETAIL));
    expect(cross.status).toBe(403);
    expect(cross.body).toMatchObject({ error_class: 'AuthorizationError' });
    expect(cross.text).not.toContain('lead:501');

    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    expect((await auth(request(app()).get(DETAIL))).status).toBe(403);
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('403 for a requested scope the bridge did not grant, on every route, before any read', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null));
    seed(TENANT.colaberry, BRAND.enterprise);
    expect((await auth(request(app()).get(`${LIST}?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect((await auth(request(app()).get(`${DETAIL}?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect((await auth(request(app()).get(`${LIST}?tenant_id=${TENANT.cpn}`))).status).toBe(403);
    for (const [, url, body] of WRITES) expect((await post(`${url}?brand_id=${BRAND.enterprise}`, body)).status).toBe(403);
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(findByPk).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('a thrown bridge refusal is a 403, not a 500', async () => {
    contextFromAdminRequest.mockRejectedValue(new TenantAccessError('Brand not in scope', 403, 'AuthorizationError'));
    expect((await auth(request(app()).get(`${LIST}?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect((await auth(request(app()).get(DETAIL))).status).toBe(403);
    expect((await post(ACCEPT, {})).status).toBe(403);
  });

  it('spoofed Host / X-Forwarded-Host / X-Brand headers change nothing', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    seed(TENANT.colaberry, BRAND.enterprise);
    const spoof = (r: request.Test) => r.set('Host', 'colaberry.ai').set('X-Forwarded-Host', 'colaberry.ai').set('X-Brand', 'colaberry-enterprise');
    expect((await spoof(auth(request(app()).get(DETAIL)))).status).toBe(404);
    expect((await spoof(auth(request(app()).post(ACCEPT)).send({}))).status).toBe(404);
    await spoof(auth(request(app()).get(LIST)));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: TENANT.cpn, brand_id: BRAND.cpn }) }));
  });

  it('a model failure is a 500 with an error class and no row content', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    findByPk.mockRejectedValue(new Error('connection reset'));
    findAndCountAll.mockRejectedValue(new Error('connection reset'));
    expect((await auth(request(app()).get(LIST))).body).toMatchObject({ error: 'Handoff list failed', error_class: expect.any(String) });
    expect((await auth(request(app()).get(DETAIL))).body).toMatchObject({ error: 'Handoff read failed', error_class: expect.any(String) });
    const write = await post(DISPOSITION, NOT_READY);
    expect(write.status).toBe(500);
    expect(write.body).toMatchObject({ error: 'Handoff disposition failed', error_class: expect.any(String) });
  });
});

describe('the list: scope, projection, filters, order', () => {
  it('never returns a row outside the restricted set: tenant, brand, the open statuses by default, ranked', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    await auth(request(app()).get(LIST));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: TENANT.colaberry, brand_id: [BRAND.training], status: ['queued', 'assigned', 'accepted'] },
      attributes: [...HANDOFF_LIST_ATTRIBUTES],
      order: [['urgent', 'DESC'], ['expected_value', 'DESC'], ['created_at', 'ASC']],
      limit: 25, offset: 0,
    }));
  });

  it('status=all lists every status; a named status and an owner_queue narrow; paging is passed through', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    await auth(request(app()).get(`${LIST}?status=all&limit=5&offset=10`));
    const all = findAndCountAll.mock.calls[0][0] as { where: Record<string, unknown>; limit: number; offset: number };
    expect(all.where.status).toBeUndefined();
    expect(all.limit).toBe(5);
    expect(all.offset).toBe(10);
    await auth(request(app()).get(`${LIST}?status=returned_to_ai&owner_queue=admissions`));
    expect(findAndCountAll.mock.calls[1][0]).toMatchObject({ where: { status: 'returned_to_ai', owner_queue: 'admissions', brand_id: BRAND.enterprise } });
  });

  it('the projection excludes the packet and the two arrays: the queue is for finding a row, the detail is for reading one', async () => {
    for (const blob of ['evidence', 'qualification_gaps', 'talking_points', 'idempotency_key']) expect(HANDOFF_LIST_ATTRIBUTES).not.toContain(blob);
    expect(HANDOFF_LIST_ATTRIBUTES).toEqual(expect.arrayContaining(['id', 'subject_ref', 'owner_queue', 'priority', 'expected_value', 'urgent', 'status', 'sla_due_at', 'return_to_ai', 'created_at']));
  });
});

describe('validation (Zod) - 400 before any business logic', () => {
  it('the list and the detail: limit 0 / 101, offset -1, an unknown status or queue, a non-uuid brand, tenant or id', async () => {
    for (const q of ['limit=0', 'limit=101', 'offset=-1', 'status=nonsense', 'owner_queue=marketing', 'brand_id=not-a-uuid', 'tenant_id=not-a-uuid']) {
      const res = await auth(request(app()).get(`${LIST}?${q}`));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Invalid request', details: expect.any(Array) });
    }
    expect((await auth(request(app()).get(`${BASE}/handoffs/not-a-uuid`))).status).toBe(400);
    expect((await auth(request(app()).get(`${DETAIL}?limit=0`))).status).toBe(400);
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(findByPk).not.toHaveBeenCalled();
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('the bodies are strict: an unknown key on each write, an unknown disposition, a short reason, a cooldown outside 1..90 or fractional, a non-uuid id', async () => {
    seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted' });
    const bad: Array<[string, Record<string, unknown>]> = [
      [ACCEPT, { note: 'x' }],
      [RELEASE, { reason: 'r', extra: true }],
      [RELEASE, { reason: '' }],
      [DISPOSITION, { ...NOT_READY, unknown_key: 1 }],
      [DISPOSITION, { disposition: 'maybe_later', reason: NOT_READY.reason }],
      [DISPOSITION, { disposition: 'not_ready', reason: 'short' }],
      [DISPOSITION, { disposition: 'not_ready' }],
      [DISPOSITION, { ...NOT_READY, cooldown_days: 0 }],
      [DISPOSITION, { ...NOT_READY, cooldown_days: 91 }],
      [DISPOSITION, { ...NOT_READY, cooldown_days: 2.5 }],
      [DISPOSITION, { ...NOT_READY, cooldown_days: '7' }],
    ];
    for (const [url, body] of bad) {
      const res = await post(url, body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Invalid request', details: expect.any(Array) });
    }
    expect((await post(`${BASE}/handoffs/not-a-uuid/accept`, {})).status).toBe(400);
    expect(findByPk).not.toHaveBeenCalled();
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
    expect(handoffs.get(ROW_ID)?.status).toBe('accepted');
  });
});

describe('the state machine, through the routes', () => {
  beforeEach(() => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
  });

  const ledgerEvents = () => logEvent.mock.calls.map((c) => c[0] as string);

  it('queued → accept → 200 accepted: the human owns the thread, the outcome is on the index, the ledger row carries tenant and brand', async () => {
    const row = seed(TENANT.colaberry, BRAND.enterprise);
    const res = await post(ACCEPT, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'accepted', handoff: { id: ROW_ID, status: 'accepted', assigned_to_type: 'human', assigned_to_id: 'staff-1', assignment_blocked_reason: null } });
    expect(row.accepted_at).toBeInstanceOf(Date);
    expect(ownership).toHaveLength(1);
    expect(ownership[0]).toMatchObject({ tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, lead_id: 501, owner_type: 'human', owner_id: 'staff-1', source: 'handoff_accepted', channel: 'email', cleared_at: null });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ outcome_type: 'handoff_accepted', source: 'growth_journey_handoffs', source_ref: `${ROW_ID}:accepted`, handoff_id: ROW_ID, decision_id: 'd-1', subject_ref: 'lead:501' });
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith('growth_journey.handoff.accepted', 'admin:staff-1', 'growth_journey_handoff', ROW_ID, expect.objectContaining({ from: 'queued', handoff_id: ROW_ID, ownership_id: 'own-1' }), { tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise });
    // The actor is the admin's id, never the email - in the response, the row, the ledger and the outcome.
    expect(res.text).not.toContain('@');
    expect(JSON.stringify([...logEvent.mock.calls, ...ownership, ...outcomes])).not.toContain('@');
  });

  it('accept twice → 409 ValidationError; disposition on queued → 409; release on queued → 409 - and nothing changes', async () => {
    const row = seed(TENANT.colaberry, BRAND.enterprise);
    expect((await post(DISPOSITION, NOT_READY)).status).toBe(409);
    const released = await post(RELEASE, {});
    expect(released.status).toBe(409);
    expect(released.body).toEqual({ error: 'handoff is queued; it cannot be released', error_class: 'ValidationError', from: 'queued' });
    expect(row.update).not.toHaveBeenCalled();
    expect((await post(ACCEPT, {})).status).toBe(200);
    const twice = await post(ACCEPT, {});
    expect(twice.status).toBe(409);
    expect(twice.body).toEqual({ error: 'handoff is accepted; it cannot be accepted', error_class: 'ValidationError', from: 'accepted' });
    expect(row.update).toHaveBeenCalledTimes(1);
    expect(ownership).toHaveLength(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    // Every refused transition was still an allowed, audited access: the guard ran, the machine said no.
    expect(recordAccessDecision).toHaveBeenCalledTimes(4);
    for (const call of recordAccessDecision.mock.calls) expect(call[0]).toMatchObject({ decision: 'allowed' });
  });

  it('queued → accepted → dispositioned(not_ready) yields returned_to_ai with cooldown_until = now + cooldown_days (the body), the ownership row cleared, the outcome and the ledger row written', async () => {
    const row = seed(TENANT.colaberry, BRAND.enterprise);
    await post(ACCEPT, {});
    const before = Date.now();
    const res = await post(DISPOSITION, { ...NOT_READY, cooldown_days: 7 });
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'returned_to_ai', cooldown_source: 'body', ownership_cleared: 1, outcome_id: outcomes[1].id });
    const until = new Date(res.body.cooldown_until).getTime();
    expect(until - 7 * DAY).toBeGreaterThanOrEqual(before);
    expect(until - 7 * DAY).toBeLessThanOrEqual(after);
    expect(row).toMatchObject({
      status: 'returned_to_ai', disposition: 'not_ready', disposition_reason: NOT_READY.reason, dispositioned_by: 'admin:staff-1',
      return_to_ai: { program_slug: 'business-growth', cooldown_until: res.body.cooldown_until, reason: `not_ready:${NOT_READY.reason}` },
    });
    expect((row.disposition_at as Date).getTime() + 7 * DAY).toBe(until);
    expect(ownership[0]).toMatchObject({ cleared_by: 'admin:staff-1', cleared_reason: 'dispositioned:not_ready' });
    expect(ownership[0].cleared_at).toBeInstanceOf(Date);
    expect(outcomes[1]).toMatchObject({ outcome_type: 'handoff_dispositioned', source_ref: `${ROW_ID}:not_ready`, metadata: { disposition: 'not_ready', returned_to_ai: true, cooldown_until: res.body.cooldown_until } });
    expect(ledgerEvents()).toEqual(['growth_journey.handoff.accepted', 'growth_journey.handoff.returned_to_ai']);
    expect(logEvent.mock.calls[1][4]).toMatchObject({ from: 'accepted', disposition: 'not_ready', cooldown_source: 'body', ownership_cleared: 1 });
    expect(logEvent.mock.calls[1][5]).toEqual({ tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise });
    // Returned is terminal for this row: no further move is legal.
    expect((await post(ACCEPT, {})).status).toBe(409);
    expect((await post(RELEASE, {})).status).toBe(409);
    expect((await post(DISPOSITION, NOT_READY)).status).toBe(409);
  });

  it('the cooldown length: the body, else the brand cooldown policy, else 14 days', async () => {
    seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted' });
    cooldownPolicy = { cooldown_days: 21, status: 'active' };
    const policy = await post(DISPOSITION, { disposition: 'nurture', reason: 'keep them warm with the newsletter only' });
    expect(policy.body).toMatchObject({ status: 'returned_to_ai', cooldown_source: 'policy' });
    expect(new Date(policy.body.cooldown_until).getTime() - (handoffs.get(ROW_ID)!.disposition_at as Date).getTime()).toBe(21 * DAY);

    handoffs.clear(); outcomes.length = 0; cooldownPolicy = null;
    seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted' });
    const fallback = await post(DISPOSITION, NOT_READY);
    expect(fallback.body).toMatchObject({ status: 'returned_to_ai', cooldown_source: 'default' });
    expect(new Date(fallback.body.cooldown_until).getTime() - (handoffs.get(ROW_ID)!.disposition_at as Date).getTime()).toBe(DEFAULT_RETURN_COOLDOWN_DAYS * DAY);
  });

  it('a closing disposition (qualified) → dispositioned with no cooldown; nothing beyond this run\'s tables is written (T406 owns the integration writers)', async () => {
    const row = seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted' });
    ownership.push({ id: 'own-0', tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, lead_id: 501, owner_type: 'human', owner_id: 'staff-1', cleared_at: null });
    const res = await post(DISPOSITION, { disposition: 'qualified', reason: 'budget confirmed; wants a proposal next week' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'dispositioned', cooldown_until: null, cooldown_source: null, ownership_cleared: 1 });
    expect(row).toMatchObject({ status: 'dispositioned', disposition: 'qualified', return_to_ai: null });
    expect(outcomes[0]).toMatchObject({ outcome_type: 'handoff_dispositioned', source_ref: `${ROW_ID}:qualified`, metadata: { disposition: 'qualified', returned_to_ai: false, cooldown_until: null } });
    expect(ledgerEvents()).toEqual(['growth_journey.handoff.dispositioned']);
  });

  it('release from accepted → queued: the ownership row cleared, the ticket kept, the assignee gone, the ledger row written', async () => {
    const row = seed(TENANT.colaberry, BRAND.enterprise, { status: 'accepted', ticket_id: 't-9', assigned_to_type: 'human', assigned_to_id: 'staff-1', accepted_at: new Date() });
    ownership.push({ id: 'own-0', tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, lead_id: 501, owner_type: 'human', owner_id: 'staff-1', cleared_at: null });
    const res = await post(RELEASE, { reason: 'out of office for two weeks' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'queued', ownership_cleared: 1, handoff: { status: 'queued', ticket_id: 't-9', assigned_to_type: null, assigned_to_id: null, accepted_at: null, assignment_blocked_reason: 'released' } });
    expect(row.ticket_id).toBe('t-9');
    expect(ownership[0]).toMatchObject({ cleared_reason: 'released:out of office for two weeks' });
    expect(logEvent).toHaveBeenCalledWith('growth_journey.handoff.released', 'admin:staff-1', 'growth_journey_handoff', ROW_ID, expect.objectContaining({ from: 'accepted', reason: 'out of office for two weeks', ownership_cleared: 1 }), { tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise });
    expect(outcomes).toHaveLength(0);
    // Back in the queue, the next accept is legal again.
    expect((await post(ACCEPT, {})).status).toBe(200);
  });
});
