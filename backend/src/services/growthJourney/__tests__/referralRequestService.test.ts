/**
 * T228 — a cross-brand referral REQUEST: a transition row, nothing else.
 * Policy reads are the real `offerEligibility` over a mocked policy table
 * derived from the shipped definitions, so Scenario F here is the shipped one.
 */
import { OFFER_FAMILIES } from '../../../models/OfferFamily';
import { allowedFamiliesFor } from '../../../seeds/growthJourney/offerPolicyDefinitions';

const transitionCreate = jest.fn();
const transitionFindOne = jest.fn();
const policyFindAll = jest.fn();
const policyFindOne = jest.fn();
const brandFindAll = jest.fn();
const resolveSubject = jest.fn();
const leadContextWriter = jest.fn();

jest.mock('../../../models', () => ({
  GrowthJourneyTransition: { create: (...a: unknown[]) => transitionCreate(...a), findOne: (...a: unknown[]) => transitionFindOne(...a) },
  LeadTenantContext: { create: (...a: unknown[]) => leadContextWriter(...a), findOrCreate: (...a: unknown[]) => leadContextWriter(...a) },
}));
jest.mock('../../../models/BrandOfferPolicy', () => ({ BrandOfferPolicy: { findAll: (...a: unknown[]) => policyFindAll(...a), findOne: (...a: unknown[]) => policyFindOne(...a) } }));
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: (...a: unknown[]) => brandFindAll(...a) } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => resolveSubject(...a) }));
jest.mock('../../../modules/tenancy/leadContextService', () => ({ ensureLeadTenantContext: (...a: unknown[]) => leadContextWriter(...a) }));

import { requestBrandReferral } from '../referralRequestService';

const BRANDS = [
  { id: 'b-cpn', slug: 'cpn', tenant_id: 't-cpn' },
  { id: 'b-tr', slug: 'colaberry-training', tenant_id: 't-col' },
  { id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: 't-col' },
  { id: 'b-af', slug: 'ai-flotation', tenant_id: 't-af' },
];
const tenantSlug = (t: string) => ({ 't-cpn': 'cpn', 't-col': 'colaberry', 't-af': 'ai-flotation' } as Record<string, string>)[t];

function policyRows() {
  const rows: Array<Record<string, unknown>> = [];
  for (const b of BRANDS) for (const f of allowedFamiliesFor(tenantSlug(b.tenant_id), b.slug)) rows.push({ brand_id: b.id, offer_family: f, decision: 'allow', status: 'active', effective_from: new Date(0), effective_to: null });
  for (const f of OFFER_FAMILIES) if (!allowedFamiliesFor('ai-flotation', 'ai-flotation').includes(f)) rows.push({ brand_id: 'b-af', offer_family: f, decision: 'deny', status: 'active', effective_from: new Date(0), effective_to: null });
  return rows;
}

let created: Array<Record<string, unknown>>;
class UniqueError extends Error { name = 'SequelizeUniqueConstraintError'; }

