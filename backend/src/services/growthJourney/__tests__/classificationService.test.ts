/**
 * T225 — persist, replay, override. The models are a barrel of jest.fns; the
 * subject resolver and tenant resolver are mocked at their module boundary;
 * the policy reads are the real `offerEligibility` over a mocked policy table
 * derived from the shipped definitions, so the AI Flotation exclusion here is
 * the one production seeds.
 */
import { OFFER_FAMILIES } from '../../../models/OfferFamily';
import { allowedFamiliesFor } from '../../../seeds/growthJourney/offerPolicyDefinitions';

const m = {
  classificationCreate: jest.fn(),
  classificationFindOne: jest.fn(),
  classificationFindByPk: jest.fn(),
  leadFindByPk: jest.fn(),
  leadSourceFindByPk: jest.fn(),
  entryPointFindByPk: jest.fn(),
  brandFindByPk: jest.fn(),
  brandFindAll: jest.fn(),
  programFindByPk: jest.fn(),
  campaignFindByPk: jest.fn(),
  ltcFindOne: jest.fn(),
  orgMemberFindByPk: jest.fn(),
  orgFindByPk: jest.fn(),
  pageEventFindAll: jest.fn(),
  policyFindAll: jest.fn(),
  policyFindOne: jest.fn(),
  consentAny: jest.fn(),
  leadUpdate: jest.fn(),
  resolveSubject: jest.fn(),
  resolvePublicContext: jest.fn(),
};

jest.mock('../../../models', () => ({
  GrowthJourneyClassification: {
    create: (...a: unknown[]) => m.classificationCreate(...a),
    findOne: (...a: unknown[]) => m.classificationFindOne(...a),
    findByPk: (...a: unknown[]) => m.classificationFindByPk(...a),
  },
  Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a), update: (...a: unknown[]) => m.leadUpdate(...a) },
  LeadSource: { findByPk: (...a: unknown[]) => m.leadSourceFindByPk(...a) },
  EntryPoint: { findByPk: (...a: unknown[]) => m.entryPointFindByPk(...a) },
  Brand: { findByPk: (...a: unknown[]) => m.brandFindByPk(...a), findAll: (...a: unknown[]) => m.brandFindAll(...a) },
  JourneyProgram: { findByPk: (...a: unknown[]) => m.programFindByPk(...a) },
  Campaign: { findByPk: (...a: unknown[]) => m.campaignFindByPk(...a) },
  LeadTenantContext: { findOne: (...a: unknown[]) => m.ltcFindOne(...a) },
  OrgMember: { findByPk: (...a: unknown[]) => m.orgMemberFindByPk(...a) },
  Organization: { findByPk: (...a: unknown[]) => m.orgFindByPk(...a) },
  PageEvent: { findAll: (...a: unknown[]) => m.pageEventFindAll(...a) },
  ConsentRecord: { create: (...a: unknown[]) => m.consentAny(...a), update: (...a: unknown[]) => m.consentAny(...a) },
}));
jest.mock('../../../models/BrandOfferPolicy', () => ({ BrandOfferPolicy: { findAll: (...a: unknown[]) => m.policyFindAll(...a), findOne: (...a: unknown[]) => m.policyFindOne(...a) } }));
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => m.brandFindByPk(...a), findAll: (...a: unknown[]) => m.brandFindAll(...a) } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => m.resolveSubject(...a) }));
jest.mock('../../../modules/tenancy/tenantResolver', () => ({ resolvePublicContext: (...a: unknown[]) => m.resolvePublicContext(...a) }));

import { classifySubject, overrideClassification, requestClassificationReview, stableJson } from '../classificationService';
import { OfferNotEligibleError } from '../offerEligibility';
import { RULESET_VERSION } from '../classification/types';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';

