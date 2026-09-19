import * as fs from 'fs';
import * as path from 'path';
import { Op } from 'sequelize';

const m = {
  brandFindByPk: jest.fn(),
  programFindOne: jest.fn(),
  leadFindByPk: jest.fn(),
  profileFindOne: jest.fn(),
  explorerProfileFindByPk: jest.fn(),
  handoffFindOne: jest.fn(),
  resolveSubject: jest.fn(),
  latestClassification: jest.fn(),
  resolveContactEvidence: jest.fn(),
  loadLifecycleSourceCounts: jest.fn(),
  loadLearnerFacts: jest.fn(),
};

jest.mock('../../../../models', () => ({
  Brand: { findByPk: (...a: unknown[]) => m.brandFindByPk(...a) },
  JourneyProgram: { findOne: (...a: unknown[]) => m.programFindOne(...a) },
  Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
  GrowthJourneyProfile: { findOne: (...a: unknown[]) => m.profileFindOne(...a) },
  ExplorerJourneyProfile: { findByPk: (...a: unknown[]) => m.explorerProfileFindByPk(...a) },
  GrowthJourneyHandoff: { findOne: (...a: unknown[]) => m.handoffFindOne(...a) },
}));
jest.mock('../../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => m.resolveSubject(...a) }));
jest.mock('../../classificationService', () => ({ latestClassification: (...a: unknown[]) => m.latestClassification(...a) }));
jest.mock('../../governor/contactEvidence', () => ({
  resolveContactEvidence: (...a: unknown[]) => m.resolveContactEvidence(...a),
  tierZeroStopsFromContact: () => ({ unsubscribed: false, dnc: false, consentRevoked: false }),
}));
jest.mock('../lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => m.loadLifecycleSourceCounts(...a) }));
jest.mock('../../strategies/learnerFacts', () => ({ loadLearnerFacts: (...a: unknown[]) => m.loadLearnerFacts(...a) }));

import { loadDecisionContext, NO_LEARNER_PROFILE_STATE } from '../loadDecisionContext';
import { businessStrategy } from '../../strategies/businessCandidates';
import { flotationStrategy } from '../../strategies/aiFlotationCandidates';
import { learnerStrategy } from '../../strategies/learnerStrategy';
import { evaluateFreshness } from '../../../explorerGrowth/governor/freshness';
import { contact } from '../../__tests__/fixtures/learnerFixtures';

/**
 * T311 — the read-only context loader.
 *
 * The lifecycles are REAL here (T307's and T308's classifiers run over the
 * loaded counts), the models and the other loaders are mocked. What is pinned:
 * the programme picks the strategy and the lifecycle; the previous projection
 * feeds the lifecycle; a failing lookup is named and the context is still
 * built; and the freshness pair follows the rule per subject kind.
 */

const AS_OF = new Date('2026-09-15T12:00:00Z');
const LEAD_CREATED = new Date('2026-08-01T00:00:00Z');

const subject = (over: Record<string, unknown> = {}) => ({
  status: 'resolved',
  subject: { lead_id: 501, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: 'x@example.com', brand_relationships: [], customer: { paid: false, basis: 'none' }, ...over },
});

const NONE = { inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0, no_response: 0 }, appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 }, hasDeliveryEngagement: false };

