import { Op } from 'sequelize';

/**
 * T409 - the two reads behind the rates: one brand, the window on the handoffs'
 * creation and the outcomes' occurrence, only the columns the row views
 * declare, and the pure computation fed exactly what came back.
 */

const handoffFindAll = jest.fn();
const outcomeFindAll = jest.fn();
jest.mock('../../../../models', () => ({
  GrowthJourneyHandoff: { findAll: (...a: unknown[]) => handoffFindAll(...a) },
  GrowthJourneyOutcome: { findAll: (...a: unknown[]) => outcomeFindAll(...a) },
}));

import { DEFAULT_RATES_WINDOW_DAYS, loadHandoffRates } from '../handoffRatesQuery';

const AS_OF = new Date('2026-09-17T04:20:00Z');
const D = (s: string) => new Date(s);

beforeEach(() => {
  handoffFindAll.mockReset().mockResolvedValue([]);
  outcomeFindAll.mockReset().mockResolvedValue([]);
});

it('reads the brand\'s handoffs created in [asOf - window, asOf) and its outcomes occurring in the same span, only the declared columns, in parallel', async () => {
  await loadHandoffRates({ brandId: 'b-ent', asOf: AS_OF, windowDays: 7 });
  const from = D('2026-09-10T04:20:00Z');
  expect(handoffFindAll).toHaveBeenCalledWith({
    where: { brand_id: 'b-ent', created_at: { [Op.gte]: from, [Op.lt]: AS_OF } },
    attributes: ['id', 'owner_queue', 'status', 'disposition', 'subject_ref', 'created_at', 'accepted_at', 'disposition_at'],
  });
  expect(outcomeFindAll).toHaveBeenCalledWith({
    where: { brand_id: 'b-ent', occurred_at: { [Op.gte]: from, [Op.lte]: AS_OF } },
    attributes: ['subject_ref', 'handoff_id', 'outcome_type', 'occurred_at', 'metadata'],
  });
  expect(DEFAULT_RATES_WINDOW_DAYS).toBe(30);
});

it('hands the rows to the pure computation as row views: the brand as a whole and each of the six queues', async () => {
  handoffFindAll.mockResolvedValue([
    { id: 'h1', owner_queue: 'sales', status: 'dispositioned', disposition: 'disqualified', subject_ref: 'lead:1', created_at: D('2026-09-12T00:00:00Z'), accepted_at: D('2026-09-12T01:00:00Z'), disposition_at: D('2026-09-12T02:00:00Z'), evidence: { should: 'not matter' } },
    { id: 'h2', owner_queue: 'admissions', status: 'accepted', disposition: null, subject_ref: 'lead:2', created_at: D('2026-09-13T00:00:00Z'), accepted_at: D('2026-09-13T01:00:00Z'), disposition_at: null },
  ]);
  outcomeFindAll.mockResolvedValue([
    { subject_ref: 'lead:2', handoff_id: null, outcome_type: 'reply', occurred_at: D('2026-09-14T00:00:00Z'), metadata: null },
  ]);
  const r = await loadHandoffRates({ brandId: 'b-ent', asOf: AS_OF });
  expect(r.all).toMatchObject({ brand_id: 'b-ent', owner_queue: 'all', handoffs: 2, accepted: 2, verdicts: 1, false_positive_handoff_rate: { value: 1, numerator: 1, denominator: 1 }, connection_rate: { value: 0.5, numerator: 1, denominator: 2 } });
  expect(Object.keys(r.by_queue).sort()).toEqual(['admissions', 'ali', 'human_review', 'sales', 'solution_architect', 'support']);
  expect(r.by_queue.sales).toMatchObject({ handoffs: 1, false_positive_handoff_rate: { value: 1 } });
  expect(r.by_queue.admissions).toMatchObject({ handoffs: 1, connection_rate: { value: 1 }, false_positive_handoff_rate: { value: null, reason: 'no_denominator' } });
  expect(r.by_queue.support).toMatchObject({ handoffs: 0, acceptance_rate: { value: null, reason: 'no_denominator' } });
});

it('a brand with no rows in the window is every rate null', async () => {
  const r = await loadHandoffRates({ brandId: 'b-cpn', asOf: AS_OF });
  expect(r.all.handoffs).toBe(0);
  expect(r.all.acceptance_rate.value).toBeNull();
  expect(r.all.false_positive_handoff_rate).toEqual({ value: null, numerator: 0, denominator: 0, reason: 'no_denominator' });
});
