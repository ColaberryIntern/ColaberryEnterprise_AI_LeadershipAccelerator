import {
  evaluateCoverage,
  evaluateStaleness,
  evaluateDecisionVolume,
  evaluateSuppressionRate,
  evaluateHealth,
  worstSeverity,
  STALE_AFTER_HOURS,
  type HealthInputs,
} from '../explorerGrowthHealthService';

/**
 * EPIC 13 health checks.
 *
 * The coverage block is the reason this file exists. On 2026-09-07 the nightly
 * recompute was found to iterate the profiles table, so it could only refresh
 * learners who already had a row — 212 active Explorers, 152 profiles, 60
 * invisible, and the batch reported `succeeded: 152, failed: 0`. Nothing was
 * stale, nothing errored, every metric was green.
 *
 * The lesson encoded here: a check that counts the population it is checking
 * will never find the population it is missing.
 */

const inputs = (over: Partial<HealthInputs> = {}): HealthInputs => ({
  activeExplorers: 212,
  profilesTotal: 212,
  profilesStale: 0,
  decisionsToday: 40,
  decisionBaselineMean: 42,
  candidatesEvaluated: 200,
  candidatesSuppressed: 120,
  ...over,
});

describe('coverage — the check that would have caught the September incident', () => {
  it('is CRITICAL when active Explorers have no profile', () => {
    const f = evaluateCoverage(212, 152);
    expect(f.severity).toBe('critical');
    expect(f.error_class).toBe('ProfileCoverageGap');
  });

  it('reports the real numbers, not just a status', () => {
    const f = evaluateCoverage(212, 152);
    expect(f.detail).toContain('60');
    expect(f.detail).toContain('212');
    expect(f.detail).toContain('28%');
  });

  it('is critical at a single missing learner, not only at scale', () => {
    // A missing profile is not a degraded signal. That learner is absent from
    // every roster, forecast stage and decision.
    expect(evaluateCoverage(212, 211).severity).toBe('critical');
  });

  it('is ok only at full coverage', () => {
    expect(evaluateCoverage(212, 212).severity).toBe('ok');
  });

  it('warns when there are more profiles than active learners', () => {
    // Two populations counted over different windows: the denominator is wrong
    // and every rate derived from it is wrong too.
    const f = evaluateCoverage(100, 140);
    expect(f.severity).toBe('warn');
    expect(f.error_class).toBe('CoverageInverted');
  });

  it('warns rather than reporting ok on an empty population', () => {
    // 0 of 0 is technically full coverage. It is also not a working system.
    expect(evaluateCoverage(0, 0).severity).toBe('warn');
  });
});

describe('staleness (§8.3)', () => {
  it('is ok when everything was recomputed inside the window', () => {
    const f = evaluateStaleness(212, 0);
    expect(f.severity).toBe('ok');
    expect(f.detail).toContain(String(STALE_AFTER_HOURS));
  });

  it('warns on partial staleness', () => {
    expect(evaluateStaleness(212, 5).severity).toBe('warn');
  });

  it('escalates to critical when half or more are stale', () => {
    // Wholesale staleness is a cron that is not running, not a slow night.
    const f = evaluateStaleness(212, 106);
    expect(f.severity).toBe('critical');
    expect(f.error_class).toBe('RecomputeNotRunning');
  });

  it('cannot see a learner with no profile at all', () => {
    // The whole point of the coverage check existing separately: 152 profiles
    // all recomputed on time reads as perfectly healthy here.
    expect(evaluateStaleness(152, 0).severity).toBe('ok');
  });
});

describe('decision volume', () => {
  it('is critical at zero against a real baseline', () => {
    // "No decisions" reads as calm on a chart and is the loudest signal there is.
    const f = evaluateDecisionVolume(0, 42);
    expect(f.severity).toBe('critical');
    expect(f.error_class).toBe('DecisionVolumeZero');
  });

  it('is critical on a spike, not only on a collapse', () => {
    // On a send-enabled path, 3x normal is the shape of an incident.
    expect(evaluateDecisionVolume(200, 42).severity).toBe('critical');
  });

  it('warns on a sharp drop', () => {
    expect(evaluateDecisionVolume(10, 42).severity).toBe('warn');
  });

  it('is ok in the normal band', () => {
    expect(evaluateDecisionVolume(40, 42).severity).toBe('ok');
  });

  it('does not alarm before a baseline exists', () => {
    expect(evaluateDecisionVolume(0, 0).severity).toBe('ok');
  });
});

describe('suppression rate', () => {
  it('treats a high rate as healthy', () => {
    // WAIT is by design the most common outcome; contact policy exists to say no.
    expect(evaluateSuppressionRate(180, 200).severity).toBe('ok');
  });

  it('is critical when everything is suppressed', () => {
    const f = evaluateSuppressionRate(200, 200);
    expect(f.severity).toBe('critical');
    expect(f.error_class).toBe('SuppressionTotal');
  });

  it('warns when nothing is suppressed', () => {
    // A gate that stopped applying looks like a productive day.
    const f = evaluateSuppressionRate(0, 200);
    expect(f.severity).toBe('warn');
    expect(f.error_class).toBe('SuppressionAbsent');
  });

  it('is quiet with no candidates', () => {
    expect(evaluateSuppressionRate(0, 0).severity).toBe('ok');
  });
});

describe('the report is only as healthy as its worst check', () => {
  it('is ok when everything is ok', () => {
    expect(evaluateHealth(inputs()).severity).toBe('ok');
  });

  it('reports critical when one check is critical, however good the rest look', () => {
    const r = evaluateHealth(inputs({ profilesTotal: 152 }));
    expect(r.severity).toBe('critical');
    expect(r.findings.find((f) => f.check === 'coverage')?.severity).toBe('critical');
  });

  it('does not let a warn mask a critical', () => {
    expect(worstSeverity([{ check: 'a', severity: 'warn', detail: '' }, { check: 'b', severity: 'critical', detail: '' }])).toBe('critical');
  });

  it('runs every check every time', () => {
    const r = evaluateHealth(inputs());
    expect(r.findings.map((f) => f.check).sort()).toEqual([
      'coverage',
      'decision_volume',
      'staleness',
      'suppression_rate',
    ]);
  });

  it('reproduces the September state as critical', () => {
    // 212 active, 152 profiled, none stale, decisions flowing: the exact
    // configuration that reported succeeded:152 failed:0 and looked fine.
    const r = evaluateHealth(
      inputs({ activeExplorers: 212, profilesTotal: 152, profilesStale: 0 }),
    );
    expect(r.severity).toBe('critical');
    expect(r.findings.find((f) => f.check === 'staleness')?.severity).toBe('ok');
  });

  it('flags PRODUCTION AS IT STOOD on 2026-09-07, measured not imagined', () => {
    // Read off accelerator_prod at 17:5x UTC, before the first fixed recompute:
    //   213 active Explorers · 152 with a profile · 153 of 153 profiles > 26h
    //
    // Note 213, not 212. One more Explorer signed up during the day and was
    // born invisible — which is the point about the gap growing with every
    // signup, in a single number.
    const r = evaluateHealth(
      inputs({ activeExplorers: 213, profilesTotal: 152, profilesStale: 152 }),
    );

    const coverage = r.findings.find((f) => f.check === 'coverage')!;
    const staleness = r.findings.find((f) => f.check === 'staleness')!;

    expect(r.severity).toBe('critical');
    expect(coverage.severity).toBe('critical');
    expect(coverage.detail).toContain('61');
    expect(staleness.severity).toBe('critical');
    expect(staleness.error_class).toBe('RecomputeNotRunning');
  });
});
