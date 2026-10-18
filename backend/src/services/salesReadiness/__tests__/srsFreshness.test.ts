/**
 * M27 - every score carries an as-of, a stale score is labelled rather than hidden, and the
 * boundaries are tested on both sides.
 *
 * The case that matters most is RECOMPUTATION CANNOT BUY FRESHNESS: a score computed one second
 * ago over week-old evidence must read as week-old. Without that, re-running the batch would make
 * every score look current without a single new fact entering the system.
 */
import { assessFreshness, FRESHNESS_HOURS } from '../srsFreshness';
import { RULESET_VERSION } from '../srsRuleset';
import { scoreReadiness, SrsInputs } from '../srsEngine';

/** Every input absent, for the two cases that score a real person. */
const EMPTY_INPUTS: SrsInputs = {
  daysKnown: null, intentScore: null, inboundReplies: null, paymentFailures: null,
  priorHistoryAvailable: null, priorEnrolments: null, explorerEngagement: null,
  explorerIntent: null, consentContact: null, siteSessions: null, pageEvents: null,
  enrolments: null, appointments: null, evidenceAsOf: null, lastActivityAt: null,
};

const NOW = '2026-10-18T12:00:00.000Z';
/** `h` hours before NOW, as ISO. */
const ago = (h: number) => new Date(Date.parse(NOW) - h * 3600000).toISOString();

describe('M27 - every score carries an as-of time', () => {
  it('reports the as-of, the age and the ruleset on a fresh score', () => {
    const f = assessFreshness({ computedAt: ago(1) }, NOW);
    expect(f.effectiveAsOf).toBe(ago(1));
    expect(f.ageHours).toBe(1);
    expect(f.state).toBe('fresh');
    expect(f.rulesetVersion).toBe(RULESET_VERSION);
    expect(f.label.length).toBeGreaterThan(10);
  });

  it('never returns an empty label, in any state', () => {
    for (const h of [0, 1, 25, 100, 10000]) {
      expect(assessFreshness({ computedAt: ago(h) }, NOW).label.length).toBeGreaterThan(10);
    }
  });
});

describe('M27 - recomputation cannot buy freshness', () => {
  it('is bound by the EVIDENCE when the evidence is older than the computation', () => {
    // Computed one second ago; the evidence is a week old. The honest answer is a week.
    const f = assessFreshness({ computedAt: ago(0.001), oldestEvidenceAt: ago(168) }, NOW);
    expect(f.boundBy).toBe('evidence');
    expect(f.ageHours).toBeCloseTo(168, 1);
    expect(f.state).toBe('stale');
    expect(f.label).toContain('oldest evidence');
  });

  it('is bound by the COMPUTATION when the evidence is newer - the control', () => {
    // Without this the rule could simply always pick the evidence date, which would be a
    // different wrong answer rather than a check.
    const f = assessFreshness({ computedAt: ago(5), oldestEvidenceAt: ago(1) }, NOW);
    expect(f.boundBy).toBe('computation');
    expect(f.ageHours).toBe(5);
  });

  it('falls back to the computation when nothing dated the evidence', () => {
    const f = assessFreshness({ computedAt: ago(2), oldestEvidenceAt: null }, NOW);
    expect(f.boundBy).toBe('computation');
    expect(f.ageHours).toBe(2);
  });
});

describe('M27 - the boundaries, from both sides', () => {
  it(`is fresh just under ${FRESHNESS_HOURS.fresh}h and aging exactly at it`, () => {
    expect(assessFreshness({ computedAt: ago(FRESHNESS_HOURS.fresh - 0.01) }, NOW).state)
      .toBe('fresh');
    expect(assessFreshness({ computedAt: ago(FRESHNESS_HOURS.fresh) }, NOW).state)
      .toBe('aging');
  });

  it(`is aging just under ${FRESHNESS_HOURS.aging}h and stale exactly at it`, () => {
    expect(assessFreshness({ computedAt: ago(FRESHNESS_HOURS.aging - 0.01) }, NOW).state)
      .toBe('aging');
    expect(assessFreshness({ computedAt: ago(FRESHNESS_HOURS.aging) }, NOW).state)
      .toBe('stale');
  });

  it('treats a score computed this instant as fresh, age zero', () => {
    const f = assessFreshness({ computedAt: NOW }, NOW);
    expect(f.ageHours).toBe(0);
    expect(f.state).toBe('fresh');
  });
});

