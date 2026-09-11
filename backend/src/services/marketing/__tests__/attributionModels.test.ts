import {
  aggregateCredits,
  attributeLead,
  checkCreditSum,
  ATTRIBUTION_MODELS,
  DIRECT,
  UNKNOWN,
  type CreditFn,
  type Touchpoint,
} from '../attributionModels';

/**
 * Credit sums to 1.0 per lead, and a mismatch WARNS rather than being normalised away.
 *
 * The second half is the one that matters and the one that is hard to test honestly: the three
 * built-in models are correct, so they never produce a mismatch. Asserting "the warning is null"
 * on correct models proves nothing about what happens when a model is wrong. So the suite passes
 * a DELIBERATELY BROKEN custom model through the same path the real ones take, and asserts two
 * things: the warning fires, and the credits come back exactly as the broken model produced
 * them - not rescaled to 1.0. A guard that normalised would pass the first assertion and fail
 * the second.
 */

const T = (daysAgo: number, source: string, isDirect = false): Touchpoint => ({
  occurredAt: new Date(Date.parse('2026-09-10T12:00:00Z') - daysAgo * 86_400_000).toISOString(),
  source,
  isDirect,
});

const CONVERSION = '2026-09-10T12:00:00Z';
const WINDOW = 30;

describe('checkCreditSum is the guard, and it can fail', () => {
  it('passes a clean split', () => {
    expect(checkCreditSum({ a: 0.5, b: 0.5 }).warning).toBeNull();
    expect(checkCreditSum({ a: 1 }).warning).toBeNull();
  });

  it('tolerates float noise from an equal split', () => {
    // 1/3 three times is 0.9999999999999999 in IEEE 754. That is not a defect.
    expect(checkCreditSum({ a: 1 / 3, b: 1 / 3, c: 1 / 3 }).warning).toBeNull();
  });

  it('flags a real shortfall and reports the actual sum', () => {
    const r = checkCreditSum({ a: 0.6, b: 0.3 });
    expect(r.warning).toMatch(/sums to 0\.9000, not 1\.0/);
    expect(r.warning).toMatch(/NOT been normalised/);
  });

  it('flags an overshoot too', () => {
    expect(checkCreditSum({ a: 0.7, b: 0.7 }).warning).not.toBeNull();
  });

  it('does not mutate the credits it checks', () => {
    const credits = { a: 0.6, b: 0.3 };
    checkCreditSum(credits);
    expect(credits).toEqual({ a: 0.6, b: 0.3 });
  });
});

describe('a mismatch is SURFACED, never normalised', () => {
  // A model that gives every source 0.3 regardless of how many there are. With two sources
  // that is 0.6 - wrong, and detectably so.
  const broken: CreditFn = (tps) => Object.fromEntries(tps.map((tp) => [tp.source, 0.3]));

  it('the warning fires through attributeLead', () => {
    const lc = attributeLead('lead-1', [T(5, 'linkedin'), T(2, 'google')], broken, WINDOW, CONVERSION);
    expect(lc.warning).not.toBeNull();
    expect(lc.sum).toBeCloseTo(0.6, 6);
  });

  it('the credits are returned EXACTLY as produced - not rescaled to 1.0', () => {
    // The load-bearing assertion. A normalising implementation would return 0.5/0.5 here and
    // the warning would be the only trace that anything was wrong - if it survived at all.
    const lc = attributeLead('lead-1', [T(5, 'linkedin'), T(2, 'google')], broken, WINDOW, CONVERSION);
    expect(lc.credits).toEqual({ linkedin: 0.3, google: 0.3 });
  });

  it('the aggregate carries the warning rather than hiding it', () => {
    const credits = [
      attributeLead('bad', [T(5, 'linkedin'), T(2, 'google')], broken, WINDOW, CONVERSION),
      attributeLead('good', [T(5, 'linkedin')], 'first_touch', WINDOW, CONVERSION),
    ];
    const agg = aggregateCredits(credits);
    expect(agg.leadsWithWarnings).toBe(1);
    expect(agg.warnings[0]).toMatch(/^bad: /);
    // The bad lead is still INCLUDED in the totals. Dropping it would make the chart add up
    // while hiding that a model misbehaved on part of the population.
    expect(agg.leads).toBe(2);
    expect(agg.bySource.linkedin).toBeCloseTo(1.3, 6);
  });
});

