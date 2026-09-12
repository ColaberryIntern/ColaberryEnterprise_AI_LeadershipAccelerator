/**
 * T227 — the nine Phase 2 routing actions. Five act on journey tables; four
 * are recorded as `deferred`, never `ok`. Every handler is master-gated and
 * honest (a no-op is `ok: false` with a reason).
 */
const m = {
  enrollmentCreate: jest.fn(),
  enrollmentFindOne: jest.fn(),
  pathFindOne: jest.fn(),
  programFindOne: jest.fn(),
  programFindByPk: jest.fn(),
  classifySubject: jest.fn(),
  requestClassificationReview: jest.fn(),
  assertOfferAllowed: jest.fn(),
  resolveDefaultJourneyProgramId: jest.fn(),
  recordTransition: jest.fn(),
  requestBrandReferral: jest.fn(),
  // must never be touched
  leadContext: jest.fn(),
  campaign: jest.fn(),
  org: jest.fn(),
};

jest.mock('../../../models', () => ({
  GrowthJourneyEnrollment: { create: (...a: unknown[]) => m.enrollmentCreate(...a), findOne: (...a: unknown[]) => m.enrollmentFindOne(...a) },
  JourneyPath: { findOne: (...a: unknown[]) => m.pathFindOne(...a) },
  JourneyProgram: { findOne: (...a: unknown[]) => m.programFindOne(...a), findByPk: (...a: unknown[]) => m.programFindByPk(...a) },
  LeadTenantContext: { create: (...a: unknown[]) => m.leadContext(...a) },
  Campaign: { findOne: (...a: unknown[]) => m.campaign(...a) },
  CampaignLead: { create: (...a: unknown[]) => m.campaign(...a) },
  Organization: { create: (...a: unknown[]) => m.org(...a), findOrCreate: (...a: unknown[]) => m.org(...a) },
  OrgMember: { create: (...a: unknown[]) => m.org(...a), findOrCreate: (...a: unknown[]) => m.org(...a) },
}));
jest.mock('../../growthJourney/classificationService', () => ({
  classifySubject: (...a: unknown[]) => m.classifySubject(...a),
  requestClassificationReview: (...a: unknown[]) => m.requestClassificationReview(...a),
}));
jest.mock('../../growthJourney/offerEligibility', () => {
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: Record<string, unknown>) { super('not eligible'); }
  }
  return { OfferNotEligibleError, assertOfferAllowed: (...a: unknown[]) => m.assertOfferAllowed(...a) };
});
jest.mock('../../growthJourney/journeyDefaults', () => ({ resolveDefaultJourneyProgramId: (...a: unknown[]) => m.resolveDefaultJourneyProgramId(...a) }));
jest.mock('../../growthJourney/transitionService', () => ({ recordTransition: (...a: unknown[]) => m.recordTransition(...a) }));
jest.mock('../../growthJourney/referralRequestService', () => ({ requestBrandReferral: (...a: unknown[]) => m.requestBrandReferral(...a) }));

import { GROWTH_JOURNEY_ACTION_TYPES, makeGrowthJourneyActions } from '../growthJourneyActions';
import { OfferNotEligibleError } from '../../growthJourney/offerEligibility';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';

const ON: GrowthJourneyFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyExecution: false };
const OFF: GrowthJourneyFlags = { ...ON, growthJourneyEnabled: false };
const actions = (flags: GrowthJourneyFlags = ON) => makeGrowthJourneyActions(() => flags);

const ctx = (over: Record<string, unknown> = {}) => ({
  lead: { id: 501 },
  source_slug: 'ai-flotation',
  entry_slug: 'workflow_intake',
  raw_payload_id: 'raw-9',
  normalized: {},
  tenant_id: 't-af',
  brand_id: 'b-af',
  brand_slug: 'ai-flotation',
  rule_id: 'rule-7',
  rule_version: 3,
  ...over,
});
const PROGRAM = { id: 'p-af', tenant_id: 't-af', brand_id: 'b-af', slug: 'service-growth', status: 'active' };
const classified = (over: Record<string, unknown> = {}) => ({
  status: 'classified',
  row: { id: 'c-1' },
  replayed: false,
  unavailable: [],
  result: { journey_program: 'service-growth', primary_path: 'workflow_automation', referral_target_brand_id: null, eligibility: { allowed: true, reason: 'allowed', offer_family: 'workflow_automation' }, ...over },
});
class UniqueError extends Error { name = 'SequelizeUniqueConstraintError'; }

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.classifySubject.mockResolvedValue(classified());
  m.programFindOne.mockResolvedValue(PROGRAM);
  m.programFindByPk.mockResolvedValue(PROGRAM);
  m.enrollmentCreate.mockImplementation(async (row: Record<string, unknown>) => ({ id: 'e-1', ...row }));
  m.recordTransition.mockResolvedValue({ row: { id: 't-1' }, replayed: false });
  m.assertOfferAllowed.mockResolvedValue({ allowed: true });
});