// ── fixtures ──────────────────────────────────────────────────────────────
const BRANDS = {
  cpn: { id: 'b-cpn', tenant_id: 't-cpn', slug: 'cpn', default_journey_program_id: 'p-cpn' },
  training: { id: 'b-tr', tenant_id: 't-col', slug: 'colaberry-training', default_journey_program_id: 'p-tr' },
  enterprise: { id: 'b-ent', tenant_id: 't-col', slug: 'colaberry-enterprise', default_journey_program_id: 'p-ent' },
  flotation: { id: 'b-af', tenant_id: 't-af', slug: 'ai-flotation', default_journey_program_id: 'p-af' },
};
const PROGRAMS: Record<string, { id: string; slug: string; status: string }> = {
  'p-cpn': { id: 'p-cpn', slug: 'learner', status: 'active' },
  'p-tr': { id: 'p-tr', slug: 'learner', status: 'active' },
  'p-ent': { id: 'p-ent', slug: 'business-growth', status: 'active' },
  'p-af': { id: 'p-af', slug: 'service-growth', status: 'draft' }, // as shipped: draft
};
const tenantSlug = (b: { tenant_id: string }) => ({ 't-cpn': 'cpn', 't-col': 'colaberry', 't-af': 'ai-flotation' } as Record<string, string>)[b.tenant_id];

/** The policy table, derived from the shipped definitions: allow rows per brand, deny rows for AI Flotation. */
function policyRows(): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const b of Object.values(BRANDS)) {
    for (const f of allowedFamiliesFor(tenantSlug(b), b.slug)) rows.push({ brand_id: b.id, offer_family: f, decision: 'allow', status: 'active', effective_from: new Date(0), effective_to: null });
  }
  for (const f of OFFER_FAMILIES) {
    if (!allowedFamiliesFor('ai-flotation', 'ai-flotation').includes(f)) rows.push({ brand_id: BRANDS.flotation.id, offer_family: f, decision: 'deny', status: 'active', effective_from: new Date(0), effective_to: null });
  }
  return rows;
}

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyExecution: false, ...over,
});

const lead = (over: Record<string, unknown> = {}) => ({
  id: 501, source: 'ai-flotation', source_id: 'src-af', entry_point_id: 'ep-wf', form_type: 'workflow_intake',
  interest_area: '', message: 'We want to automate client onboarding', email: 'person@example.com', visitor_id: null, ...over,
});

let createdRows: Array<Record<string, unknown>>;

function arrange(opts: { lead?: Record<string, unknown>; brand?: keyof typeof BRANDS; lock?: Record<string, unknown> | null; locks?: Array<Record<string, unknown>>; pageEventsThrow?: boolean } = {}) {
  const b = BRANDS[opts.brand ?? 'flotation'];
  m.resolveSubject.mockResolvedValue({ status: 'resolved', subject: { lead_id: 501, enrollment_id: null, visitor_id: 'v-1', org_member_id: null, email_normalized: 'person@example.com', brand_relationships: [] }, sources: ['lead'] });
  m.leadFindByPk.mockResolvedValue(lead(opts.lead));
  m.leadSourceFindByPk.mockResolvedValue({ id: 'src-af', slug: b.slug });
  m.entryPointFindByPk.mockResolvedValue({ id: 'ep-wf', slug: 'workflow_intake', entry_type: null });
  m.resolvePublicContext.mockResolvedValue({ context: { tenantId: b.tenant_id, brandId: b.id, brandSlug: b.slug }, path: 'source_slug' });
  m.brandFindByPk.mockImplementation(async (id: string) => Object.values(BRANDS).find((x) => x.id === id) ?? null);
  m.brandFindAll.mockImplementation(async (q: { where: { id: string[] } }) => Object.values(BRANDS).filter((x) => q.where.id.includes(x.id)));
  m.programFindByPk.mockImplementation(async (id: string) => PROGRAMS[id] ?? null);
  m.campaignFindByPk.mockResolvedValue(null);
  m.ltcFindOne.mockResolvedValue(null);
  m.orgMemberFindByPk.mockResolvedValue(null);
  m.orgFindByPk.mockResolvedValue(null);
  if (opts.pageEventsThrow) m.pageEventFindAll.mockRejectedValue(new Error('page_events unavailable'));
  else m.pageEventFindAll.mockResolvedValue([]);
  const matching = (q: { where: Record<string, unknown> }) => policyRows().filter((r) => Object.entries(q.where).every(([k, v]) => r[k] === v));
  m.policyFindAll.mockImplementation(async (q: { where: Record<string, unknown> }) => matching(q));
  // The resolver's findOne on (brand, family): a deny row wins when both exist, as the
  // unique index (brand, family) means at most one row exists in production anyway.
  m.policyFindOne.mockImplementation(async (q: { where: Record<string, unknown> }) => {
    const rows = matching(q);
    return rows.find((r) => r.decision === 'deny') ?? rows[0] ?? null;
  });
  m.classificationFindOne.mockImplementation(async (q: { where: Record<string, unknown>; order?: Array<[string, string]> }) => {
    if (q.where.locked === true) {
      // Honours the order clause (default ASC when none is given), so "the latest lock wins" tests the QUERY, not this fake.
      const rows = [...(opts.locks ?? (opts.lock ? [opts.lock] : []))];
      const [col = 'created_at', dir = 'ASC'] = q.order?.[0] ?? [];
      const at = (r: Record<string, unknown>) => (r[col] as Date).getTime();
      rows.sort((a, b) => (dir === 'DESC' ? at(b) - at(a) : at(a) - at(b)));
      return rows[0] ?? null;
    }
    if (q.where.idempotency_key) return createdRows.find((r) => r.idempotency_key === q.where.idempotency_key) ?? null;
    return null;
  });
}

