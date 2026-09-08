import {
  wilsonInterval,
  stageConversion,
  stageConversions,
  projectExpected,
  buildForecast,
  FORECAST_STAGES,
  MIN_STAGE_N,
  type StageCounts,
  type Measured,
} from '../explorerForecastService';

/**
 * Plan §24.1: "no benchmark is fabricated. Where we lack data we say
 * 'insufficient data', not a plausible-looking number."
 *
 * These are the tests for a number a human will plan against, so most of them
 * are about REFUSING to produce one. A forecast that is confidently wrong is
 * worse than one that admits ignorance, and much harder to notice.
 */

const counts = (over: Partial<StageCounts> = {}): StageCounts => ({
  explorer_accounts: 400,
  activated: 200,
  active: 150,
  engaged: 120,
  high_intent: 90,
  application_started: 70,
  application_completed: 50,
  paid: 40,
  ...over,
});

const known = (m: Measured) => {
  if (!m.known) throw new Error(`expected known, got: ${m.reason}`);
  return m;
};

describe('wilsonInterval', () => {
  it('matches the published value for n=100, p=0.5', () => {
    const r = known(wilsonInterval(50, 100));
    expect(r.point).toBeCloseTo(0.5, 10);
    expect(r.low).toBeCloseTo(0.4038, 3);
    expect(r.high).toBeCloseTo(0.5962, 3);
  });

  it('gives a usable upper bound at zero successes', () => {
    // The case that matters most here: no Explorer cohort has completed a full
    // cycle, so several stages sit at zero. The normal approximation collapses
    // to [0, 0] and claims certainty it does not have.
    const r = known(wilsonInterval(0, 50));
    expect(r.point).toBe(0);
    expect(r.low).toBe(0);
    expect(r.high).toBeGreaterThan(0);
    expect(r.high).toBeLessThan(0.1);
  });

  it('never returns a bound outside [0, 1]', () => {
    for (const [s, n] of [[0, 5], [5, 5], [1, 3], [99, 100]] as const) {
      const r = known(wilsonInterval(s, n));
      expect(r.low).toBeGreaterThanOrEqual(0);
      expect(r.high).toBeLessThanOrEqual(1);
    }
  });

  it('narrows as n grows', () => {
    const small = known(wilsonInterval(5, 10));
    const large = known(wilsonInterval(500, 1000));
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('refuses zero trials rather than dividing by zero', () => {
    expect(wilsonInterval(0, 0).known).toBe(false);
  });

  it('refuses impossible counts', () => {
    expect(wilsonInterval(10, 5).known).toBe(false);
    expect(wilsonInterval(-1, 5).known).toBe(false);
  });

  it('refuses non-finite input', () => {
    expect(wilsonInterval(NaN, 10).known).toBe(false);
    expect(wilsonInterval(1, Infinity).known).toBe(false);
  });
});

describe('stageConversion gates (§24.2)', () => {
  it('reports a rate when n and window both clear the bar', () => {
    expect(known(stageConversion(100, 25, 30)).point).toBeCloseTo(0.25, 10);
  });

  it('refuses below the n threshold, however tempting the ratio looks', () => {
    // 2 of 3 is 67%, and it means nothing.
    const r = stageConversion(3, 2, 90);
    expect(r.known).toBe(false);
    expect((r as any).reason).toContain('n=3');
  });

  it('gates on the DENOMINATOR, not the numerator', () => {
    // 1 success from 400 is a fine measurement; 29 from 29 is not.
    expect(stageConversion(400, 1, 30).known).toBe(true);
    expect(stageConversion(MIN_STAGE_N - 1, MIN_STAGE_N - 1, 30).known).toBe(false);
  });

  it('refuses a window shorter than 30 days', () => {
    const r = stageConversion(400, 100, 29);
    expect(r.known).toBe(false);
    expect((r as any).reason).toContain('29d');
  });

  it('refuses counts that grow down the funnel', () => {
    // Means the counts came from different populations or windows. Every
    // number derived from them would be wrong in a way that looks reasonable.
    const r = stageConversion(100, 140, 30);
    expect(r.known).toBe(false);
    expect((r as any).reason).toContain('exceeds');
  });
});

describe('an unknown rate makes the whole projection unknown', () => {
  it('refuses to project when any single stage lacks data', () => {
    // The failure this module exists to prevent: skipping the unknown rate
    // treats it as 1.0 (everyone advances) and yields a confident number.
    const c = counts({ application_started: 5, application_completed: 3 });

    const result = projectExpected(c, stageConversions(c, 90));

    expect(result.known).toBe(false);
  });

  it('names which stage transition was missing', () => {
    const c = counts({ application_started: 5, application_completed: 3 });

    const result = projectExpected(c, stageConversions(c, 90));

    // "insufficient data" with no pointer sends someone hunting through eight
    // stages by hand. It must name the FIRST broken transition: here
    // high_intent(90) → application_started(5) is fine, and the break is the
    // next one, where the source stage itself is only 5.
    expect((result as any).reason).toContain('application_started → application_completed');
    expect((result as any).reason).toContain('n=5');
  });

  it('refuses everything when the window is too short, even with huge n', () => {
    const c = counts();
    expect(projectExpected(c, stageConversions(c, 10)).known).toBe(false);
  });

  it('projects when every stage clears both gates', () => {
    const c = counts();
    expect(projectExpected(c, stageConversions(c, 90)).known).toBe(true);
  });

  it('brackets the point estimate with its interval', () => {
    const c = counts();
    const r = known(projectExpected(c, stageConversions(c, 90)));
    expect(r.low).toBeLessThanOrEqual(r.point);
    expect(r.point).toBeLessThanOrEqual(r.high);
  });
});

describe('buildForecast', () => {
  it('keeps observed paid separate from the projection', () => {
    // §24.1 — a single blended number invites planning against a projection as
    // though it were a fact.
    const f = buildForecast(counts(), 90, 125);
    expect(f.currentPaid).toBe(40);
    expect(known(f.total).point).toBeGreaterThan(f.currentPaid);
  });

  it('inverts the interval for the gap', () => {
    // The LOW total implies the LARGEST shortfall. Carrying bounds straight
    // through would report the optimistic case as the worst case.
    const f = buildForecast(counts(), 90, 125);
    const total = known(f.total);
    const gap = known(f.gap);
    expect(gap.high).toBeCloseTo(125 - total.low, 6);
    expect(gap.low).toBeCloseTo(125 - total.high, 6);
    expect(gap.low).toBeLessThanOrEqual(gap.high);
  });

  it('propagates insufficiency to total and gap, not just expected', () => {
    // A known total sitting beside an unknown projection would be read as a
    // real forecast.
    const f = buildForecast(counts({ application_started: 5 }), 90, 125);
    expect(f.expected.known).toBe(false);
    expect(f.total.known).toBe(false);
    expect(f.gap.known).toBe(false);
  });

  it("reports today's real shape: no cohort has completed a cycle", () => {
    // Plan §24.3 — the honest answer for Explorer → paid is "insufficient
    // data", and the forecast must say so rather than extrapolating from 154.
    const f = buildForecast(
      counts({ application_started: 2, application_completed: 0, paid: 0 }),
      90,
      125,
    );
    expect(f.expected.known).toBe(false);
  });
});

describe('the stage list is the contract', () => {
  it('runs from accounts to paid', () => {
    expect(FORECAST_STAGES[0]).toBe('explorer_accounts');
    expect(FORECAST_STAGES[FORECAST_STAGES.length - 1]).toBe('paid');
  });

  it('produces one rate per adjacent pair', () => {
    expect(stageConversions(counts(), 90)).toHaveLength(FORECAST_STAGES.length - 1);
  });
});
