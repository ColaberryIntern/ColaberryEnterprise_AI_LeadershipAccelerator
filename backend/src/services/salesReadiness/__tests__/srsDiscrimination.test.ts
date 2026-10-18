/**
 * Factor discrimination - does this measurement actually distinguish a factor that ranks from one
 * that only looks important?
 *
 * The cases are built from scores the real engine produced, not from hand-written statistics, so
 * a change to the engine that flattened a factor would show up here rather than being described
 * around.
 */
import { measureDiscrimination, MOSTLY_ABSENT_ABOVE } from '../srsDiscrimination';
import { scoreReadiness, SrsInputs } from '../srsEngine';
import { FACTORS } from '../srsRuleset';

const AT = '2026-10-18T12:00:00.000Z';

const EMPTY: SrsInputs = {
  daysKnown: null, intentScore: null, inboundReplies: null, paymentFailures: null,
  priorHistoryAvailable: null, priorEnrolments: null, explorerEngagement: null,
  explorerIntent: null, consentContact: null, siteSessions: null, pageEvents: null,
  enrolments: null, appointments: null, evidenceAsOf: null,
};

const score = (patch: Partial<SrsInputs>) =>
  scoreReadiness({ ...EMPTY, ...patch } as SrsInputs, AT);

const find = (r: ReturnType<typeof measureDiscrimination>, key: string) =>
  r.factors.find((f) => f.key === key);

describe('a factor that is the same for everyone carries none of the ranking', () => {
  it('calls it CONSTANT and gives it a ranking share of zero', () => {
    // Everybody enrolled: the 40-point factor is identical for all of them, which is exactly the
    // shape M25 found in production.
    const scores = [1, 1, 1, 1].map((n) => score({ enrolments: n, daysKnown: 10 }));
    const r = measureDiscrimination(scores);
    const enrol = find(r, 'enrolmentStarted');
    expect(enrol?.verdict).toBe('constant');
    expect(enrol?.distinctValues).toBe(1);
    expect(enrol?.rankingShare).toBe(0);
  });

  it('calls a factor that is zero for everyone ALWAYS-ZERO, also sharing nothing', () => {
    const scores = [0, 0, 0].map((n) => score({ appointments: n, daysKnown: 10 }));
    const a = find(measureDiscrimination(scores), 'appointmentBooked');
    expect(a?.verdict).toBe('always-zero');
    expect(a?.rankingShare).toBe(0);
  });

  it('calls a factor that DOES vary a ranker, and gives it a positive share', () => {
    // The control. Without it the measure could call everything dead and look perceptive.
    const scores = [1, 50, 200, 365].map((d) => score({ daysKnown: d }));
    const t = find(measureDiscrimination(scores), 'tenure');
    expect(t?.verdict).toBe('ranks');
    expect(t?.distinctValues).toBeGreaterThan(1);
    expect((t?.rankingShare ?? 0)).toBeGreaterThan(0);
  });
});

describe('the ranking shares describe the whole ordering', () => {
  it('sum to 1 when anything varies at all', () => {
    const scores = [
      score({ daysKnown: 10, intentScore: 10 }),
      score({ daysKnown: 200, intentScore: 90 }),
      score({ daysKnown: 50, intentScore: 40 }),
    ];
    const total = measureDiscrimination(scores).factors
      .reduce((a, f) => a + f.rankingShare, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('are all zero when nothing varies, rather than dividing by zero', () => {
    const scores = [score({ daysKnown: 90 }), score({ daysKnown: 90 })];
    const r = measureDiscrimination(scores);
    expect(r.factors.every((f) => f.rankingShare === 0)).toBe(true);
  });

  it('survives a single-person population without inventing variance', () => {
    const r = measureDiscrimination([score({ daysKnown: 90, enrolments: 1 })]);
    expect(r.population).toBe(1);
    expect(r.factors.every((f) => f.rankingShare === 0)).toBe(true);
  });

  it('survives an empty population', () => {
    const r = measureDiscrimination([]);
    expect(r.population).toBe(0);
    expect(r.factors).toHaveLength(FACTORS.length);
    expect(r.factors.every((f) => f.verdict === 'no-evidence')).toBe(true);
  });
});

describe('absence is excluded from the statistics, not counted as zero', () => {
  it('does not let ignorance manufacture variance', () => {
    // Two people with evidence and the same value, two with none. Counting the absent as 0 would
    // make this factor look like it separates people, when all it separates is known from
    // unknown.
    const scores = [
      score({ consentContact: true }),
      score({ consentContact: true }),
      score({}),
      score({}),
    ];
    const c = find(measureDiscrimination(scores), 'consent');
    expect(c?.scored).toBe(2);
    expect(c?.absent).toBe(2);
    expect(c?.distinctValues).toBe(1);
    expect(c?.rankingShare).toBe(0);
  });

  it(`flags a factor absent for more than ${MOSTLY_ABSENT_ABOVE * 100}% as mostly-absent`, () => {
    const scores = [
      score({ intentScore: 10 }), score({ intentScore: 90 }),
      score({}), score({}), score({}),
    ];
    expect(find(measureDiscrimination(scores), 'intent')?.verdict).toBe('mostly-absent');
  });

  it('does NOT flag one that is mostly present - the control', () => {
    const scores = [
      score({ intentScore: 10 }), score({ intentScore: 90 }), score({ intentScore: 40 }),
      score({}),
    ];
    expect(find(measureDiscrimination(scores), 'intent')?.verdict).toBe('ranks');
  });
});

describe('the headline: how many points do no work', () => {
  it('counts the points held by factors that cannot rank anybody', () => {
    // Everyone enrolled, nobody booked, tenure varies. The 40 and the 35 are dead weight.
    const scores = [10, 200, 365].map((d) => score({
      enrolments: 1, appointments: 0, daysKnown: d,
    }));
    const r = measureDiscrimination(scores);
    expect(find(r, 'enrolmentStarted')?.verdict).toBe('constant');
    expect(find(r, 'appointmentBooked')?.verdict).toBe('always-zero');
    // 40 + 35, plus every factor nobody had evidence for.
    expect(r.deadPoints).toBeGreaterThanOrEqual(75);
    expect(r.deadShare).toBeGreaterThan(0.4);
  });

  it('reports a low dead share when the factors genuinely vary - the control', () => {
    const scores = [
      score({ enrolments: 1, appointments: 2, inboundReplies: 2, intentScore: 90, daysKnown: 300, consentContact: true, siteSessions: 20, pageEvents: 100, explorerEngagement: 80, explorerIntent: 70, priorHistoryAvailable: true, priorEnrolments: 1, paymentFailures: 0 }),
      score({ enrolments: 0, appointments: 0, inboundReplies: 0, intentScore: 5, daysKnown: 2, consentContact: false, siteSessions: 1, pageEvents: 3, explorerEngagement: 5, explorerIntent: 2, priorHistoryAvailable: true, priorEnrolments: 0, paymentFailures: 1 }),
      score({ enrolments: 1, appointments: 1, inboundReplies: 1, intentScore: 50, daysKnown: 60, consentContact: true, siteSessions: 8, pageEvents: 30, explorerEngagement: 40, explorerIntent: 30, priorHistoryAvailable: true, priorEnrolments: 1, paymentFailures: 0 }),
    ];
    const r = measureDiscrimination(scores);
    // Only `friction` is structurally dead here (its max is 0 by DECISION 4).
    expect(r.deadShare).toBeLessThan(0.1);
  });
});
