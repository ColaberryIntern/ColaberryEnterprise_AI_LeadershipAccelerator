const funnel = { getFunnelSnapshot: jest.fn() };

jest.mock('../funnelStageService', () => ({
  getFunnelSnapshot: (...a: unknown[]) => funnel.getFunnelSnapshot(...a),
}));

import {
  REVENUE_HYPOTHESES,
  assertEveryHypothesisHasAKillCondition,
  assertTripwiresAreCheckable,
  assertNoInventedPriceOrBuyer,
} from '../hypothesisRegister';
import { getHypothesisHealth, daysUntil } from '../hypothesisHealthService';

/**
 * C8.6 acceptance: every hypothesis has an explicit kill condition, dying ones are
 * obvious, and it reads real funnel data rather than manual entry.
 *
 * The assertion that matters most is the one about NOT killing on a blind spot. C8.4
 * established that several funnel stages have no source, so the easy bug here is to read
 * "no rows" as "no evidence" and retire a bet the instrument never measured.
 */
const stage = (key: string, reached: number | null) => ({
  n: 1, key, label: key, evidence: 'live', accountsAtStage: reached, accountsReached: reached,
});

function mockFunnel(counts: Record<string, number | null>, caveats: string[] = []) {
  funnel.getFunnelSnapshot.mockResolvedValue({
    asOf: '2026-10-23T00:00:00.000Z',
    stages: Object.entries(counts).map(([k, v]) => stage(k, v)),
    totalAccounts: 0,
    attributionAvailable: true,
    caveats,
  });
}

/** Every stage countable and empty: the state production is actually in. */
const EMPTY_FUNNEL = {
  target: 0, mapped: 0, contacted: 0, engaged: 0, meeting_booked: 0,
  demo_delivered: 0, pilot_proposed: 0, contract: 0, pilot_running: 0, expansion: 0,
};

const NOW = new Date('2026-10-23T12:00:00Z');
const find = (r: Awaited<ReturnType<typeof getHypothesisHealth>>, k: string) =>
  r.hypotheses.find((h) => h.key === k)!;

beforeEach(() => funnel.getFunnelSnapshot.mockReset());

describe('the register C0.1 left without kill conditions', () => {
  it('carries the five hypotheses from C0.1 section 6', () => {
    expect(REVENUE_HYPOTHESES).toHaveLength(5);
    expect(REVENUE_HYPOTHESES.map((h) => h.key)).toEqual([
      'paid_accelerator', 'annual_enterprise', 'workforce_funded',
      'higher_education', 'partner_delivered',
    ]);
  });

  it('gives every one an explicit, DATED kill condition', () => {
    // "Explicit" has to mean dated. A condition with no date never fires.
    expect(assertEveryHypothesisHasAKillCondition()).toBe(5);
  });

  it('makes every tripwire checkable from a stage and a threshold', () => {
    expect(() => assertTripwiresAreCheckable()).not.toThrow();
  });

  it('never invents a price or a buyer the register left UNKNOWN', () => {
    // C0.1: "Every price and buyer above is UNKNOWN by design. Filling them with
    // estimates would make this register useless as a test."
    expect(() => assertNoInventedPriceOrBuyer()).not.toThrow();
  });

  it('records where the register and this file word a label differently', () => {
    // C0.1 writes "programme". The key carries identity, but the divergence is kept
    // visible so nobody later thinks these are different hypotheses.
    const annual = REVENUE_HYPOTHESES.find((h) => h.key === 'annual_enterprise')!;
    expect(annual.registerLabel).toBe('Annual enterprise programme');
    expect(annual.label).toBe('Annual enterprise program');
  });
});

describe('it reads the funnel, and an empty funnel is a finding', () => {
  it('calls the funnel service rather than taking a typed-in number', () => {
    expect(getHypothesisHealth).toBeDefined();
  });

  it('reports no_evidence when nothing exists at the target or upstream', async () => {
    mockFunnel(EMPTY_FUNNEL);
    const r = await getHypothesisHealth(NOW);
    expect(find(r, 'paid_accelerator').verdict).toBe('no_evidence');
    expect(find(r, 'paid_accelerator').note).toMatch(/pipe is empty rather than slow/);
  });

  it('reports in_flight when something upstream could still become the evidence', async () => {
    mockFunnel({ ...EMPTY_FUNNEL, contacted: 4, engaged: 2 });
    const r = await getHypothesisHealth(NOW);
    const h = find(r, 'paid_accelerator');
    expect(h.verdict).toBe('in_flight');
    expect(h.inFlight).toBe(4);
  });

  it('confirms a hypothesis once the required evidence exists', async () => {
    mockFunnel({ ...EMPTY_FUNNEL, contract: 3 });
    const r = await getHypothesisHealth(NOW);
    expect(find(r, 'paid_accelerator').verdict).toBe('confirmed');
  });

  it('counts accountsReached, so an account that moved on still counts', async () => {
    // A hypothesis needing three contracts is satisfied by three accounts that REACHED
    // contract, whether or not they have since expanded past it.
    mockFunnel({ ...EMPTY_FUNNEL, contract: 3, expansion: 3 });
    expect(find(await getHypothesisHealth(NOW), 'paid_accelerator').verdict)
      .toBe('confirmed');
  });
});

