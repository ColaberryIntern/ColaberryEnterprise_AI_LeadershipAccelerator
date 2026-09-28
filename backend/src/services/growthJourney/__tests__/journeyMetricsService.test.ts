const m = { decisions: jest.fn(), executions: jest.fn(), agents: jest.fn(), rates: jest.fn() };

jest.mock('../../../models', () => ({
  GrowthJourneyDecision: { findAll: (...a: unknown[]) => m.decisions(...a) },
  GrowthJourneyExecution: { findAll: (...a: unknown[]) => m.executions(...a) },
  AiAgent: { findAll: (...a: unknown[]) => m.agents(...a) },
}));
jest.mock('../outcomes/handoffRatesQuery', () => ({
  loadHandoffRates: (...a: unknown[]) => m.rates(...a),
  DEFAULT_RATES_WINDOW_DAYS: 30,
}));

import { Op } from 'sequelize';
import { brandsInScope, computeJourneyMetrics, DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS, rateOf, type JourneyMetricsResult, type ServedMetric } from '../performance/journeyMetricsService';
import { JOURNEY_METRICS } from '../../adminOs/metrics/journeyMetrics';
import { NO_DENOMINATOR } from '../outcomes/handoffRates';

/**
 * T605 — the journey metrics computed for one scope.
 *
 * The properties, in the order they would hurt if wrong:
 *
 *   1. NULL IS NEVER ZERO. Every rate with an empty denominator is
 *      `{ value: null, reason: 'no_denominator' }`, which is Phase 4's
 *      vocabulary reused rather than a second one invented here.
 *   2. EVERY VALUE CARRIES FRESHNESS, and on a dark system - no agent run, no
 *      rows - every verdict is `never`, not a zero-aged `fresh`.
 *   3. IT READS DECLARED COLUMNS AND AGGREGATES, never a JSONB payload: the
 *      shape of the `findAll` calls is asserted, because that is where a
 *      person's words would leak in.
 *   4. THE SCOPE IS THE CALLER'S. An explicit brand outside the caller's
 *      memberships narrows to nothing rather than widening.
 */

const NOW = new Date('2026-09-28T12:00:00Z');
const TENANT = 'tenant-1';
const BRAND_A = 'brand-a';
const BRAND_B = 'brand-b';

const ratesFor = (over: Record<string, unknown> = {}) => ({
  all: {
    handoffs: 0, accepted: 0, verdicts: 0,
    acceptance_rate: rateOf(0, 0), expiry_rate: rateOf(0, 0), connection_rate: rateOf(0, 0), meeting_rate: rateOf(0, 0),
    qualification_rate: rateOf(0, 0), proposal_rate: rateOf(0, 0), conversion_rate: rateOf(0, 0), false_positive_handoff_rate: rateOf(0, 0),
    time_to_accept_hours: { value: null, samples: 0 }, time_to_disposition_hours: { value: null, samples: 0 }, time_to_first_connection_hours: { value: null, samples: 0 },
    ...over,
  },
  by_queue: {},
});

const metric = (result: JourneyMetricsResult, key: string): ServedMetric => result.metrics.find((x) => x.key === key)!;

beforeEach(() => {
  jest.clearAllMocks();
  m.decisions.mockResolvedValue([]);
  m.executions.mockResolvedValue([]);
  m.agents.mockResolvedValue([]);
  m.rates.mockResolvedValue(ratesFor());
});