beforeEach(() => {
  for (const fn of [transitionCreate, transitionFindOne, policyFindAll, policyFindOne, brandFindAll, resolveSubject, leadContextWriter]) fn.mockReset();
  created = [];
  const matching = (q: { where: Record<string, unknown> }) => policyRows().filter((r) => Object.entries(q.where).every(([k, v]) => r[k] === v));
  policyFindAll.mockImplementation(async (q) => matching(q));
  policyFindOne.mockImplementation(async (q) => { const rows = matching(q); return rows.find((r) => r.decision === 'deny') ?? rows[0] ?? null; });
  brandFindAll.mockImplementation(async (q: { where: { id: string[] } }) => BRANDS.filter((b) => q.where.id.includes(b.id)));
  resolveSubject.mockResolvedValue({ status: 'resolved', subject: { lead_id: 501, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: 'p@example.com', brand_relationships: [] }, sources: ['lead'] });
  transitionCreate.mockImplementation(async (row: Record<string, unknown>) => {
    if (created.some((r) => r.idempotency_key === row.idempotency_key)) throw new UniqueError('dup');
    const rec = { id: `t-${created.length + 1}`, ...row }; created.push(rec); return rec;
  });
  transitionFindOne.mockImplementation(async (q: { where: { idempotency_key: string } }) => created.find((r) => r.idempotency_key === q.where.idempotency_key) ?? null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const base = { anchor: { leadId: 501 }, fromBrandId: 'b-af', fromTenantId: 't-af', reason: 'lead asked for business training', requestedBy: 'classifier' };

describe('Scenario F — AI Flotation subject asking for business training', () => {
  it('requests a referral to Colaberry Enterprise, as a transition row, with the deny in evidence', async () => {
    const r = await requestBrandReferral({ ...base, offerFamily: 'business_training' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ to_brand_id: 'b-ent', to_brand_slug: 'colaberry-enterprise', replayed: false });
    expect(transitionCreate).toHaveBeenCalledWith(expect.objectContaining({
      transition_type: 'brand_referral_requested', status: 'requested', brand_id: 'b-af', tenant_id: 't-af', subject_ref: 'lead:501',
      from_value: { brand_id: 'b-af' }, to_value: expect.objectContaining({ brand_id: 'b-ent', offer_family: 'business_training' }),
      requested_by: 'classifier',
    }));
    expect((transitionCreate.mock.calls[0][0] as { evidence: string[] }).evidence).toEqual(expect.arrayContaining(['from_brand_eligibility:explicit_deny', 'target:colaberry-enterprise']));
  });

  it('the same request twice is the same row (replayed)', async () => {
    const a = await requestBrandReferral({ ...base, offerFamily: 'business_training' });
    const b = await requestBrandReferral({ ...base, offerFamily: 'business_training' });
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(b.replayed).toBe(true);
    expect(b.row.id).toBe(a.row.id);
    expect(created).toHaveLength(1);
  });
});

describe('refusals — each is a reason, and no row', () => {
  it('a family the source brand CAN offer: nothing to refer', async () => {
    const r = await requestBrandReferral({ ...base, fromBrandId: 'b-tr', fromTenantId: 't-col', offerFamily: 'learner_paid_training' });
    expect(r).toEqual({ ok: false, reason: 'from_brand_can_offer' });
    expect(transitionCreate).not.toHaveBeenCalled();
  });

  it('a learner family from AI Flotation: two brands allow it → ambiguous, both named, no row', async () => {
    const r = await requestBrandReferral({ ...base, offerFamily: 'learner_free_training' });
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous_target' });
    if (r.ok || r.reason !== 'ambiguous_target') return;
    expect(r.candidates.map((c) => c.brand_slug).sort()).toEqual(['colaberry-training', 'cpn']);
    expect(transitionCreate).not.toHaveBeenCalled();
  });

  it('a family no brand allows (or an unknown one): no_brand_offers_family', async () => {
    policyFindAll.mockResolvedValue([]);
    expect(await requestBrandReferral({ ...base, offerFamily: 'business_training' })).toEqual({ ok: false, reason: 'no_brand_offers_family' });
    expect(await requestBrandReferral({ ...base, offerFamily: 'quantum_consulting' })).toEqual({ ok: false, reason: 'no_brand_offers_family' });
    expect(transitionCreate).not.toHaveBeenCalled();
  });

  it('an unresolvable subject', async () => {
    resolveSubject.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    expect(await requestBrandReferral({ ...base, offerFamily: 'business_training' })).toEqual({ ok: false, reason: 'unresolved_subject', detail: 'anchor_not_found' });
  });
});

describe('what it never does', () => {
  it('never writes a brand relationship, a lead, an account or a task', async () => {
    await requestBrandReferral({ ...base, offerFamily: 'business_training' });
    expect(leadContextWriter).not.toHaveBeenCalled();
  });

  it('its log line carries no address', async () => {
    await requestBrandReferral({ ...base, offerFamily: 'business_training' });
    const lines = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('growth_journey.referral.requested');
    expect(lines).not.toContain('@');
  });
});