function arrange(over: Partial<Record<keyof typeof m, unknown>> = {}) {
  for (const fn of Object.values(m)) fn.mockReset();
  m.resolveSubject.mockResolvedValue(subject());
  m.brandFindByPk.mockResolvedValue({ id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: 't-col' });
  m.programFindOne.mockResolvedValue({ id: 'p-ent', slug: 'business-growth', kind: 'business', status: 'draft' });
  m.leadFindByPk.mockResolvedValue({ id: 501, email: 'x@example.com', phone: null, idea_input: 'automate invoicing', selected_systems: ['salesforce'], pipeline_stage: null, industry: 'logistics', created_at: LEAD_CREATED });
  m.profileFindOne.mockResolvedValue(null);
  m.explorerProfileFindByPk.mockResolvedValue(null);
  m.handoffFindOne.mockResolvedValue(null);
  m.latestClassification.mockResolvedValue({ id: 'c-1', brand_relationship: 'colaberry-enterprise', primary_path: 'workflow_automation', secondary_paths: [], intent: 'automation_request', requires_human_review: false, source_step: 3 });
  m.resolveContactEvidence.mockResolvedValue(contact());
  m.loadLifecycleSourceCounts.mockResolvedValue(NONE);
  m.loadLearnerFacts.mockResolvedValue({ status: 'no_learner_profile', reason: 'not_a_learner' });
  for (const [k, v] of Object.entries(over)) {
    const fn = m[k as keyof typeof m];
    if (typeof v === 'function') fn.mockImplementation(v as never);
    else fn.mockResolvedValue(v);
  }
  jest.spyOn(console, 'error').mockImplementation(() => {});
}
afterEach(() => jest.restoreAllMocks());

const load = (brandId = 'b-ent') => loadDecisionContext({ anchor: { leadId: 501 }, brandId, asOf: AS_OF });

describe('resolution', () => {
  it('an unresolved subject, a missing brand, a brand with no programme - each its own answer, none a context', async () => {
    arrange({ resolveSubject: { status: 'unresolved', reason: 'no_such_lead' } });
    expect(await load()).toEqual({ status: 'unresolved', reason: 'no_such_lead' });
    arrange({ brandFindByPk: null });
    expect(await load()).toEqual({ status: 'no_brand', brandId: 'b-ent' });
    arrange({ programFindOne: null });
    expect(await load()).toEqual({ status: 'no_program', brandId: 'b-ent' });
  });
});

