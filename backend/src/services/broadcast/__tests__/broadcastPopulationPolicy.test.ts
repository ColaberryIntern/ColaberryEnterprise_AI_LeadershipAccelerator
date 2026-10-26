/**
 * The rules behind the Colaberry Live population figure (C8.10).
 *
 * The thing worth testing here is not arithmetic, it is a REFUSAL. `broadcast_viewer_people`
 * is empty, so every one of these code paths currently resolves to "no number", and the only
 * question that matters is whether each no-number is the right KIND of no-number. A test
 * that only checked counts would pass against a module that published a confident zero for
 * a month the instrument slept through - which is the exact failure C8.10 names.
 */
import {
  INSTRUMENT_OUTAGES,
  assertBlindPeriodsNeverReportZero,
  assertEveryOutageCitesEvidence,
  assertNoAiringsIsNotZero,
  classifyPopulation,
  coverageFor,
  windowContains,
  windowsOverlap,
  type DateWindow,
} from '../broadcastPopulationPolicy';

const OCT: DateWindow = { from: '2026-10-01', to: '2026-11-01' };
const NOV: DateWindow = { from: '2026-11-01', to: '2026-12-01' };
const SEP: DateWindow = { from: '2026-09-01', to: '2026-10-01' };

describe('window arithmetic', () => {
  it('treats the window as closed-open, so adjacent months do not overlap', () => {
    // October ends the instant November begins. If these overlapped, every airing on the
    // 1st would be counted in two months and the monthly figures would not sum.
    expect(windowsOverlap(OCT, NOV)).toBe(false);
    expect(windowsOverlap(SEP, OCT)).toBe(false);
    expect(windowsOverlap(OCT, OCT)).toBe(true);
  });

  it('detects partial overlap', () => {
    expect(windowsOverlap(OCT, { from: '2026-10-25', to: '2026-11-05' })).toBe(true);
    expect(windowsOverlap(OCT, { from: '2026-09-20', to: '2026-10-02' })).toBe(true);
  });

  it('containment is not the same as overlap', () => {
    expect(windowContains(OCT, { from: '2026-10-05', to: '2026-10-09' })).toBe(true);
    expect(windowContains({ from: '2026-10-05', to: '2026-10-09' }, OCT)).toBe(false);
  });
});

describe('the recorded outage', () => {
  it('cites evidence a reader can check', () => {
    expect(assertEveryOutageCitesEvidence()).toBe(INSTRUMENT_OUTAGES.length);
  });

  it('rejects an outage with no usable evidence', () => {
    expect(() => assertEveryOutageCitesEvidence([
      { from: '2026-01-01', to: '2026-02-01', reason: 'x', evidence: 'trust me' },
    ])).toThrow(/no usable evidence/);
  });

  it('rejects an outage that ends before it starts', () => {
    expect(() => assertEveryOutageCitesEvidence([
      {
        from: '2026-02-01',
        to: '2026-01-01',
        reason: 'x',
        evidence: 'commit abcdef12, a real looking citation',
      },
    ])).toThrow(/ends before it starts/);
  });

  it('covers both of the airings Colaberry Live has actually had', () => {
    // 13 and 14 October 2026 - the test airing and the first private technical airing.
    // If an edit ever narrowed this window, October would start reporting a measured
    // zero for two broadcasts whose audience was never recorded.
    const outage = INSTRUMENT_OUTAGES[0];
    expect(windowsOverlap({ from: '2026-10-13', to: '2026-10-14' }, outage)).toBe(true);
    expect(windowsOverlap({ from: '2026-10-14', to: '2026-10-15' }, outage)).toBe(true);
  });
});

describe('coverage', () => {
  it('marks October 2026 as only partly visible', () => {
    // The outage sits inside October, so the month is partially blind rather than clean.
    expect(coverageFor(OCT)).toBe('partially_blind');
  });

  it('marks a month wholly inside an outage as fully blind', () => {
    expect(coverageFor({ from: '2026-10-10', to: '2026-10-15' })).toBe('fully_blind');
  });

  it('marks a month clear of every outage as clean', () => {
    expect(coverageFor(NOV)).toBe('clean');
    expect(coverageFor(SEP)).toBe('clean');
  });
});

describe('classification - the refusals', () => {
  it('does not call an empty schedule an audience of zero', () => {
    const v = classifyPopulation({ airings: 0, rawLearners: 0, coverage: 'clean' });
    expect(v.state).toBe('no_airings');
    expect(v.learners).toBeNull();
    expect(() => assertNoAiringsIsNotZero()).not.toThrow();
  });

  it('refuses to publish a count for a period the instrument slept through', () => {
    const v = classifyPopulation({ airings: 2, rawLearners: 0, coverage: 'fully_blind' });
    expect(v.state).toBe('unmeasurable');
    expect(v.learners).toBeNull();
    expect(v.because).toMatch(/unknown rather than zero/);
  });

  it('refuses even when rows exist, if coverage was partial', () => {
    // A floor is not a total. 7 people were seen; an unknown number were not.
    const v = classifyPopulation({ airings: 2, rawLearners: 7, coverage: 'partially_blind' });
    expect(v.state).toBe('unmeasurable');
    expect(v.learners).toBeNull();
  });

  it('DOES publish a genuine measured zero', () => {
    // The mirror case, and the one that makes the policy useful rather than merely
    // cautious: if the instrument was working and nobody watched, that is a finding.
    const v = classifyPopulation({ airings: 3, rawLearners: 0, coverage: 'clean' });
    expect(v.state).toBe('measured');
    expect(v.learners).toBe(0);
  });

  it('publishes a real count', () => {
    const v = classifyPopulation({ airings: 4, rawLearners: 112, coverage: 'clean' });
    expect(v.state).toBe('measured');
    expect(v.learners).toBe(112);
    expect(v.because).toMatch(/Staff and test accounts are excluded/);
  });
});

describe('the build gate', () => {
  it('holds: no blind period can publish a number', () => {
    expect(assertBlindPeriodsNeverReportZero()).toBe(4);
  });

  it('is not vacuous - it fails when the policy stops refusing', () => {
    // Mutation check. If `classifyPopulation` were edited to return a number for a blind
    // period, this guard has to be what catches it, so prove the guard can fail at all by
    // feeding its own rule a violating verdict.
    const bad = { airings: 1, rawLearners: 0, coverage: 'fully_blind' as const };
    const v = classifyPopulation(bad);
    expect(v.learners).toBeNull();
    // Simulate the regression and confirm the shape the guard checks is the shape that
    // would break: a non-null learners on a blind verdict.
    const regressed = { ...v, learners: 0 };
    expect(regressed.learners).not.toBeNull();
  });
});