class UniqueError extends Error { name = 'SequelizeUniqueConstraintError'; }

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  createdRows = [];
  m.classificationCreate.mockImplementation(async (row: Record<string, unknown>) => {
    if (createdRows.some((r) => r.idempotency_key === row.idempotency_key)) throw new UniqueError('dup');
    const rec = { id: `c-${createdRows.length + 1}`, ...row };
    createdRows.push(rec);
    return rec;
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const anchor = { leadId: 501 };

describe('the gate', () => {
  it('master flag off → disabled, and nothing is read or written', async () => {
    arrange();
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags({ growthJourneyEnabled: false }) });
    expect(r).toEqual({ status: 'disabled' });
    expect(m.resolveSubject).not.toHaveBeenCalled();
    expect(m.classificationCreate).not.toHaveBeenCalled();
  });
});

describe('classify and persist', () => {
  it('Scenario D shape: AI Flotation workflow intake → workflow_automation, a proposed row, allowed by policy', async () => {
    arrange();
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    expect(r.status).toBe('classified');
    if (r.status !== 'classified') return;
    expect(r.result.primary_path).toBe('workflow_automation');
    expect(r.result.source_step).toBe(2);
    expect(r.replayed).toBe(false);
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 't-af', brand_id: 'b-af', subject_ref: 'lead:501', lead_id: 501, trigger: 'lead_ingest',
      primary_path: 'workflow_automation', status: 'proposed', locked: false, ai_involved: false, ruleset_version: RULESET_VERSION,
      brand_relationship: 'ai-flotation',
    }));
    expect(r.row.evidence).toContain('brand_boundary:allowed');
    // the brand's programme is draft as shipped: withheld, honestly
    expect(r.result.journey_program).toBeNull();
    // the per-step trace is persisted for the Why: one entry per step, exact outcomes
    const trace = (r.row.evidence as string[]).filter((e) => e.startsWith('trace:'));
    expect(trace).toHaveLength(8);
    expect(trace[0]).toMatch(/^trace:1:abstained:/);
    expect(trace[1]).toMatch(/^trace:2:answered:path workflow_automation/);
    expect(trace[6]).toMatch(/^trace:7:skipped:no model wired/);
  });

  it('Scenario F persisted: AI Flotation + business training → needs_review row, path null, referral target Enterprise', async () => {
    arrange({ lead: { message: 'we need business training for our whole team' } });
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    expect(r.status).toBe('classified');
    if (r.status !== 'classified') return;
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      primary_path: null, status: 'needs_review', requires_human_review: true, referral_target_brand_id: 'b-ent',
      eligibility: expect.objectContaining({ allowed: false, reason: 'explicit_deny', offer_family: 'business_training' }),
    }));
  });

  it('same anchor, same inputs, twice → one row; the second call reports replayed', async () => {
    arrange();
    const a = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    const b = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    expect(a.status).toBe('classified');
    expect(b.status).toBe('classified');
    if (a.status !== 'classified' || b.status !== 'classified') return;
    expect(b.replayed).toBe(true);
    expect(b.row.id).toBe(a.row.id);
    expect(createdRows).toHaveLength(1);
  });

  it('a changed message → a second row; the first is untouched', async () => {
    arrange();
    const a = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    const firstSnapshot = JSON.stringify(createdRows[0]);
    m.leadFindByPk.mockResolvedValue(lead({ message: 'actually we want a proof of concept' }));
    const b = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    if (a.status !== 'classified' || b.status !== 'classified') throw new Error('expected classified');
    expect(b.replayed).toBe(false);
    expect(b.row.id).not.toBe(a.row.id);
    expect(b.result.primary_path).toBe('ai_project');
    expect(createdRows).toHaveLength(2);
    expect(JSON.stringify(createdRows[0])).toBe(firstSnapshot);
  });

  it('a different trigger for the same inputs is its own row (a reply is not an ingest)', async () => {
    arrange();
    await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    await classifySubject({ anchor, trigger: 'replay', flags: flags() });
    expect(createdRows).toHaveLength(2);
  });

  it('a lock row wins: step 1, the lock’s values, later steps skipped', async () => {
    arrange({ lock: { id: 'c-lock', brand_relationship: 'ai-flotation', journey_program_slug: 'service-growth', primary_path: 'ai_consulting', secondary_paths: [], intent: 'locked by ops', decided_by: 'human:admin-9' } });
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    if (r.status !== 'classified') throw new Error('expected classified');
    expect(r.result.source_step).toBe(1);
    expect(r.result.primary_path).toBe('ai_consulting');
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({ source_step: 1, primary_path: 'ai_consulting' }));
    expect(r.result.evidence).toContain('step1:decided_by:human:admin-9');
  });

  it('a LATER lock row wins over an earlier one (the query orders by created_at DESC)', async () => {
    const lock = (id: string, created_at: string, primary_path: string) => ({
      id, created_at: new Date(created_at), brand_relationship: 'ai-flotation', journey_program_slug: null, primary_path, secondary_paths: [], intent: null, decided_by: 'human:admin-9',
    });
    arrange({ locks: [lock('c-old', '2026-09-01T00:00:00Z', 'ai_project'), lock('c-new', '2026-09-10T00:00:00Z', 'ai_consulting')] });
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    if (r.status !== 'classified') throw new Error('expected classified');
    expect(r.result.primary_path).toBe('ai_consulting');
    expect(r.result.evidence).toContain('step1:human_lock:c-new');
  });

  it('a failed lookup logs its error class: the name goes to the row, the class to the log', async () => {
    arrange({ pageEventsThrow: true });
    await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('classification.input_unavailable'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string) as { input: string; error_class: string };
    expect(parsed.input).toBe('behaviour');
    expect(typeof parsed.error_class).toBe('string');
    expect(parsed.error_class.length).toBeGreaterThan(0);
  });

  it('no brand context → unclassifiable, the result is returned, nothing is written', async () => {
    arrange();
    m.resolvePublicContext.mockResolvedValue({ context: null, path: 'unresolved' });
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    expect(r.status).toBe('unclassifiable');
    expect(m.classificationCreate).not.toHaveBeenCalled();
  });

  it('an unresolvable anchor → unresolved, nothing written', async () => {
    m.resolveSubject.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    const r = await classifySubject({ anchor: { leadId: 999 }, trigger: 'manual', flags: flags() });
    expect(r).toEqual({ status: 'unresolved', reason: 'anchor_not_found' });
    expect(m.classificationCreate).not.toHaveBeenCalled();
  });

  it('Scenario H (isolation half): one person, a Training relationship then an Enterprise one → two rows under two brand_ids, neither replaying the other', async () => {
    arrange({ brand: 'training', lead: { interest_level: 'enrollment', message: null } });
    const training = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    m.campaignFindByPk.mockResolvedValue({ id: 'camp-9', brand_id: 'b-ent', settings: { campaign_key: 'enterprise_cold_q3' }, interest_group: null });
    const enterprise = await classifySubject({
      anchor, trigger: 'reply', flags: flags(),
      extras: { reply: { body: 'Yes, automate our intake', channel: 'email', campaign_id: 'camp-9' } },
    });
    if (training.status !== 'classified' || enterprise.status !== 'classified') throw new Error('expected two classified rows');
    expect(createdRows).toHaveLength(2);
    expect(createdRows.map((r) => r.brand_id)).toEqual(['b-tr', 'b-ent']);
    expect(createdRows.map((r) => r.tenant_id)).toEqual(['t-col', 't-col']);
    expect(createdRows[0].idempotency_key).not.toBe(createdRows[1].idempotency_key);
    expect(enterprise.replayed).toBe(false);
    // A Training-restricted member's list carries `brand_id: [b-tr]` in its where clause (the route test pins that), so it sees one of the two.
    expect(createdRows.filter((r) => ['b-tr'].includes(String(r.brand_id)))).toHaveLength(1);
  });

  it('Scenario J: an input that cannot be loaded is marked unavailable, never zeroed, and the row still lands', async () => {
    arrange({ pageEventsThrow: true });
    const r = await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    if (r.status !== 'classified') throw new Error('expected classified');
    expect(r.unavailable).toEqual(['behaviour']);
    expect(r.row.evidence).toEqual(expect.arrayContaining(['step5:behaviour:unavailable', 'input_unavailable:behaviour']));
    expect(r.result.primary_path).toBe('workflow_automation');
  });

  it('Scenario G: a reply to a registered campaign is classified under the campaign’s brand, and consent is neither read nor widened', async () => {
    arrange({ brand: 'cpn' }); // the lead first arrived via CPN
    m.campaignFindByPk.mockResolvedValue({ id: 'camp-9', brand_id: 'b-ent', settings: { campaign_key: 'enterprise_cold_q3' }, interest_group: null });
    const r = await classifySubject({
      anchor, trigger: 'reply', flags: flags(),
      extras: { reply: { body: 'Yes — can you automate our reporting?', channel: 'email', campaign_id: 'camp-9' } },
    });
    if (r.status !== 'classified') throw new Error('expected classified');
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({ brand_id: 'b-ent', tenant_id: 't-col', trigger: 'reply', primary_path: 'workflow_automation', brand_relationship: 'colaberry-enterprise' }));
    expect(r.row.evidence).toContain('campaign:enterprise_cold_q3'); // the row says which campaign fixed the brand
    expect(m.consentAny).not.toHaveBeenCalled();
    expect(m.leadUpdate).not.toHaveBeenCalled();
  });

  it('the log lines carry the subject ref and slugs, never the person’s address or text', async () => {
    arrange({ lead: { message: 'I am Jane Roe, jane@example.com, automate my CRM' } });
    await classifySubject({ anchor, trigger: 'lead_ingest', flags: flags() });
    const lines = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('growth_journey.classification.recorded');
    expect(lines).not.toContain('@');
    expect(lines).not.toMatch(/jane/i);
  });
});