describe('a business subject', () => {
  it('runs T307\'s lifecycle over the loaded signals and picks the business strategy', async () => {
    arrange();
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    // idea + a path: EXPLORING_SOLUTIONS, never replied: NO_RESPONSE - T307's real answer.
    expect(r.ctx.state).toBe('EXPLORING_SOLUTIONS');
    expect(r.ctx.overlays).toEqual(['NO_RESPONSE']);
    expect(r.lifecycle.projected).toBe(true);
    expect(r.strategy).toBe(businessStrategy);
    expect(r.ctx.program_kind).toBe('business');
    expect(r.ctx.classification?.classification_id).toBe('c-1');
    expect(r.ctx.subject_ref).toBe('lead:501');
    expect(r.ctx.scores.dimensions.length).toBeGreaterThan(0);
    expect(r.ctx.learner).toBeNull();
  });

  it('feeds the previous projection into the lifecycle, so knowledge is never stepped down', async () => {
    arrange({ profileFindOne: { state: 'QUALIFIED_OPPORTUNITY', state_entered_at: new Date('2026-09-01T00:00:00Z'), created_at: new Date('2026-08-15T00:00:00Z') } });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.state).toBe('QUALIFIED_OPPORTUNITY'); // held: the evidence today is weaker
    expect(r.previousProfile.state).toBe('QUALIFIED_OPPORTUNITY');
  });

  it('counts a reply into the lifecycle - the buyer engaged', async () => {
    arrange({ loadLifecycleSourceCounts: { ...NONE, inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 } } });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.state).toBe('QUALIFIED_OPPORTUNITY');
    expect(r.ctx.overlays).not.toContain('NO_RESPONSE');
  });

  it('T407: a PAID enrolment is a customer and the lifecycle reaches CUSTOMER without a pipeline stage; a guest, unpaid enrolment is not', async () => {
    arrange({ resolveSubject: subject({ enrollment_id: 'enr-9', customer: { paid: true, basis: 'payment_status' } }) });
    const paid = await load();
    if (paid.status !== 'loaded') throw new Error(paid.status);
    expect(paid.ctx.state).toBe('CUSTOMER');
    expect(paid.ctx.enrollment_id).toBe('enr-9');
    expect(paid.lifecycle.evidence).toContain('enrolment or payment exists');
    // The same subject with the same enrolment id, unpaid (every AI Flotation submit mints a guest one): not a customer.
    arrange({ resolveSubject: subject({ enrollment_id: 'enr-9', customer: { paid: false, basis: 'none' } }) });
    const guest = await load();
    if (guest.status !== 'loaded') throw new Error(guest.status);
    expect(guest.ctx.state).not.toBe('CUSTOMER');
    expect(guest.ctx.enrollment_id).toBe('enr-9');
    // An active subscription is the other basis.
    arrange({ resolveSubject: subject({ enrollment_id: 'enr-9', customer: { paid: true, basis: 'subscription' } }) });
    const subscribed = await load();
    if (subscribed.status !== 'loaded') throw new Error(subscribed.status);
    expect(subscribed.ctx.state).toBe('CUSTOMER');
  });

  it('T407: the counted rows reach the scorer as a measurement - zero counts score 0 - and the title scores authority', async () => {
    arrange({ leadFindByPk: { id: 501, email: 'x@example.com', phone: null, title: 'VP Engineering', idea_input: 'automate invoicing', selected_systems: ['salesforce'], pipeline_stage: null, industry: 'logistics', created_at: LEAD_CREATED } });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    const dim = (k: string) => r.ctx.scores.dimensions.find((d) => d.key === k);
    expect(dim('relationship_engagement')?.value).toBe(0);
    expect(dim('friction_risk')?.value).toBe(0);
    expect(dim('authority_stakeholder_readiness')?.value).toBe(80);
    expect(r.ctx.scores.gaps.some((g) => g.startsWith('relationship_engagement') || g.startsWith('friction_risk') || g.startsWith('authority'))).toBe(false);
    arrange({ loadLifecycleSourceCounts: { ...NONE, inbound: { ...NONE.inbound, replied: 2, no_response: 1 } } });
    const counted = await load();
    if (counted.status !== 'loaded') throw new Error(counted.status);
    expect(counted.ctx.scores.dimensions.find((d) => d.key === 'relationship_engagement')?.value).toBe(50);
    expect(counted.ctx.scores.dimensions.find((d) => d.key === 'friction_risk')?.value).toBe(15);
  });

  it('T407: with no lead there is nothing to count for, and the counted dimensions are a named gap, never 0', async () => {
    arrange({ resolveSubject: subject({ lead_id: null, enrollment_id: 'enr-9', email_normalized: null }), programFindOne: { id: 'p-ent', slug: 'business-growth', kind: 'business', status: 'draft' } });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.scores.gaps).toEqual(expect.arrayContaining(['relationship_engagement:counts_unavailable', 'friction_risk:counts_unavailable']));
    expect(r.ctx.scores.dimensions.find((d) => d.key === 'relationship_engagement')?.value).toBeNull();
  });

  it('hands the contact resolver the tenant from the brand, the subject\'s own address, and (T403) the programme kind its queue follows from', async () => {
    arrange();
    await load();
    expect(m.resolveContactEvidence).toHaveBeenCalledWith({ subject: { lead_id: 501, email: 'x@example.com', phone: null }, brandId: 'b-ent', tenantId: 't-col', asOf: AS_OF, programKind: 'business' });
  });
});

describe('an AI Flotation subject', () => {
  it('runs T308\'s lifecycle, with the delivery engagement, and picks the Flotation strategy', async () => {
    arrange({
      brandFindByPk: { id: 'b-flot', slug: 'ai-flotation', tenant_id: 't-flot' },
      programFindOne: { id: 'p-flot', slug: 'service-growth', kind: 'consulting', status: 'draft' },
      loadLifecycleSourceCounts: { ...NONE, hasDeliveryEngagement: true },
    });
    const r = await load('b-flot');
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.strategy).toBe(flotationStrategy);
    expect(r.ctx.state).toBe('PROJECT_STARTED');
    expect(r.lifecycle.projected).toBe(true);
  });
});