describe('a dark system: nothing has run, and it says so', () => {
  it('returns every registered journey metric, with null rates and never freshness', async () => {
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    expect(result.metrics.map((x) => x.key).sort()).toEqual(Object.keys(JOURNEY_METRICS).sort());
    // The two this service cannot compute carry their OWN reason instead of `no_denominator` -
    // "we have no way to compute this yet" and "there was nothing to divide by" are different
    // facts, and a screen that blurred them would be back to the registry's original defect.
    const CANNOT_COMPUTE: Record<string, string> = {
      'journey.plan_refusal_rate': 'needs_executor_run_row',
      'journey.enrolment_conversion_rate': 'needs_identity_key',
    };
    for (const served of result.metrics) {
      expect(served.freshness.verdict).toBe('never');
      if (served.unit !== 'percent') continue;
      expect(served.value).toBeNull();
      expect(served.reason).toBe(CANNOT_COMPUTE[served.key] ?? NO_DENOMINATOR);
    }
    expect(Object.keys(CANNOT_COMPUTE).every((k) => result.metrics.some((x) => x.key === k))).toBe(true);
  });

  it('a count with no rows is 0 - a count CAN be zero, a rate cannot', async () => {
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    expect(metric(result, 'journey.decisions_recorded').value).toBe(0);
    expect(metric(result, 'journey.receipts_completed').value).toBe(0);
    expect(metric(result, 'journey.live_decision_share').value).toBeNull();
    expect(metric(result, 'journey.send_block_rate').value).toBeNull();
  });

  it('carries the registry definition with each value, so a screen needs no second lookup', async () => {
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    const served = metric(result, 'journey.enrolment_conversion_rate');
    expect(served.name).toBe(JOURNEY_METRICS['journey.enrolment_conversion_rate'].name);
    expect(served.status).toBe('partial');
    expect(served.statusReason).toMatch(/e-mail equality/i);
    expect(served.reason).toBe('needs_identity_key');
  });
});

describe('the numerators and denominators, by name', () => {
  it('the live decision share is live decisions over all decisions', async () => {
    m.decisions.mockResolvedValue([
      { mode: 'live', n: '3', newest: '2026-09-28T11:00:00Z' },
      { mode: 'shadow', n: '9', newest: '2026-09-28T10:00:00Z' },
    ]);
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    expect(metric(result, 'journey.decisions_recorded').value).toBe(12);
    expect(metric(result, 'journey.live_decision_share')).toMatchObject({ value: 25, numerator: 3, denominator: 12 });
    // The newest row's timestamp decides a live metric's freshness.
    expect(metric(result, 'journey.live_decision_share').freshness).toMatchObject({ verdict: 'fresh', age_hours: 1 });
  });

  it('the blocked send rate is blocked over the receipts that REACHED a send', async () => {
    m.executions.mockResolvedValue([
      { status: 'completed', n: '6', newest: '2026-09-28T11:30:00Z' },
      { status: 'blocked', n: '2', newest: '2026-09-28T11:45:00Z' },
      { status: 'failed', n: '2', newest: '2026-09-28T09:00:00Z' },
      // Not in the denominator: these never reached the send step.
      { status: 'pending_review', n: '50', newest: '2026-09-28T11:59:00Z' },
      { status: 'approved', n: '7', newest: '2026-09-28T11:58:00Z' },
    ]);
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    expect(metric(result, 'journey.receipts_completed').value).toBe(6);
    expect(metric(result, 'journey.send_block_rate')).toMatchObject({ value: 20, numerator: 2, denominator: 10 });
  });

  it('the handoff rates come from Phase 4\'s computation, summed on numerators - never averaged across brands', async () => {
    // Averaging two brands' rates would weight three handoffs the same as three hundred.
    m.rates.mockImplementation(async ({ brandId }: { brandId: string }) =>
      brandId === BRAND_A
        ? ratesFor({ handoffs: 100, accepted: 40, verdicts: 20, false_positive_handoff_rate: rateOf(2, 20), qualification_rate: rateOf(10, 20), time_to_accept_hours: { value: 4, samples: 40 } })
        : ratesFor({ handoffs: 4, accepted: 4, verdicts: 4, false_positive_handoff_rate: rateOf(3, 4), qualification_rate: rateOf(1, 4), time_to_accept_hours: { value: 1, samples: 4 } }));
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A, BRAND_B], asOf: NOW });
    expect(metric(result, 'journey.handoff_acceptance_rate')).toMatchObject({ numerator: 44, denominator: 104 });
    expect(metric(result, 'journey.false_positive_handoff_rate')).toMatchObject({ numerator: 5, denominator: 24 });
    expect(metric(result, 'journey.qualified_opportunity_rate')).toMatchObject({ numerator: 11, denominator: 24 });
    // A naive average of the two rates would be 10% and 75% -> 42.5%; the pooled figure is 5/24.
    expect(metric(result, 'journey.false_positive_handoff_rate').value).toBe(20.83);
    expect(m.rates).toHaveBeenCalledTimes(2);
  });

  it('a median below Phase 4\'s sample floor stays null, and never becomes a zero', async () => {
    m.rates.mockResolvedValue(ratesFor({ handoffs: 2, accepted: 1, verdicts: 1, time_to_accept_hours: { value: null, samples: 1, reason: 'below_min_samples' } }));
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    expect(metric(result, 'journey.time_to_first_human_touch_hours')).toMatchObject({ value: null, reason: NO_DENOMINATOR });
  });
});