describe('every built-in model sums to 1.0 per lead', () => {
  const journeys: Touchpoint[][] = [
    [T(20, 'linkedin')],
    [T(20, 'linkedin'), T(10, 'google'), T(1, 'direct', true)],
    [T(3, 'direct', true), T(1, 'direct', true)],
    [T(25, 'facebook'), T(24, 'facebook'), T(2, 'email'), T(1, 'linkedin')],
  ];

  it.each(ATTRIBUTION_MODELS)('%s', (model) => {
    for (const tps of journeys) {
      const lc = attributeLead('x', tps, model, WINDOW, CONVERSION);
      expect(lc.warning).toBeNull();
      expect(lc.sum).toBeCloseTo(1, 6);
    }
  });
});

describe('the models assign credit where they claim to', () => {
  const journey = [T(20, 'linkedin'), T(10, 'google'), T(1, 'direct', true)];

  it('first_touch credits the earliest eligible touch', () => {
    expect(attributeLead('x', journey, 'first_touch', WINDOW, CONVERSION).credits).toEqual({ linkedin: 1 });
  });

  it('last_non_direct skips a trailing direct visit', () => {
    // The most recent touch is direct. Crediting it would say "they came from nowhere",
    // which is true of the last visit and false of the journey.
    expect(attributeLead('x', journey, 'last_non_direct', WINDOW, CONVERSION).credits).toEqual({ google: 1 });
  });

  it('linear splits equally, merging repeated sources', () => {
    const credits = attributeLead('x', journey, 'linear', WINDOW, CONVERSION).credits;
    expect(credits.linkedin).toBeCloseTo(1 / 3, 6);
    expect(credits.google).toBeCloseTo(1 / 3, 6);
    expect(credits[DIRECT]).toBeCloseTo(1 / 3, 6);
  });

  it('orders touchpoints itself, so first and last mean what they say regardless of input order', () => {
    const shuffled = [journey[2], journey[0], journey[1]];
    expect(attributeLead('x', shuffled, 'first_touch', WINDOW, CONVERSION).credits).toEqual({ linkedin: 1 });
  });
});

describe('direct and unknown are honest buckets, never dropped', () => {
  it('a lead who only ever arrived directly is credited to direct under every model', () => {
    const tps = [T(3, 'direct', true), T(1, 'direct', true)];
    for (const model of ATTRIBUTION_MODELS) {
      expect(attributeLead('x', tps, model, WINDOW, CONVERSION).credits).toEqual({ [DIRECT]: 1 });
    }
  });

  it('a lead with NO touch in the window is credited to unknown, not omitted', () => {
    // A 40-day-old visit with a 30-day window. Dropping this lead would make the leads that
    // do have touches look like the whole population.
    const lc = attributeLead('x', [T(40, 'linkedin')], 'linear', WINDOW, CONVERSION);
    expect(lc.credits).toEqual({ [UNKNOWN]: 1 });
    expect(lc.eligibleTouchpoints).toBe(0);
    expect(lc.warning).toBeNull();
  });

  it('the attribution window is applied - old touches do not claim credit', () => {
    const lc = attributeLead('x', [T(40, 'facebook'), T(5, 'linkedin')], 'first_touch', WINDOW, CONVERSION);
    // facebook is outside the window, so linkedin is the FIRST eligible touch.
    expect(lc.credits).toEqual({ linkedin: 1 });
    expect(lc.eligibleTouchpoints).toBe(1);
  });

  it('a touch AFTER conversion does not count', () => {
    const after: Touchpoint = { occurredAt: '2026-09-11T00:00:00Z', source: 'google', isDirect: false };
    const lc = attributeLead('x', [T(5, 'linkedin'), after], 'last_non_direct', WINDOW, CONVERSION);
    expect(lc.credits).toEqual({ linkedin: 1 });
  });

  it('an unparseable timestamp is excluded rather than treated as now', () => {
    const bad: Touchpoint = { occurredAt: 'not a date', source: 'google', isDirect: false };
    const lc = attributeLead('x', [T(5, 'linkedin'), bad], 'last_non_direct', WINDOW, CONVERSION);
    expect(lc.credits).toEqual({ linkedin: 1 });
  });
});