describe('M27 - a stale score is LABELLED, not hidden', () => {
  it('still returns the as-of and the age when stale', () => {
    const f = assessFreshness({ computedAt: ago(500) }, NOW);
    expect(f.state).toBe('stale');
    expect(f.effectiveAsOf).toBe(ago(500));
    expect(f.ageHours).toBe(500);
    expect(f.label).toContain('STALE');
    expect(f.label).toContain('rather than hidden');
  });

  it('says plainly not to rank on it, which is the actionable half', () => {
    expect(assessFreshness({ computedAt: ago(500) }, NOW).label).toContain('do not rank on it');
  });
});

describe('M27 - dates that cannot be trusted', () => {
  it('reports unknown rather than fresh when the date does not parse', () => {
    const f = assessFreshness({ computedAt: 'not-a-date' }, NOW);
    expect(f.state).toBe('unknown');
    expect(f.ageHours).toBeNull();
    expect(f.effectiveAsOf).toBeNull();
    expect(f.label).toContain('not claimed to be current');
  });

  it('reports unknown when NOW itself does not parse', () => {
    expect(assessFreshness({ computedAt: ago(1) }, 'nonsense').state).toBe('unknown');
  });

  it('surfaces clock skew instead of silently clamping it away', () => {
    // A computation stamped in the future is a real condition in a multi-host system. The age
    // clamps to zero so nothing goes negative, but the reader is told why.
    const f = assessFreshness({ computedAt: ago(-5) }, NOW);
    expect(f.clockSkew).toBe(true);
    expect(f.ageHours).toBe(0);
    expect(f.label).toContain('clock reads ahead');
  });

  it('does NOT claim skew when the clocks agree - the control', () => {
    expect(assessFreshness({ computedAt: ago(1) }, NOW).clockSkew).toBe(false);
  });
});

describe('M27 - a score can be assessed from itself, with no second lookup', () => {
  it('carries the evidence date through, so the pair travels together', () => {
    // The point of threading `oldestEvidenceAt` onto the result: freshness is a property of the
    // score, not something a surface has to reassemble from the inputs it no longer has.
    const score = scoreReadiness(
      { ...EMPTY_INPUTS, consentContact: true, evidenceAsOf: ago(200) },
      ago(0.01),
    );
    expect(score.oldestEvidenceAt).toBe(ago(200));
    const f = assessFreshness(
      { computedAt: score.computedAt, oldestEvidenceAt: score.oldestEvidenceAt }, NOW,
    );
    expect(f.boundBy).toBe('evidence');
    expect(f.state).toBe('stale');
  });

  it('is bound by the computation when no input dated itself', () => {
    const score = scoreReadiness({ ...EMPTY_INPUTS, consentContact: true }, ago(1));
    expect(score.oldestEvidenceAt).toBeNull();
    expect(assessFreshness(
      { computedAt: score.computedAt, oldestEvidenceAt: score.oldestEvidenceAt }, NOW,
    ).boundBy).toBe('computation');
  });
});

describe('M27 - it is pure', () => {
  it('gives the same answer for the same inputs, and never reads the clock', () => {
    const args = { computedAt: ago(30), oldestEvidenceAt: ago(80) } as const;
    expect(assessFreshness(args, NOW)).toEqual(assessFreshness(args, NOW));
    // A different `now` must change the answer, proving `now` is what it reads.
    expect(assessFreshness(args, ago(-100)).ageHours)
      .not.toBe(assessFreshness(args, NOW).ageHours);
  });
});
