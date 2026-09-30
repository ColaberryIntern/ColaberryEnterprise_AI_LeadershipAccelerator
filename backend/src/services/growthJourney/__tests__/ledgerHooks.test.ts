/**
 * T410 - the hooks: each hooked service emits exactly ONE ledger row per domain
 * write, asserted on the mocked `EventLedger.create` behind the REAL
 * `ledgerService` and adapter; a replay of the same write emits none; and a
 * ledger that throws never fails the write. The classification service runs
 * for real over a canned loaded input; the transition and outcome writers over
 * in-memory tables with their unique indexes.
 */

import type { ClassificationInput } from '../classification/types';

const ledgerCreate = jest.fn();
jest.mock('../../../models/EventLedger', () => ({ __esModule: true, default: { create: (...a: unknown[]) => ledgerCreate(...a) } }));

const uniqueError = () => Object.assign(new Error('duplicate key value violates unique constraint'), { name: 'SequelizeUniqueConstraintError' });
type Row = Record<string, unknown>;
const classifications: Row[] = [];
const transitions: Row[] = [];
const outcomes: Row[] = [];
function tableOf(rows: Row[], prefix: string, keyOf: (r: Row) => string) {
  return {
    create: async (row: Row) => {
      if (rows.some((r) => keyOf(r) === keyOf(row))) throw uniqueError();
      const stored = { id: `${prefix}-${rows.length + 1}`, ...row };
      rows.push(stored);
      return stored;
    },
    findOne: async ({ where }: { where: Row }) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
    findByPk: async (id: string) => rows.find((r) => r.id === id) ?? null,
  };
}
jest.mock('../../../models', () => ({
  GrowthJourneyClassification: tableOf(classifications, 'c', (r) => String(r.idempotency_key)),
  GrowthJourneyTransition: tableOf(transitions, 't', (r) => String(r.idempotency_key)),
  GrowthJourneyOutcome: tableOf(outcomes, 'o', (r) => `${r.source}/${r.source_ref}`),
}));
// The classification ladder's policy questions, answered from the Phase 2 fixtures; the loaded input canned.
jest.mock('../offerEligibility', () => {
  const { fixtureOptions } = jest.requireActual('./fixtures/phase2Fixtures');
  const o = fixtureOptions();
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: unknown) { super('Offer not eligible'); this.name = 'OfferNotEligibleError'; }
  }
  return {
    OfferNotEligibleError,
    resolveOfferEligibility: ({ brandId, offerFamily }: { brandId: string; offerFamily: string }) => o.eligibility(brandId, offerFamily),
    assertOfferAllowed: async ({ brandId, offerFamily }: { brandId: string; offerFamily: string }) => {
      const d = await o.eligibility(brandId, offerFamily);
      if (!d.allowed) throw new OfferNotEligibleError(d);
      return d;
    },
    allowedOfferFamilies: (brandId: string) => o.allowedFamilies(brandId),
    brandsAllowingFamily: (family: string) => o.allowingBrands(family),
  };
});
const loadClassificationInput = jest.fn();
jest.mock('../classification/inputs', () => ({ ...jest.requireActual('../classification/inputs'), loadClassificationInput: (...a: unknown[]) => loadClassificationInput(...a) }));

import { classifySubject, overrideClassification, requestClassificationReview } from '../classificationService';
import { recordTransition } from '../transitionService';
import { recordOutcome } from '../outcomes/outcomeRecorder';
import { brandBySlug, formFor, inputFor } from './fixtures/phase2Fixtures';

