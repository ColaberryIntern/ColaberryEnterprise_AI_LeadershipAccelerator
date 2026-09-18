jest.mock('../../../models/EventLedger', () => ({ __esModule: true, default: { create: (...a: unknown[]) => require('./fixtures/phase3Harness').m.ledgerCreate(...a) } }));
jest.mock('../../../models', () => require('./fixtures/phase3Harness').modelsMock);
jest.mock('../../../models/BrandOfferPolicy', () => require('./fixtures/phase3Harness').policyModelMock);
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveSubject(...a) }));
jest.mock('../governor/contactEvidence', () => ({
  ...jest.requireActual('../governor/contactEvidence'),
  resolveContactEvidence: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveContactEvidence(...a),
}));
jest.mock('../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLifecycleSourceCounts(...a) }));
jest.mock('../strategies/learnerFacts', () => ({ loadLearnerFacts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLearnerFacts(...a) }));
jest.mock('../profileService', () => ({ upsertProfile: (...a: unknown[]) => require('./fixtures/phase3Harness').m.upsertProfile(...a) }));
jest.mock('../classificationService', () => ({
  ...jest.requireActual('../classificationService'),
  latestClassification: (...a: unknown[]) => require('./fixtures/phase3Harness').m.classificationFindOne(...a),
}));

import { decideForSubjectAndRecord } from '../decisionService';
import { AS_OF, anchorOf, arrange, flags, m, persisted } from './fixtures/phase3Harness';
import { brandRow } from './fixtures/phase3Fixtures';
import { allFixtures } from './fixtures/phase3Scenarios';

/**
 * T410 at decision level - the real pipeline over a Phase 3 fixture with the
 * ledger's `EventLedger.create` mocked: one `growth_journey.decision.recorded`
 * row per decision persisted, the summary and never the candidate blob; a
 * replay of the same decision writes none; a ledger that throws leaves the
 * decision recorded.
 */

const fx = allFixtures().find((f) => f.brand === 'colaberry-enterprise' && f.key.includes('EXPLORING'))
  ?? allFixtures().find((f) => f.brand === 'colaberry-enterprise')!;
const rows = () => m.ledgerCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  arrange(fx);
  m.ledgerCreate.mockResolvedValue({ id: 'ev-1' });
});

it('decideForSubjectAndRecord: exactly one decision.recorded ledger row per decision persisted - the summary, scoped, never candidates or scores - and a replay writes none', async () => {
  const r = await decideForSubjectAndRecord({ anchor: anchorOf(fx), brandId: brandRow(fx.brand).id, trigger: 'nightly', flags: flags(), asOf: AS_OF });
  expect(r.status).toBe('recorded');
  expect(persisted.size).toBe(1);
  const decision = [...persisted.values()][0];
  expect(rows().map((x) => x.event_type)).toEqual(['growth_journey.decision.recorded']);
  expect(rows()[0]).toMatchObject({
    actor: decision.decided_by, entity_type: 'growth_journey_decision', entity_id: decision.id, tenant_id: decision.tenant_id, brand_id: decision.brand_id,
    payload: { subject_ref: decision.subject_ref, lead_id: decision.lead_id, program_id: decision.program_id, trigger: 'nightly', decision_date: decision.decision_date, mode: decision.mode, selected_action: decision.selected_action, state_at_decision: decision.state_at_decision, executed: false },
  });
  for (const k of ['candidates', 'suppressed', 'deferred_actions', 'scores', 'contact_evidence', 'selected_content', 'eligibility']) expect(rows()[0].payload).not.toHaveProperty(k);
  expect(JSON.stringify(rows())).not.toContain('@');

  const again = await decideForSubjectAndRecord({ anchor: anchorOf(fx), brandId: brandRow(fx.brand).id, trigger: 'nightly', flags: flags(), asOf: AS_OF });
  expect(again).toMatchObject({ status: 'recorded', replayed: true });
  expect(persisted.size).toBe(1);
  expect(rows()).toHaveLength(1);
});

it('a ledger that throws never fails the decision: the row is persisted, the status is recorded, one redacted warning carries the class', async () => {
  m.ledgerCreate.mockRejectedValue(Object.assign(new Error('ledger down'), { name: 'SequelizeConnectionError' }));
  const r = await decideForSubjectAndRecord({ anchor: anchorOf(fx), brandId: brandRow(fx.brand).id, trigger: 'nightly', flags: flags(), asOf: AS_OF });
  expect(r).toMatchObject({ status: 'recorded', replayed: false });
  expect(persisted.size).toBe(1);
  const warned = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).filter((l) => l.includes('growth_journey.ledger.write_failed'));
  expect(warned).toHaveLength(1);
  expect(JSON.parse(warned[0])).toMatchObject({ event_type: 'growth_journey.decision.recorded', entity_type: 'growth_journey_decision', error_class: expect.any(String) });
});