describe('human override', () => {
  const prior = () => ({
    id: 'c-1', tenant_id: 't-af', brand_id: 'b-af', subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, input_hash: 'h',
    brand_relationship: 'ai-flotation', journey_program_slug: null, primary_path: 'workflow_automation', intent: 'automation_request',
  });

  it('a denied family is refused with OfferNotEligibleError and NO row is written', async () => {
    arrange();
    m.classificationFindByPk.mockResolvedValue(prior());
    await expect(overrideClassification({ classificationId: 'c-1', admin: { id: 'admin-1' }, patch: { primary_path: 'business_training' }, lock: true, reason: 'they said training' }))
      .rejects.toBeInstanceOf(OfferNotEligibleError);
    expect(m.classificationCreate).not.toHaveBeenCalled();
  });

  it('an allowed family → a NEW row at step 1 pointing at the prior; the prior object is untouched', async () => {
    arrange();
    const p = prior();
    const before = JSON.stringify(p);
    m.classificationFindByPk.mockResolvedValue(p);
    const r = await overrideClassification({ classificationId: 'c-1', admin: { id: 'admin-1' }, patch: { primary_path: 'ai_consulting' }, lock: true, reason: 'call notes say consulting' });
    expect(r.status).toBe('overridden');
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      override_of: 'c-1', source_step: 1, decided_by: 'human:admin-1', locked: true, status: 'confirmed', primary_path: 'ai_consulting',
      trigger: 'manual', ai_involved: false, subject_ref: 'lead:501', brand_id: 'b-af',
    }));
    expect(JSON.stringify(p)).toBe(before);
  });

  it('clearing the path is a rejection, not a confirmation', async () => {
    arrange();
    m.classificationFindByPk.mockResolvedValue(prior());
    await overrideClassification({ classificationId: 'c-1', admin: { id: 'admin-1' }, patch: { primary_path: null }, lock: false, reason: 'not a real lead' });
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', primary_path: null, locked: false }));
  });

  it('the same override submitted twice lands on one row', async () => {
    arrange();
    m.classificationFindByPk.mockResolvedValue(prior());
    const args = { classificationId: 'c-1', admin: { id: 'admin-1' }, patch: { primary_path: 'ai_consulting' }, lock: true, reason: 'x'.repeat(8) };
    const a = await overrideClassification(args);
    const b = await overrideClassification(args);
    if (a.status !== 'overridden' || b.status !== 'overridden') throw new Error('expected overridden');
    expect(b.replayed).toBe(true);
    expect(b.row.id).toBe(a.row.id);
  });

  it('a missing prior → not_found', async () => {
    m.classificationFindByPk.mockResolvedValue(null);
    expect(await overrideClassification({ classificationId: 'zzz', admin: { id: 'a' }, patch: {}, lock: false, reason: 'whatever' })).toEqual({ status: 'not_found' });
  });
});