const FLAGS = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false };
const brand = brandBySlug('colaberry-enterprise');
const loaded = (input: ClassificationInput) => ({
  status: 'loaded', input, brand, unavailable: [],
  subject: { lead_id: 501, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: 'lead@example.com', brand_relationships: [], customer: { paid: false, basis: 'none' } },
});
const events = () => ledgerCreate.mock.calls.map((c) => (c[0] as Row).event_type);
const rowFor = (event: string) => ledgerCreate.mock.calls.map((c) => c[0] as Row).find((r) => r.event_type === event) as Row;
const warned = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  classifications.length = 0; transitions.length = 0; outcomes.length = 0;
  ledgerCreate.mockReset().mockResolvedValue({ id: 'ev' });
  loadClassificationInput.mockReset().mockResolvedValue(loaded(inputFor(brand, { subject_ref: 'lead:501', form: formFor('request_demo_form') })));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('classification', () => {
  it('classifySubject: one growth_journey.classification.recorded row per row written, scoped, ids and literals only - and a replay writes none', async () => {
    const first = await classifySubject({ anchor: { leadId: 501 }, trigger: 'form', flags: FLAGS });
    expect(first.status).toBe('classified');
    expect(classifications).toHaveLength(1);
    expect(events()).toEqual(['growth_journey.classification.recorded']);
    expect(rowFor('growth_journey.classification.recorded')).toMatchObject({
      actor: 'growth_journey', entity_type: 'growth_journey_classification', entity_id: 'c-1', tenant_id: brand.tenant_id, brand_id: brand.brand_id,
      payload: { subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, trigger: 'form', primary_path: 'business_training', source_step: 3, status: 'proposed', requires_human_review: false, ai_involved: false },
    });
    expect(JSON.stringify(ledgerCreate.mock.calls)).not.toContain('@');
    expect(rowFor('growth_journey.classification.recorded').payload).not.toHaveProperty('evidence');
    const again = await classifySubject({ anchor: { leadId: 501 }, trigger: 'form', flags: FLAGS });
    expect(again).toMatchObject({ status: 'classified', replayed: true });
    expect(classifications).toHaveLength(1);
    expect(events()).toEqual(['growth_journey.classification.recorded']);
  });

  it('overrideClassification: one .overridden row with the human as actor; requestClassificationReview: one .review_requested row with the requester as actor; each replay none', async () => {
    await classifySubject({ anchor: { leadId: 501 }, trigger: 'form', flags: FLAGS });
    ledgerCreate.mockClear();
    const over = await overrideClassification({ classificationId: 'c-1', admin: { id: 'staff-1' }, patch: { primary_path: 'workflow_automation' }, lock: true, reason: 'they asked for automation on the call' });
    expect(over.status).toBe('overridden');
    expect(events()).toEqual(['growth_journey.classification.overridden']);
    expect(rowFor('growth_journey.classification.overridden')).toMatchObject({ actor: 'human:staff-1', entity_id: 'c-2', payload: { override_of: 'c-1', primary_path: 'workflow_automation', status: 'confirmed', locked: true, lead_id: 501 } });
    expect(rowFor('growth_journey.classification.overridden').payload).not.toHaveProperty('reason');
    await overrideClassification({ classificationId: 'c-1', admin: { id: 'staff-1' }, patch: { primary_path: 'workflow_automation' }, lock: true, reason: 'they asked for automation on the call' });
    expect(events()).toEqual(['growth_journey.classification.overridden']);

    ledgerCreate.mockClear();
    const review = await requestClassificationReview({ classificationId: 'c-2', requestedBy: 'routing_rule:rr-9', reason: 'reply mentions a different company' });
    expect(review.status).toBe('overridden');
    expect(events()).toEqual(['growth_journey.classification.review_requested']);
    expect(rowFor('growth_journey.classification.review_requested')).toMatchObject({ actor: 'routing_rule:rr-9', entity_id: 'c-3', payload: { override_of: 'c-2', requested_by: 'routing_rule:rr-9', lead_id: 501 } });
    await requestClassificationReview({ classificationId: 'c-2', requestedBy: 'routing_rule:rr-9', reason: 'reply mentions a different company' });
    expect(events()).toEqual(['growth_journey.classification.review_requested']);
  });
});

