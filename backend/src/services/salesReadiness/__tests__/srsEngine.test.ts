/**
 * M25 - properties of the Sales Readiness Score, plus one named test per factor.
 *
 * The acceptance criteria are: the same inputs give the same score, every point is attributable
 * to a named factor, a missing input renders absent with a reason and never zero, and a mutation
 * per factor kills a named test. Each of those is a section below.
 *
 * THE PROPERTY TESTS USE A SEEDED GENERATOR, not Math.random. A property suite that cannot be
 * replayed reports a failure nobody can reproduce, which is worse than no property suite: the
 * next run is green and the bug is still there.
 */
import {
  scoreReadiness, SrsInputs, ScoreResult,
} from '../srsEngine';
import {
  FACTORS, PASSIVE_CAP, RULESET_VERSION, SMALLEST_COMMITMENT, MAX_POSSIBLE,
} from '../srsRuleset';

const AT = '2026-10-17T12:00:00.000Z';

/** Every input absent. The honest starting point for a person we know nothing about. */
const EMPTY: SrsInputs = {
  daysKnown: null, intentScore: null, inboundReplies: null, paymentFailures: null,
  priorHistoryAvailable: null, priorEnrolments: null, explorerEngagement: null,
  explorerIntent: null, consentContact: null, siteSessions: null, pageEvents: null,
  enrolments: null, appointments: null, evidenceAsOf: null, lastActivityAt: null,
};

/** Everything present and strong. */
const FULL: SrsInputs = {
  daysKnown: 365, intentScore: 100, inboundReplies: 5, paymentFailures: 0,
  priorHistoryAvailable: true, priorEnrolments: 2, explorerEngagement: 100,
  explorerIntent: 100, consentContact: true, siteSessions: 50, pageEvents: 200,
  enrolments: 1, appointments: 3, evidenceAsOf: '2026-10-18T00:00:00.000Z',
  lastActivityAt: '2026-10-17T12:00:00.000Z',
};

/** Deterministic LCG, so a failing case can be replayed from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A random-but-reproducible input, with roughly a third of fields absent. */
function sample(next: () => number): SrsInputs {
  const maybe = (v: number): number | null => (next() < 0.33 ? null : v);
  const maybeBool = (): boolean | null => (next() < 0.33 ? null : next() < 0.5);
  return {
    daysKnown: maybe(Math.floor(next() * 400)),
    intentScore: maybe(Math.floor(next() * 100)),
    inboundReplies: maybe(Math.floor(next() * 6)),
    paymentFailures: maybe(Math.floor(next() * 3)),
    priorHistoryAvailable: maybeBool(),
    priorEnrolments: maybe(Math.floor(next() * 3)),
    explorerEngagement: maybe(Math.floor(next() * 100)),
    explorerIntent: maybe(Math.floor(next() * 100)),
    consentContact: maybeBool(),
    siteSessions: maybe(Math.floor(next() * 40)),
    pageEvents: maybe(Math.floor(next() * 300)),
    enrolments: maybe(Math.floor(next() * 2)),
    appointments: maybe(Math.floor(next() * 3)),
    evidenceAsOf: null,
    lastActivityAt: null,
  };
}

const scoredPoints = (r: ScoreResult) =>
  r.factors.filter((f) => f.state === 'scored').reduce((s, f) => s + (f.points ?? 0), 0);

describe('M25 - the score is deterministic', () => {
  it('gives the same result for the same inputs, every time', () => {
    const next = rng(20261017);
    for (let i = 0; i < 200; i += 1) {
      const inputs = sample(next);
      expect(scoreReadiness(inputs, AT)).toEqual(scoreReadiness(inputs, AT));
    }
  });

  it('reads no hidden clock: the same inputs and the same computedAt give the same result', () => {
    expect(scoreReadiness(FULL, AT)).toEqual(scoreReadiness(FULL, AT));
  });

  it('DOES depend on computedAt now, because recency is measured against it', () => {
    // This assertion was the other way round until the recency factor landed, and the old version
    // would now be a lie: the score IS a function of (inputs, computedAt). That is not a clock
    // read - computedAt is an explicit argument - but pretending the score ignores it would be
    // the wrong kind of determinism, and a reader comparing two scores needs to know.
    const soonAfter = scoreReadiness(FULL, '2026-10-17T13:00:00.000Z');
    const aYearLater = scoreReadiness(FULL, '2027-10-17T13:00:00.000Z');
    expect(aYearLater.total).toBeLessThan(soonAfter.total);
    const recency = (r: ScoreResult) => r.factors.find((f) => f.key === 'recency');
    expect(recency(soonAfter)?.points).toBe(25);
    expect(recency(aYearLater)?.points).toBe(0);
  });

  it('stamps the ruleset version on every score, so two versions cannot be silently compared', () => {
    expect(scoreReadiness(EMPTY, AT).rulesetVersion).toBe(RULESET_VERSION);
    expect(RULESET_VERSION).toMatch(/provisional/);
  });
});