describe('a learner subject', () => {
  const learnerBrand = {
    brandFindByPk: { id: 'b-trn', slug: 'colaberry-training', tenant_id: 't-col' },
    programFindOne: { id: 'p-trn', slug: 'learner', kind: 'learner', status: 'draft' },
  };
  const facts = {
    status: 'learner',
    facts: { enrollment_id: 'enr-1', primary_state: 'ACTIVATING', overlays: ['DORMANT'], scores: { e: 10, i: 0, f: 0 }, affinities: [], readout: {}, state_entered_at: new Date('2026-08-20T00:00:00Z') },
  };

  it('with an Explorer profile: Explorer\'s state is read, nothing is projected, freshness is Explorer\'s own pair', async () => {
    arrange({
      ...learnerBrand,
      resolveSubject: subject({ enrollment_id: 'enr-1' }),
      loadLearnerFacts: facts,
      explorerProfileFindByPk: { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date('2026-09-15T06:00:00Z') },
    });
    const r = await load('b-trn');
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.strategy).toBe(learnerStrategy);
    expect(r.ctx.state).toBe('ACTIVATING');
    expect(r.ctx.overlays).toEqual(['DORMANT']);
    expect(r.lifecycle.projected).toBe(false);
    expect(r.ctx.learner?.primary_state).toBe('ACTIVATING');
    expect(m.explorerProfileFindByPk).toHaveBeenCalledWith('enr-1', { attributes: ['created_at', 'scores_computed_at'] });
    expect(evaluateFreshness(r.ctx.freshness, AS_OF)).toEqual({ fresh: true });
  });

  it('without one: the declared absence as the state, and freshness grounded in when the lead was first seen', async () => {
    arrange({ ...learnerBrand, brandFindByPk: { id: 'b-cpn', slug: 'cpn', tenant_id: 't-cpn' } });
    const r = await load('b-cpn');
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.state).toBe(NO_LEARNER_PROFILE_STATE);
    expect(r.ctx.learner).toBeNull();
    expect(r.lifecycle.projected).toBe(false);
    expect(r.ctx.freshness).toEqual({ created_at: LEAD_CREATED, scores_computed_at: AS_OF });
    expect(evaluateFreshness(r.ctx.freshness, AS_OF)).toEqual({ fresh: true });
    expect(m.explorerProfileFindByPk).not.toHaveBeenCalled();
  });
});

describe('freshness for a non-Explorer subject', () => {
  it('a projection that already exists: its own created_at, scored now', async () => {
    const created = new Date('2026-08-15T00:00:00Z');
    arrange({ profileFindOne: { state: 'PROBLEM_IDENTIFIED', state_entered_at: created, created_at: created } });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.freshness).toEqual({ created_at: created, scores_computed_at: AS_OF });
  });

  it('no projection and no lead row: both null, and the gate names it missing_timestamps rather than deciding', async () => {
    arrange({ leadFindByPk: null });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.freshness).toEqual({ created_at: null, scores_computed_at: null });
    expect(evaluateFreshness(r.ctx.freshness, AS_OF)).toEqual({ fresh: false, reason: 'missing_timestamps' });
  });
});

describe('a failing lookup is named, and the context is still built', () => {
  it('the classification throws: null on the context, "classification" in unavailable, the lifecycle still runs', async () => {
    arrange({ latestClassification: () => Promise.reject(new Error('db down')) });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.unavailable).toEqual(['classification']);
    expect(r.ctx.classification).toBeNull();
    expect(r.ctx.state).toBe('EXPLORING_SOLUTIONS'); // the systems named still evidence it
  });

  it('the lead throws: every lead-derived signal is absent, the scores say so, and the freshness has no first-seen', async () => {
    arrange({ leadFindByPk: () => Promise.reject(new Error('db down')) });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.unavailable).toEqual(['lead']);
    // Every LEAD-derived dimension is a gap; the counted ones are keyed on the lead id and were read, so they measure (T407).
    for (const k of ['fit', 'intent', 'urgency', 'authority_stakeholder_readiness']) expect(r.ctx.scores.dimensions.find((d) => d.key === k)?.value).toBeNull();
    expect(r.ctx.scores.dimensions.find((d) => d.key === 'relationship_engagement')?.value).toBe(0);
    expect(r.ctx.scores.summary).toBeNull();
    expect(r.ctx.freshness.created_at).toBeNull();
  });

  it('the counts throw: the lifecycle runs on zero counts, and says so; the counted dimensions are a gap, not 0 (T407)', async () => {
    arrange({ loadLifecycleSourceCounts: () => Promise.reject(new Error('db down')) });
    const r = await load();
    if (r.status === 'loaded') expect(r.ctx.scores.gaps).toContain('relationship_engagement:counts_unavailable');
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.unavailable).toEqual(['lifecycle_sources']);
    expect(r.ctx.state).toBe('EXPLORING_SOLUTIONS');
  });
});