describe('freshness comes from the input each metric declares', () => {
  it('a scheduled metric reads its AGENT\'s last run, not the rows', async () => {
    m.decisions.mockResolvedValue([{ mode: 'live', n: '1', newest: '2026-09-28T11:59:00Z' }]);
    m.agents.mockResolvedValue([
      { get: (k: string) => ({ agent_name: 'GrowthJourneyShadowDecisions', last_run_at: new Date('2026-09-27T04:20:00Z') }[k]) },
      { get: (k: string) => ({ agent_name: 'GrowthJourneyExecutor', last_run_at: new Date('2026-09-28T11:00:00Z') }[k]) },
    ]);
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    // The nightly ran 31.7h ago, past its 26h rule, even though a decision row is a minute old.
    expect(metric(result, 'journey.nightly_recorded_decisions').freshness).toMatchObject({ verdict: 'stale' });
    expect(metric(result, 'journey.nightly_recorded_decisions').freshness.reason).toContain('GrowthJourneyShadowDecisions last run');
    // The executor ran an hour ago, inside its 4h rule.
    expect(metric(result, 'journey.receipts_completed').freshness).toMatchObject({ verdict: 'fresh', age_hours: 1 });
    // And the live metric reads the row.
    expect(metric(result, 'journey.decisions_recorded').freshness).toMatchObject({ verdict: 'fresh' });
  });

  it('an agent row that exists but never ran is never, not stale', async () => {
    m.agents.mockResolvedValue([{ get: (k: string) => ({ agent_name: 'GrowthJourneyExecutor', last_run_at: null }[k]) }]);
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], asOf: NOW });
    expect(metric(result, 'journey.receipts_completed').freshness).toMatchObject({ verdict: 'never', age_hours: null });
  });
});