describe('the registry set', () => {
  it('builds exactly the nine §7.2 keys', () => {
    expect(Object.keys(actions()).sort()).toEqual([...GROWTH_JOURNEY_ACTION_TYPES].sort());
    expect(GROWTH_JOURNEY_ACTION_TYPES).toHaveLength(9);
  });

  it('with the master off, every handler refuses with growth_journey_disabled and writes nothing', async () => {
    const off = actions(OFF);
    for (const type of GROWTH_JOURNEY_ACTION_TYPES) {
      expect(await off[type]({ type }, ctx())).toEqual({ ok: false, error: 'growth_journey_disabled' });
    }
    for (const fn of [m.enrollmentCreate, m.classifySubject, m.recordTransition, m.requestBrandReferral, m.leadContext, m.campaign, m.org]) expect(fn).not.toHaveBeenCalled();
  });
});

describe('assign_journey_program', () => {
  it('classifies, resolves the programme, creates the enrolment and records the transition', async () => {
    const r = await actions().assign_journey_program({ type: 'assign_journey_program' }, ctx());
    expect(r).toEqual({ ok: true, detail: { enrollment_id: 'e-1', program_slug: 'service-growth', classification_id: 'c-1' } });
    expect(m.classifySubject).toHaveBeenCalledWith({ anchor: { leadId: 501 }, trigger: 'lead_ingest', flags: ON });
    expect(m.programFindOne).toHaveBeenCalledWith({ where: { brand_id: 'b-af', slug: 'service-growth' } });
    expect(m.enrollmentCreate).toHaveBeenCalledWith(expect.objectContaining({ program_id: 'p-af', subject_ref: 'lead:501', source: 'routing_rule', status: 'active', metadata: { rule_id: 'rule-7', rule_version: 3, raw_payload_id: 'raw-9', classification_id: 'c-1' } }));
    expect(m.recordTransition).toHaveBeenCalledWith(expect.objectContaining({ type: 'program_assigned', requestedBy: 'routing_rule:raw-9' }));
  });

  it('twice for one subject → one enrolment; the second is ok with already_enrolled', async () => {
    const a = actions();
    await a.assign_journey_program({ type: 'assign_journey_program' }, ctx());
    m.enrollmentCreate.mockRejectedValueOnce(new UniqueError('dup'));
    m.enrollmentFindOne.mockResolvedValue({ id: 'e-1' });
    const r = await a.assign_journey_program({ type: 'assign_journey_program' }, ctx());
    expect(r).toEqual({ ok: true, detail: { enrollment_id: 'e-1', program_slug: 'service-growth', reason: 'already_enrolled' } });
    expect(m.recordTransition).toHaveBeenCalledTimes(1);
  });

  it('an explicit program_slug on the rule wins over the classification', async () => {
    m.programFindOne.mockResolvedValue({ ...PROGRAM, slug: 'learner' });
    const r = await actions().assign_journey_program({ type: 'assign_journey_program', program_slug: 'learner' }, ctx());
    expect(m.programFindOne).toHaveBeenCalledWith({ where: { brand_id: 'b-af', slug: 'learner' } });
    expect(r.ok).toBe(true);
  });

  it('falls back to the brand default when nothing names a programme', async () => {
    m.classifySubject.mockResolvedValue(classified({ journey_program: null }));
    m.resolveDefaultJourneyProgramId.mockResolvedValue('p-af');
    const r = await actions().assign_journey_program({ type: 'assign_journey_program' }, ctx());
    expect(m.resolveDefaultJourneyProgramId).toHaveBeenCalledWith({ sourceSlug: 'ai-flotation' });
    expect(r.ok).toBe(true);
  });

  it('honest refusals: unresolved context, no default, draft programme, unresolved subject', async () => {
    const a = actions();
    expect(await a.assign_journey_program({ type: 'x' }, ctx({ brand_id: null }))).toEqual({ ok: false, error: 'unresolved_context' });
    m.classifySubject.mockResolvedValue(classified({ journey_program: null }));
    m.resolveDefaultJourneyProgramId.mockResolvedValue(null);
    expect(await a.assign_journey_program({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'brand_has_no_default' });
    m.classifySubject.mockResolvedValue(classified());
    m.programFindOne.mockResolvedValue({ ...PROGRAM, status: 'draft' });
    expect(await a.assign_journey_program({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'program_not_active:service-growth' });
    m.classifySubject.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    expect(await a.assign_journey_program({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'subject_unresolved:anchor_not_found' });
    expect(m.enrollmentCreate).not.toHaveBeenCalled();
  });
});

describe('assign_service_path', () => {
  const enrollment = (over: Record<string, unknown> = {}) => {
    const e: Record<string, unknown> = { id: 'e-1', tenant_id: 't-af', program_id: 'p-af', path_id: null, enrollment_id: null, ...over };
    e.update = jest.fn(async (patch: Record<string, unknown>) => Object.assign(e, patch));
    return e;
  };

  it('assigns the classified family after the boundary check, writes path_id, records the transition', async () => {
    const e = enrollment();
    m.enrollmentFindOne.mockResolvedValue(e);
    m.pathFindOne.mockResolvedValue({ id: 'path-wa', offer_family: 'workflow_automation' });
    const r = await actions().assign_service_path({ type: 'assign_service_path' }, ctx());
    expect(r).toEqual({ ok: true, detail: { path_id: 'path-wa', offer_family: 'workflow_automation', changed_from: null } });
    expect(m.assertOfferAllowed).toHaveBeenCalledWith({ brandId: 'b-af', offerFamily: 'workflow_automation' });
    expect(e.update).toHaveBeenCalledWith({ path_id: 'path-wa' });
    expect(m.recordTransition).toHaveBeenCalledWith(expect.objectContaining({ type: 'path_assigned', to: { path_id: 'path-wa', offer_family: 'workflow_automation' } }));
  });

  it('AI Flotation + business_training on the rule: refused by policy, path_id untouched, no transition, a needs_review row', async () => {
    const e = enrollment();
    m.enrollmentFindOne.mockResolvedValue(e);
    m.assertOfferAllowed.mockRejectedValue(new OfferNotEligibleError({ allowed: false, reason: 'explicit_deny', brand_id: 'b-aif', offer_family: 'business_training', policy_id: 'pol-deny', approved_content_ready: false }));
    m.requestClassificationReview.mockResolvedValue({ status: 'requested', row: { id: 'c-review' }, replayed: false });
    const r = await actions().assign_service_path({ type: 'assign_service_path', offer_family: 'business_training' }, ctx());
    expect(r).toEqual({ ok: false, error: 'offer_not_eligible:explicit_deny' });
    expect(e.update).not.toHaveBeenCalled();
    expect(m.pathFindOne).not.toHaveBeenCalled();
    expect(m.recordTransition).not.toHaveBeenCalled();
    // The refusal is not silent: the subject's classification is put in front of a human, naming the family and why.
    expect(m.requestClassificationReview).toHaveBeenCalledWith({ classificationId: 'c-1', requestedBy: 'routing_rule:raw-9', reason: 'offer_not_eligible:business_training:explicit_deny' });
  });

  it('a refused path on a subject that cannot be classified still refuses, and asks for no review', async () => {
    const e = enrollment();
    m.enrollmentFindOne.mockResolvedValue(e);
    m.assertOfferAllowed.mockRejectedValue(new OfferNotEligibleError({ allowed: false, reason: 'explicit_deny', brand_id: 'b-aif', offer_family: 'business_training', policy_id: 'pol-deny', approved_content_ready: false }));
    m.classifySubject.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    const r = await actions().assign_service_path({ type: 'assign_service_path', offer_family: 'business_training' }, ctx());
    expect(r).toEqual({ ok: false, error: 'offer_not_eligible:explicit_deny' });
    expect(m.requestClassificationReview).not.toHaveBeenCalled();
    expect(e.update).not.toHaveBeenCalled();
  });

  it('a change of path records path_changed with the previous path', async () => {
    const e = enrollment({ path_id: 'path-old' });
    m.enrollmentFindOne.mockResolvedValue(e);
    m.pathFindOne.mockResolvedValue({ id: 'path-wa' });
    const r = await actions().assign_service_path({ type: 'assign_service_path' }, ctx());
    expect(r).toMatchObject({ ok: true, detail: { changed_from: 'path-old' } });
    expect(m.recordTransition).toHaveBeenCalledWith(expect.objectContaining({ type: 'path_changed', from: { path_id: 'path-old' } }));
  });

  it('already on the path → ok, already_on_path, no write', async () => {
    const e = enrollment({ path_id: 'path-wa' });
    m.enrollmentFindOne.mockResolvedValue(e);
    m.pathFindOne.mockResolvedValue({ id: 'path-wa' });
    const r = await actions().assign_service_path({ type: 'assign_service_path' }, ctx());
    expect(r).toMatchObject({ ok: true, detail: { reason: 'already_on_path' } });
    expect(e.update).not.toHaveBeenCalled();
  });

  it('honest refusals: no enrolment, no family named, path not defined for the programme', async () => {
    const a = actions();
    m.enrollmentFindOne.mockResolvedValue(null);
    expect(await a.assign_service_path({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'no_enrollment' });
    m.enrollmentFindOne.mockResolvedValue(enrollment());
    m.classifySubject.mockResolvedValue(classified({ primary_path: null }));
    expect(await a.assign_service_path({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'no_path_named' });
    m.classifySubject.mockResolvedValue(classified());
    m.pathFindOne.mockResolvedValue(null);
    expect(await a.assign_service_path({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'path_not_defined:workflow_automation' });
  });
});

describe('request_classification_review and the referral request', () => {
  it('review: delegates to the service with the rule as requester', async () => {
    m.requestClassificationReview.mockResolvedValue({ status: 'overridden', row: { id: 'c-2' }, replayed: false });
    const r = await actions().request_classification_review({ type: 'request_classification_review', reason: 'ops wants eyes' }, ctx());
    expect(r).toEqual({ ok: true, detail: { classification_id: 'c-2', replayed: false } });
    expect(m.requestClassificationReview).toHaveBeenCalledWith({ classificationId: 'c-1', requestedBy: 'routing_rule:raw-9', reason: 'ops wants eyes' });
  });

  it('referral: the denied family the ladder proposed a target for is what gets referred', async () => {
    m.classifySubject.mockResolvedValue(classified({ primary_path: null, referral_target_brand_id: 'b-ent', eligibility: { allowed: false, reason: 'explicit_deny', offer_family: 'business_training' } }));
    m.requestBrandReferral.mockResolvedValue({ ok: true, row: { id: 't-9' }, replayed: false, to_brand_id: 'b-ent', to_brand_slug: 'colaberry-enterprise' });
    const r = await actions().create_cross_brand_referral_request({ type: 'create_cross_brand_referral_request' }, ctx());
    expect(r).toEqual({ ok: true, detail: { transition_id: 't-9', to_brand_slug: 'colaberry-enterprise', replayed: false } });
    expect(m.requestBrandReferral).toHaveBeenCalledWith(expect.objectContaining({ fromBrandId: 'b-af', fromTenantId: 't-af', offerFamily: 'business_training', requestedBy: 'routing_rule:raw-9' }));
  });

  it('referral: no family to refer when the ladder proposed no target; an ambiguous target names the candidates', async () => {
    const a = actions();
    expect(await a.create_cross_brand_referral_request({ type: 'x' }, ctx())).toEqual({ ok: false, error: 'no_family_to_refer' });
    m.requestBrandReferral.mockResolvedValue({ ok: false, reason: 'ambiguous_target', candidates: [{ brand_id: 'b-cpn', brand_slug: 'cpn' }, { brand_id: 'b-tr', brand_slug: 'colaberry-training' }] });
    expect(await a.create_cross_brand_referral_request({ type: 'x', offer_family: 'learner_free_training' }, ctx())).toEqual({ ok: false, error: 'ambiguous_target:cpn,colaberry-training' });
  });
});

describe('recorded, not applied', () => {
  it('suppress_or_wait is deferred with its kind, reason and until', async () => {
    const r = await actions().suppress_or_wait({ type: 'suppress_or_wait', kind: 'wait', reason: 'cooling off', until: '2026-10-01' }, ctx());
    expect(r).toEqual({ ok: 'deferred', detail: { kind: 'wait', reason: 'cooling off', until: '2026-10-01' } });
  });

  for (const type of ['create_business_account', 'enter_governed_campaign', 'schedule_ai_qualification', 'create_handoff'] as const) {
    it(`${type} is deferred with what it WOULD have done, and touches nothing`, async () => {
      const r = await actions()[type]({ type, campaign_key: 'x', team: 'sales' }, ctx());
      expect(r).toEqual({ ok: 'deferred', detail: { would: type, payload: { campaign_key: 'x', team: 'sales' }, deferred_reason: 'phase2_no_execution' } });
      for (const fn of [m.enrollmentCreate, m.classifySubject, m.leadContext, m.campaign, m.org, m.recordTransition]) expect(fn).not.toHaveBeenCalled();
    });
  }
});