describe('M25 - every point is attributable to a named factor', () => {
  it('the total equals the sum of its scored factors, with the passive band capped', () => {
    const next = rng(7);
    for (let i = 0; i < 200; i += 1) {
      const r = scoreReadiness(sample(next), AT);
      const passive = r.factors.filter((f) => f.band === 'passive' && f.state === 'scored')
        .reduce((s, f) => s + (f.points ?? 0), 0);
      const nonPassive = r.factors.filter((f) => f.band !== 'passive' && f.state === 'scored')
        .reduce((s, f) => s + (f.points ?? 0), 0);
      const expected = Math.round((nonPassive + Math.min(passive, PASSIVE_CAP)) * 100) / 100;
      expect(r.total).toBe(expected);
    }
  });

  it('names every factor in the ruleset, and invents none', () => {
    const keys = scoreReadiness(EMPTY, AT).factors.map((f) => f.key).sort();
    expect(keys).toEqual(FACTORS.map((f) => f.key).sort());
  });

  it('never lets a factor exceed its own maximum', () => {
    const next = rng(99);
    for (let i = 0; i < 200; i += 1) {
      for (const f of scoreReadiness(sample(next), AT).factors) {
        if (f.points !== null) expect(f.points).toBeLessThanOrEqual(f.max);
      }
    }
  });

  it('never exceeds the ruleset maximum', () => {
    expect(scoreReadiness(FULL, AT).total).toBeLessThanOrEqual(MAX_POSSIBLE);
  });
});

describe('M25 - an absent input is absent, never zero', () => {
  it('reports every factor absent, with a reason, for a person we know nothing about', () => {
    const r = scoreReadiness(EMPTY, AT);
    expect(r.factors.every((f) => f.state === 'absent')).toBe(true);
    expect(r.factors.every((f) => f.points === null)).toBe(true);
    expect(r.factors.every((f) => (f.reason ?? '').length > 10)).toBe(true);
    expect(r.total).toBe(0);
    expect(r.coverage).toBe(0);
  });

  it('keeps an absent factor OUT of the denominator, so ignorance is not scored as weakness', () => {
    // The defect M24.1 to M24.3 fixed, one level up: if absent factors stayed in scoreableMax, a
    // person we know little about would look worse than one we know well and who did nothing.
    const known = scoreReadiness({ ...EMPTY, consentContact: true }, AT);
    expect(known.scoreableMax).toBeLessThan(scoreReadiness(FULL, AT).scoreableMax);
    expect(known.scoreableMax).toBe(5);
  });

  it('distinguishes a REAL zero from an absence - the control', () => {
    const absent = scoreReadiness({ ...EMPTY, enrolments: null }, AT);
    const realZero = scoreReadiness({ ...EMPTY, enrolments: 0 }, AT);
    const key = (r: ScoreResult) => r.factors.find((f) => f.key === 'enrolmentStarted');
    expect(key(absent)?.state).toBe('absent');
    expect(key(absent)?.points).toBeNull();
    expect(key(realZero)?.state).toBe('scored');
    expect(key(realZero)?.points).toBe(0);
    // Same total, different meaning, and the breakdown is where the difference lives.
    expect(absent.total).toBe(realZero.total);
    expect(absent.scoreableMax).not.toBe(realZero.scoreableMax);
  });

  it('reports coverage so a low score caused by absence is visible', () => {
    expect(scoreReadiness(FULL, AT).coverage).toBe(1);
    expect(scoreReadiness(EMPTY, AT).coverage).toBe(0);
  });
});