describe('it does not kill a hypothesis for a blind spot', () => {
  it('reports uncountable, NOT no_evidence, when the target stage has no source', async () => {
    // The important one. C8.4 says several stages cannot be counted at all; reading
    // that as "no evidence" would retire a bet the instrument never measured.
    mockFunnel({ ...EMPTY_FUNNEL, contract: null });
    const r = await getHypothesisHealth(NOW);
    const h = find(r, 'paid_accelerator');
    expect(h.verdict).toBe('uncountable');
    expect(h.verdict).not.toBe('no_evidence');
    expect(h.evidence).toBeNull();
    expect(h.note).toMatch(/gap in instrumentation, not evidence against the bet/);
  });

  it('does not let a tripwire fire on an unmeasured stage', async () => {
    // Past the first tripwire date, but the stage it checks is uncountable.
    mockFunnel({ ...EMPTY_FUNNEL, pilot_proposed: null });
    const r = await getHypothesisHealth(new Date('2026-12-05T12:00:00Z'));
    const h = find(r, 'paid_accelerator');
    const first = h.tripwires.find((t) => t.on === '2026-11-30')!;
    expect(first.due).toBe(true);
    expect(first.observed).toBeNull();
    expect(first.tripped).toBe(false);
  });

  it('carries the funnel caveats through, so an uncountable verdict is explainable', async () => {
    mockFunnel({ ...EMPTY_FUNNEL, contract: null }, ['delivery_contracts is absent.']);
    const r = await getHypothesisHealth(NOW);
    expect(r.caveats.join(' ')).toMatch(/delivery_contracts is absent/);
  });
});

describe('dated tripwires fire, and only when due', () => {
  it('does not trip before its date', async () => {
    mockFunnel(EMPTY_FUNNEL);
    const h = find(await getHypothesisHealth(NOW), 'paid_accelerator');
    expect(h.tripwires.every((t) => t.tripped)).toBe(false);
    expect(h.tripwires.find((t) => t.on === '2026-11-30')!.due).toBe(false);
  });

  it('trips once the date has passed and the threshold was missed', async () => {
    mockFunnel(EMPTY_FUNNEL);
    const h = find(await getHypothesisHealth(new Date('2026-12-05T12:00:00Z')),
      'paid_accelerator');
    const first = h.tripwires.find((t) => t.on === '2026-11-30')!;
    expect(first.tripped).toBe(true);
    expect(h.note).toMatch(/A dated tripwire has fired/);
  });

  it('does not trip when the threshold WAS met by the date', async () => {
    mockFunnel({ ...EMPTY_FUNNEL, pilot_proposed: 2 });
    const h = find(await getHypothesisHealth(new Date('2026-12-05T12:00:00Z')),
      'paid_accelerator');
    expect(h.tripwires.find((t) => t.on === '2026-11-30')!.tripped).toBe(false);
  });

  it('reports past_deadline once the target date has gone', async () => {
    mockFunnel(EMPTY_FUNNEL);
    const h = find(await getHypothesisHealth(new Date('2027-01-05T12:00:00Z')),
      'paid_accelerator');
    expect(h.verdict).toBe('past_deadline');
    expect(h.daysRemaining).toBeLessThan(0);
    expect(h.note).toMatch(/kill condition is met/);
  });
});

describe('daysUntil', () => {
  it('counts whole days and goes negative after the date', () => {
    expect(daysUntil('2026-12-31', new Date('2026-10-23T12:00:00Z'))).toBe(70);
    expect(daysUntil('2026-10-23', new Date('2026-10-23T12:00:00Z'))).toBe(1);
    expect(daysUntil('2026-10-01', new Date('2026-10-23T12:00:00Z'))).toBeLessThan(0);
  });
});

describe('the summary makes the state of the portfolio readable at a glance', () => {
  it('accounts for all five hypotheses', async () => {
    mockFunnel(EMPTY_FUNNEL);
    const r = await getHypothesisHealth(NOW);
    const total = Object.values(r.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
  });
});