describe('what it reads, and what it refuses to read', () => {
  it('aggregates in the database and names only declared columns - no JSONB payload', async () => {
    await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], programId: 'program-1', asOf: NOW });
    const [decisionQuery] = m.decisions.mock.calls[0] as [Record<string, unknown>];
    const [executionQuery] = m.executions.mock.calls[0] as [Record<string, unknown>];
    for (const query of [decisionQuery, executionQuery]) {
      const attributes = JSON.stringify(query.attributes);
      expect(attributes).toContain('COUNT');
      expect(attributes).toContain('MAX');
      expect(query.raw).toBe(true);
      for (const banned of ['candidates', 'evidence', 'selected_content', 'metadata', 'payload', 'subject_ref', 'lead_id']) {
        expect(attributes).not.toContain(banned);
      }
    }
    expect(decisionQuery.group).toEqual(['mode']);
    expect(executionQuery.group).toEqual(['status']);
  });

  it('bounds every read by the scope, the window and the programme', async () => {
    await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A, BRAND_B], programId: 'program-1', windowDays: 7, asOf: NOW });
    const [decisionQuery] = m.decisions.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(decisionQuery.where.brand_id).toEqual({ [Op.in]: [BRAND_A, BRAND_B] });
    expect(decisionQuery.where.program_id).toBe('program-1');
    const window = decisionQuery.where.created_at as Record<symbol, Date>;
    expect(window[Op.gte]).toEqual(new Date('2026-09-21T12:00:00Z'));
    expect(window[Op.lt]).toEqual(NOW);
  });

  it('clamps the window: a year at most, a day at least, whole days', async () => {
    for (const [asked, applied] of [[undefined, DEFAULT_WINDOW_DAYS], [0, DEFAULT_WINDOW_DAYS], [7, 7], [9.9, 9], [4000, MAX_WINDOW_DAYS], [-5, 1]] as const) {
      m.rates.mockClear();
      const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], windowDays: asked as number | undefined, asOf: NOW });
      expect(result.scope.window_days).toBe(applied);
      expect(m.rates).toHaveBeenCalledWith(expect.objectContaining({ windowDays: applied }));
    }
  });

  it('never queries at all when the caller\'s scope is empty', async () => {
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [], asOf: NOW });
    expect(m.decisions).not.toHaveBeenCalled();
    expect(m.executions).not.toHaveBeenCalled();
    expect(m.rates).not.toHaveBeenCalled();
    expect(metric(result, 'journey.decisions_recorded').value).toBe(0);
    expect(metric(result, 'journey.handoff_acceptance_rate').value).toBeNull();
  });
});

describe('the scope narrows, never widens', () => {
  it('an explicit brand inside the caller\'s memberships narrows to it', () => {
    expect(brandsInScope({ tenantId: TENANT, brandIds: [BRAND_A, BRAND_B], brandId: BRAND_B })).toEqual([BRAND_B]);
  });

  it('an explicit brand OUTSIDE them narrows to nothing - it does not fall back to all', () => {
    expect(brandsInScope({ tenantId: TENANT, brandIds: [BRAND_A], brandId: 'brand-theirs' })).toEqual([]);
  });

  it('no explicit brand reads every brand the caller may see', () => {
    expect(brandsInScope({ tenantId: TENANT, brandIds: [BRAND_A, BRAND_B] })).toEqual([BRAND_A, BRAND_B]);
  });

  it('reports the scope it used back with the answer', async () => {
    const result = await computeJourneyMetrics({ tenantId: TENANT, brandIds: [BRAND_A], brandId: BRAND_A, programId: 'program-1', windowDays: 14, asOf: NOW });
    expect(result.scope).toEqual({
      tenant_id: TENANT, brand_id: BRAND_A, program_id: 'program-1', window_days: 14,
      from: '2026-09-14T12:00:00.000Z', to: NOW.toISOString(),
    });
    expect(result.computed_at).toBe(NOW.toISOString());
  });
});

describe('the bounds other suites restate', () => {
  it('the window bounds are 30 and 365 - the numbers the route suite and the Zod schema carry', () => {
    // `growthJourneyReadRoutes.access.test.ts` mocks this module wholly (the real one loads a model
    // directly), so it restates these two numbers. This cell is what stops that copy drifting.
    expect(DEFAULT_WINDOW_DAYS).toBe(30);
    expect(MAX_WINDOW_DAYS).toBe(365);
  });
});

describe('rateOf', () => {
  it('is null with a reason on an empty denominator, never 0', () => {
    expect(rateOf(0, 0)).toEqual({ value: null, numerator: 0, denominator: 0, reason: NO_DENOMINATOR });
    expect(rateOf(3, 0)).toEqual({ value: null, numerator: 3, denominator: 0, reason: NO_DENOMINATOR });
  });

  it('is a percentage to two decimals, and carries both sides', () => {
    expect(rateOf(1, 3)).toEqual({ value: 33.33, numerator: 1, denominator: 3 });
    expect(rateOf(0, 5)).toEqual({ value: 0, numerator: 0, denominator: 5 });
    expect(rateOf(5, 5)).toEqual({ value: 100, numerator: 5, denominator: 5 });
  });
});