describe('M25 - DECISION 3: browsing cannot accumulate into commitment', () => {
  it('a hundred page views score below ONE enrolment start', () => {
    const browsing = scoreReadiness(
      { ...EMPTY, pageEvents: 100000, siteSessions: 100000 }, AT,
    );
    const oneEnrolment = scoreReadiness({ ...EMPTY, enrolments: 1 }, AT);
    expect(browsing.total).toBeLessThan(oneEnrolment.total);
  });

  it('caps the passive BAND, not merely each passive factor', () => {
    const r = scoreReadiness({ ...EMPTY, pageEvents: 999999, siteSessions: 999999 }, AT);
    expect(r.total).toBe(PASSIVE_CAP);
  });

  it('the ruleset itself keeps the cap below the smallest commitment factor', () => {
    // Expressed as a number so a future weight change cannot quietly break the rule.
    expect(PASSIVE_CAP).toBeLessThan(SMALLEST_COMMITMENT);
  });
});

describe('M25 - DECISION 4: friction suppresses the action, not the score', () => {
  it('payment failures never reduce the total', () => {
    const none = scoreReadiness({ ...FULL, paymentFailures: 0 }, AT);
    const many = scoreReadiness({ ...FULL, paymentFailures: 9 }, AT);
    expect(many.total).toBe(none.total);
  });

  it('but the friction is reported, so the queue can act on it', () => {
    expect(scoreReadiness({ ...FULL, paymentFailures: 9 }, AT).frictionFlag).toBe(true);
    expect(scoreReadiness({ ...FULL, paymentFailures: 0 }, AT).frictionFlag).toBe(false);
  });
});

describe('M25 - monotonicity: more evidence of readiness never scores lower', () => {
  const MORE: Array<[keyof SrsInputs, number, number]> = [
    ['intentScore', 10, 90],
    ['inboundReplies', 0, 4],
    ['siteSessions', 1, 30],
    ['pageEvents', 5, 150],
    ['daysKnown', 5, 200],
    ['enrolments', 0, 1],
    ['appointments', 0, 2],
  ];

  it.each(MORE)('raising %s from %i to %i never lowers the total', (field, low, high) => {
    const lo = scoreReadiness({ ...EMPTY, [field]: low } as SrsInputs, AT);
    const hi = scoreReadiness({ ...EMPTY, [field]: high } as SrsInputs, AT);
    expect(hi.total).toBeGreaterThanOrEqual(lo.total);
  });
});

describe('M25 - one named test per factor, so a mutation to any of them kills something', () => {
  /** For each factor: an input that scores it, and the points it must then be worth. */
  const CASES: Array<[string, Partial<SrsInputs>, number]> = [
    ['enrolmentStarted', { enrolments: 1 }, 40],
    ['appointmentBooked', { appointments: 1 }, 35],
    ['humanReply', { inboundReplies: 2 }, 30],
    ['intent', { intentScore: 100 }, 20],
    ['explorerBands', { explorerEngagement: 100, explorerIntent: 100 }, 12],
    ['priorOutcome', { priorHistoryAvailable: true, priorEnrolments: 1 }, 10],
    ['tenure', { daysKnown: 90 }, 5],
    ['consent', { consentContact: true }, 5],
    ['siteSessions', { siteSessions: 10 }, 8],
    ['pageEvents', { pageEvents: 40 }, 7],
    ['recency', { lastActivityAt: AT }, 25],
    ['friction', { paymentFailures: 1 }, 0],
  ];

  it('covers every factor in the ruleset', () => {
    expect(CASES.map((c) => c[0]).sort()).toEqual(FACTORS.map((f) => f.key).sort());
  });

  it.each(CASES)('%s scores exactly its maximum when its evidence is at full strength',
    (key, patch, points) => {
      const r = scoreReadiness({ ...EMPTY, ...patch } as SrsInputs, AT);
      const f = r.factors.find((x) => x.key === key);
      expect(f?.state).toBe('scored');
      expect(f?.points).toBe(points);
    });

  it.each(CASES)('%s is absent, not zero, when its evidence is missing', (key) => {
    const f = scoreReadiness(EMPTY, AT).factors.find((x) => x.key === key);
    expect(f?.state).toBe('absent');
    expect(f?.points).toBeNull();
    expect(f?.reason).toBeTruthy();
  });

  it('every factor cites an evidence group, so a point traces back to the M24 contract', () => {
    for (const f of scoreReadiness(EMPTY, AT).factors) {
      expect(f.evidenceGroup.length).toBeGreaterThan(0);
    }
  });
});