describe('a review request (routing action)', () => {
  const prior = (over: Record<string, unknown> = {}) => ({
    id: 'c-1', tenant_id: 't-af', brand_id: 'b-af', subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, input_hash: 'h',
    brand_relationship: 'ai-flotation', journey_program_slug: null, primary_path: 'workflow_automation', secondary_paths: [], intent: 'x',
    confidence: 0.7, evidence: ['step2:message_rule:automation'], source_step: 2, requires_human_review: false, status: 'proposed',
    eligibility: null, referral_target_brand_id: null, ai_involved: false, model_version: null, ruleset_version: RULESET_VERSION, ...over,
  });

  it('writes a NEW needs_review row copying the answer, pointing at the prior, without deciding anything', async () => {
    arrange();
    m.classificationFindByPk.mockResolvedValue(prior());
    const r = await requestClassificationReview({ classificationId: 'c-1', requestedBy: 'routing_rule:raw-9', reason: 'rule says review' });
    expect(r.status).toBe('overridden');
    expect(m.classificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      override_of: 'c-1', requires_human_review: true, status: 'needs_review', primary_path: 'workflow_automation', source_step: 2, decided_by: null, locked: false,
    }));
    expect((m.classificationCreate.mock.calls[0][0] as { evidence: string[] }).evidence).toContain('requested_by_rule:raw-9');
  });

  it('a row already under review is returned as-is (replayed), no second row', async () => {
    arrange();
    m.classificationFindByPk.mockResolvedValue(prior({ requires_human_review: true, status: 'needs_review' }));
    const r = await requestClassificationReview({ classificationId: 'c-1', requestedBy: 'routing_rule:raw-9', reason: 'again' });
    expect(r).toMatchObject({ status: 'overridden', replayed: true });
    expect(m.classificationCreate).not.toHaveBeenCalled();
  });

  it('the same request twice lands on one row', async () => {
    arrange();
    m.classificationFindByPk.mockResolvedValue(prior());
    await requestClassificationReview({ classificationId: 'c-1', requestedBy: 'routing_rule:raw-9', reason: 'r' });
    const b = await requestClassificationReview({ classificationId: 'c-1', requestedBy: 'routing_rule:raw-9', reason: 'r' });
    expect(b).toMatchObject({ status: 'overridden', replayed: true });
    expect(createdRows).toHaveLength(1);
  });
});

describe('stableJson', () => {
  it('orders keys at every level so equal inputs hash equal', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(stableJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: 2 }));
  });
});