describe('the builder\'s tier-0 flags', () => {
  it('are all false: the gate is checked before the loader, and a draft programme does not stop a shadow decision', async () => {
    arrange();
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.hardStop).toEqual({ converted: false, unsubscribed: false, dnc: false, consentRevoked: false, killSwitch: false, campaignInactive: false });
    expect(r.ctx.program_status).toBe('draft');
  });
});

describe("T405 - the human's cooldown as an overlay", () => {
  const DAY = 86_400_000;
  const returned = (until: Date) => ({ id: 'h-1', return_to_ai: { program_slug: 'business-growth', cooldown_until: until.toISOString(), reason: 'not_ready:q1' } });

  it("an open returned_to_ai row puts RETURNED_TO_AI on the context on top of the lifecycle's overlays - and NOT on the lifecycle projection the profile row is written from", async () => {
    const until = new Date(AS_OF.getTime() + 10 * DAY);
    arrange({ handoffFindOne: returned(until) });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.ctx.overlays).toEqual(['NO_RESPONSE', 'RETURNED_TO_AI']);
    expect(r.lifecycle.overlays).toEqual(['NO_RESPONSE']);
    expect(r.returnToAi).toEqual({ active: true, handoff_id: 'h-1', cooldown_until: until, reason: 'not_ready:q1' });
    expect(r.unavailable).toEqual([]);
    // T502: any row carrying the record (a qualified one is `dispositioned`), found by the subject ref or the lead.
    expect(m.handoffFindOne).toHaveBeenCalledWith({ where: { brand_id: 'b-ent', return_to_ai: { [Op.ne]: null }, [Op.or]: [{ subject_ref: 'lead:501' }, { lead_id: 501 }] }, order: [['updated_at', 'DESC']] });
  });

  it('past cooldown_until the overlay is gone; with no returned row there never was one', async () => {
    arrange({ handoffFindOne: returned(new Date(AS_OF.getTime() - DAY)) });
    const expired = await load();
    if (expired.status !== 'loaded') throw new Error(expired.status);
    expect(expired.ctx.overlays).toEqual(['NO_RESPONSE']);
    expect(expired.returnToAi.active).toBe(false);
    arrange();
    const none = await load();
    if (none.status !== 'loaded') throw new Error(none.status);
    expect(none.ctx.overlays).toEqual(['NO_RESPONSE']);
    expect(none.returnToAi).toEqual({ active: false, handoff_id: null, cooldown_until: null, reason: null });
  });

  it('a failing lookup is named return_to_ai in unavailable and the context is still built, without the overlay', async () => {
    arrange({ handoffFindOne: () => Promise.reject(new Error('db down')) });
    const r = await load();
    if (r.status !== 'loaded') throw new Error(r.status);
    expect(r.unavailable).toEqual(['return_to_ai']);
    expect(r.ctx.overlays).toEqual(['NO_RESPONSE']);
    expect(r.returnToAi.active).toBe(false);
  });
});

describe('read-only by contract', () => {
  it('the loader and the counts loader contain no write, and the scan reads the real files', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const f of ['loadDecisionContext.ts', 'lifecycleInputs.ts']) {
      const code = strip(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
      for (const banned of ['.create(', '.update(', '.upsert(', '.destroy(', 'bulkCreate', 'upsertProfile', 'recordTransition']) {
        expect({ f, banned, present: code.includes(banned) }).toEqual({ f, banned, present: false });
      }
      expect(code.length).toBeGreaterThan(500);
    }
  });
});