describe('transitions and outcomes', () => {
  const transition = () => recordTransition({
    tenantId: 't-col', brandId: 'b-ent', programId: 'p-ent', subjectRef: 'lead:501', leadId: 501, enrollmentId: null,
    type: 'state_changed', from: { state: 'NEW_BUSINESS_LEAD' }, to: { state: 'PROBLEM_IDENTIFIED' }, reason: 'lifecycle:projected', requestedBy: 'growth_journey:lifecycle',
  });

  it('recordTransition: one growth_journey.transition.recorded row with the from/to literals; the same transition replayed writes none', async () => {
    const first = await transition();
    expect(first.replayed).toBe(false);
    expect(events()).toEqual(['growth_journey.transition.recorded']);
    expect(rowFor('growth_journey.transition.recorded')).toMatchObject({
      actor: 'growth_journey', entity_type: 'growth_journey_transition', entity_id: 't-1', tenant_id: 't-col', brand_id: 'b-ent',
      payload: { subject_ref: 'lead:501', lead_id: 501, transition_type: 'state_changed', from_value: { state: 'NEW_BUSINESS_LEAD' }, to_value: { state: 'PROBLEM_IDENTIFIED' }, requested_by: 'growth_journey:lifecycle' },
    });
    expect((await transition()).replayed).toBe(true);
    expect(events()).toEqual(['growth_journey.transition.recorded']);
  });

  const outcome = () => recordOutcome({ tenant_id: 't-col', brand_id: 'b-ent', subject_ref: 'lead:501', lead_id: 501, outcome_type: 'reply', source: 'interaction_outcomes', source_ref: '77', occurred_at: new Date('2026-09-10T00:00:00Z'), metadata: { channel: 'email' } });

  it('recordOutcome: one growth_journey.outcome.recorded row per fact indexed - the metadata stays on the row - and a replay writes none', async () => {
    const first = await outcome();
    expect(first.replayed).toBe(false);
    expect(events()).toEqual(['growth_journey.outcome.recorded']);
    expect(rowFor('growth_journey.outcome.recorded')).toMatchObject({
      actor: 'growth_journey', entity_type: 'growth_journey_outcome', entity_id: 'o-1', tenant_id: 't-col', brand_id: 'b-ent',
      payload: { subject_ref: 'lead:501', lead_id: 501, outcome_type: 'reply', source: 'interaction_outcomes', source_ref: '77', occurred_at: new Date('2026-09-10T00:00:00Z') },
    });
    expect(rowFor('growth_journey.outcome.recorded').payload).not.toHaveProperty('metadata');
    expect((await outcome()).replayed).toBe(true);
    expect(events()).toEqual(['growth_journey.outcome.recorded']);
  });
});

describe('a ledger that throws', () => {
  it('never fails the domain write: the classification, the override, the transition and the outcome all land; one redacted warning each with the class', async () => {
    ledgerCreate.mockRejectedValue(Object.assign(new Error('ledger down'), { name: 'SequelizeConnectionError' }));
    expect((await classifySubject({ anchor: { leadId: 501 }, trigger: 'form', flags: FLAGS })).status).toBe('classified');
    expect((await overrideClassification({ classificationId: 'c-1', admin: { id: 'staff-1' }, patch: { primary_path: 'workflow_automation' }, lock: false, reason: 'asked for automation' })).status).toBe('overridden');
    expect((await recordTransition({ tenantId: 't-col', brandId: 'b-ent', programId: 'p-ent', subjectRef: 'lead:501', leadId: 501, enrollmentId: null, type: 'state_changed', from: null, to: { state: 'X' }, reason: 'r', requestedBy: 'q' })).replayed).toBe(false);
    expect((await recordOutcome({ tenant_id: 't-col', brand_id: 'b-ent', subject_ref: 'lead:501', lead_id: 501, outcome_type: 'declined', source: 'interaction_outcomes', source_ref: '78', occurred_at: new Date() })).replayed).toBe(false);
    expect(classifications).toHaveLength(2);
    expect(transitions).toHaveLength(1);
    expect(outcomes).toHaveLength(1);
    expect(ledgerCreate).toHaveBeenCalledTimes(4);
    const failures = warned().filter((l) => l.includes('growth_journey.ledger.write_failed'));
    expect(failures).toHaveLength(4);
    expect(failures.map((l) => JSON.parse(l).event_type)).toEqual(['growth_journey.classification.recorded', 'growth_journey.classification.overridden', 'growth_journey.transition.recorded', 'growth_journey.outcome.recorded']);
    expect(JSON.stringify(failures)).not.toContain('@');
  });
});
