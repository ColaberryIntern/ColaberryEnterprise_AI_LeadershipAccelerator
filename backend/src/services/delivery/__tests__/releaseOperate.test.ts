/**
 * Gate 14 — Release + Operate + GOALS.
 *
 * Three properties carry this gate: **deployment is never authorized**, **`not_run` is not
 * `pass`**, and **a production signal proposes rather than acts**. Each is asserted against
 * behaviour rather than trusted from a comment.
 */

import {
  PROFILE_MANDATORY_CHECKS,
  RELEASE_CHECKS,
  RELEASE_CHECK_MEANING,
  isReleaseCheck,
  mandatoryChecksFor,
  type ReleaseCheck,
  type ReleaseCheckResult,
} from '../../../modules/delivery/releaseChecks';
import { assertDeploymentAuthorized, evaluateReleaseGate } from '../releaseGate';
import {
  CANDIDATE_KINDS,
  OPERATE_SIGNALS,
  assessSignal,
  hasReading,
  isOperateSignal,
  notObserved,
  proposeCandidate,
  type SignalReading,
} from '../operateSignals';

const pass = (check: ReleaseCheck): ReleaseCheckResult => ({ check, outcome: 'pass' });
const allPassing = (checks: readonly ReleaseCheck[]) => checks.map(pass);

// ---------------------------------------------------------------------------
// Release checks
// ---------------------------------------------------------------------------

describe('release checks', () => {
  it('declares the master plan’s ten checks, each explained', () => {
    expect(RELEASE_CHECKS).toHaveLength(10);
    for (const c of RELEASE_CHECKS) expect(RELEASE_CHECK_MEANING[c].length).toBeGreaterThan(15);
  });

  it('includes migration_rehearsal — the one this repository currently fails', () => {
    expect(RELEASE_CHECKS).toContain('migration_rehearsal');
  });

  it('government takes every check; internal tool takes fewer', () => {
    expect(mandatoryChecksFor('government_public_sector')).toHaveLength(RELEASE_CHECKS.length);
    expect(mandatoryChecksFor('internal_tool').length).toBeLessThan(RELEASE_CHECKS.length);
  });

  it('every profile’s mandatory list names only real checks', () => {
    // A profile naming a check nobody defines would be a silent no-op, and a silent no-op
    // in a release gate looks like coverage.
    for (const [profile, checks] of Object.entries(PROFILE_MANDATORY_CHECKS)) {
      for (const c of checks) expect({ profile, ok: isReleaseCheck(c) }).toEqual({ profile, ok: true });
    }
  });

  it('an unknown profile falls back to ALL checks, not none', () => {
    // Fail closed: an unrecognised profile must not be the cheapest one to ship under.
    expect(mandatoryChecksFor('something_new')).toHaveLength(RELEASE_CHECKS.length);
  });
});

// ---------------------------------------------------------------------------
// The release gate
// ---------------------------------------------------------------------------

describe('evaluateReleaseGate', () => {
  const gov = 'government_public_sector';

  it('is ready when every mandatory check passes and a person approved', () => {
    const result = evaluateReleaseGate({
      profileKey: gov,
      results: allPassing(mandatoryChecksFor(gov)),
      approvedByIdentityId: 'lead-1',
    });
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('blocks on a missing check result', () => {
    const checks = mandatoryChecksFor(gov);
    const result = evaluateReleaseGate({
      profileKey: gov,
      results: allPassing(checks.slice(1)),
      approvedByIdentityId: 'lead-1',
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => b.rule)).toContain('check_missing');
  });

  it('treats not_run as a blocker, not a pass', () => {
    const checks = mandatoryChecksFor(gov);
    const results = allPassing(checks);
    results[0] = { check: checks[0], outcome: 'not_run' };
    const result = evaluateReleaseGate({
      profileKey: gov,
      results,
      approvedByIdentityId: 'lead-1',
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => b.rule)).toContain('check_not_run');
  });

  it('blocks a release nobody approved', () => {
    // Every other blocker can in principle be satisfied by a machine. This one cannot.
    const result = evaluateReleaseGate({
      profileKey: gov,
      results: allPassing(mandatoryChecksFor(gov)),
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => b.rule)).toContain('approver_missing');
  });

  it('blocks on un-rehearsed migrations specifically', () => {
    const checks = mandatoryChecksFor(gov);
    const results = allPassing(checks).map((r) =>
      r.check === 'migration_rehearsal'
        ? { check: r.check, outcome: 'not_run' as const, detail: '19 tables never run against a real schema' }
        : r,
    );
    const result = evaluateReleaseGate({ profileKey: gov, results, approvedByIdentityId: 'lead-1' });
    expect(result.ready).toBe(false);
    expect(result.blockers.some((b) => b.check === 'migration_rehearsal')).toBe(true);
  });

  it('carries a Gate 13 waiver through as WAIVED, not as passed', () => {
    // "Ready" must never be quietly cheaper than it looks.
    const checks = mandatoryChecksFor(gov).filter((c) => c !== 'accessibility');
    const result = evaluateReleaseGate({
      profileKey: gov,
      results: allPassing(checks),
      waivedCategories: ['accessibility'],
      approvedByIdentityId: 'lead-1',
    });
    expect(result.ready).toBe(true);
    expect(result.waived).toContain('accessibility');
    expect(result.passed).not.toContain('accessibility');
  });

  it('applies the canonical GOALS threshold, where unscored is a failure', () => {
    const result = evaluateReleaseGate({
      profileKey: gov,
      results: allPassing(mandatoryChecksFor(gov)),
      approvedByIdentityId: 'lead-1',
      goalsScores: {},
      goalsThreshold: { minimumAll: 4 },
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => b.rule)).toContain('goals_below_threshold');
  });

  it('reports every blocker rather than the first', () => {
    const result = evaluateReleaseGate({ profileKey: gov, results: [] });
    expect(result.blockers.length).toBeGreaterThanOrEqual(RELEASE_CHECKS.length);
  });

  it('rejects an unknown check in the results', () => {
    const result = evaluateReleaseGate({
      profileKey: 'internal_tool',
      results: [{ check: 'vibes' as ReleaseCheck, outcome: 'pass' }],
      approvedByIdentityId: 'lead-1',
    });
    expect(result.blockers.map((b) => b.rule)).toContain('unknown_check');
  });
});

// ---------------------------------------------------------------------------
// Deployment authorization
// ---------------------------------------------------------------------------

describe('assertDeploymentAuthorized', () => {
  const readyRelease = () =>
    evaluateReleaseGate({
      profileKey: 'internal_tool',
      results: allPassing(mandatoryChecksFor('internal_tool')),
      approvedByIdentityId: 'lead-1',
    });

  it('REFUSES even a perfectly ready, human-approved release', () => {
    // The unconditional refusal. §20 does not authorize production deployment, and a
    // ready release must not become a deployed one the moment a provider appears.
    const refusals = assertDeploymentAuthorized({
      release: readyRelease(),
      approvedByIdentityId: 'lead-1',
    });
    expect(refusals.map((r) => r.rule)).toContain('not_authorized_by_plan');
    expect(refusals.length).toBeGreaterThan(0);
  });

  it('still reports the specific problems alongside the unconditional refusal', () => {
    // A caller fixing their release should not have to fix it twice.
    const notReady = evaluateReleaseGate({ profileKey: 'internal_tool', results: [] });
    const refusals = assertDeploymentAuthorized({ release: notReady });
    expect(refusals.map((r) => r.rule)).toEqual(
      expect.arrayContaining(['release_not_ready', 'human_approval_required', 'not_authorized_by_plan']),
    );
  });

  it('never returns an empty refusal list', () => {
    // The property that matters: there is no input for which deployment is authorized.
    expect(assertDeploymentAuthorized({ release: readyRelease(), approvedByIdentityId: 'x' }).length)
      .toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Operate signals
// ---------------------------------------------------------------------------

describe('operate signals', () => {
  const observed = (value: number): SignalReading => ({
    status: 'observed',
    signal: 'latency',
    value,
    observedAt: new Date('2026-08-24T12:00:00Z'),
  });

  it('declares the master plan’s ten signals and five candidate kinds', () => {
    expect(OPERATE_SIGNALS).toHaveLength(10);
    expect(CANDIDATE_KINDS).toHaveLength(5);
  });

  it('an unobserved signal is UNKNOWN, never healthy', () => {
    // A dashboard that renders green because no data arrived is the specific failure this
    // type exists to prevent — and the most likely one here, since no data has ever arrived.
    const health = assessSignal(notObserved('latency', 'nothing is deployed'), {
      signal: 'latency',
      degradedAt: 500,
      higherIsWorse: true,
    });
    expect(health).toBe('unknown');
  });

  it('assesses an observed signal in both directions', () => {
    const higherWorse = { signal: 'latency' as const, degradedAt: 500, higherIsWorse: true };
    expect(assessSignal(observed(200), higherWorse)).toBe('healthy');
    expect(assessSignal(observed(900), higherWorse)).toBe('degraded');

    const lowerWorse = { signal: 'availability' as const, degradedAt: 99, higherIsWorse: false };
    expect(assessSignal({ ...observed(99.9), signal: 'availability' }, lowerWorse)).toBe('healthy');
    expect(assessSignal({ ...observed(95), signal: 'availability' }, lowerWorse)).toBe('degraded');
  });

  it('hasReading never infers a value', () => {
    expect(hasReading(notObserved('cost', 'no deployment'))).toBe(false);
    expect(hasReading(observed(1))).toBe(true);
  });

  it('rejects an unknown signal', () => {
    expect(isOperateSignal('vibes')).toBe(false);
  });
});

describe('proposeCandidate', () => {
  const observed: SignalReading = {
    status: 'observed',
    signal: 'errors',
    value: 42,
    observedAt: new Date('2026-08-24T12:00:00Z'),
  };

  it('creates a proposal that requires human review and does NOT act', () => {
    const decision = proposeCandidate({
      kind: 'defect',
      signal: 'errors',
      summary: 'Error rate tripled after the 14:00 release.',
      evidence: observed,
    });
    expect(decision.created).toBe(true);
    if (decision.created) {
      expect(decision.candidate.status).toBe('proposed');
      expect(decision.candidate.requiresHumanReview).toBe(true);
    }
  });

  it('REFUSES to draw a conclusion from absent telemetry', () => {
    // "Latency is bad" inferred from no latency data is a fabrication.
    const decision = proposeCandidate({
      kind: 'optimization',
      signal: 'latency',
      summary: 'Latency looks high, we should add caching.',
      evidence: notObserved('latency', 'nothing is deployed'),
    });
    expect(decision.created).toBe(false);
    if (!decision.created) expect(decision.refusals.map((r) => r.rule)).toContain('no_observation');
  });

  it('ALLOWS a candidate about the missing measurement itself', () => {
    // "We are not measuring latency" is a real, often more important finding.
    const decision = proposeCandidate({
      kind: 'new_requirement',
      signal: 'latency',
      summary: 'We have no latency telemetry at all; add measurement before tuning anything.',
      evidence: notObserved('latency', 'nothing is deployed'),
      aboutMissingTelemetry: true,
    });
    expect(decision.created).toBe(true);
  });

  it('refuses an unknown kind or signal, and a thin summary', () => {
    expect(proposeCandidate({ kind: 'rewrite', signal: 'errors', summary: 'A reasonable summary here', evidence: observed }).created).toBe(false);
    expect(proposeCandidate({ kind: 'defect', signal: 'vibes', summary: 'A reasonable summary here', evidence: observed }).created).toBe(false);
    expect(proposeCandidate({ kind: 'defect', signal: 'errors', summary: 'bad', evidence: observed }).created).toBe(false);
  });

  it('exposes no way to apply a candidate', () => {
    // The control is the absence. Applying means creating a story or decision through the
    // ordinary gates, where a human approves it.
    const decision = proposeCandidate({
      kind: 'defect',
      signal: 'errors',
      summary: 'Error rate tripled after the 14:00 release.',
      evidence: observed,
    });
    if (!decision.created) throw new Error('expected a candidate');
    expect(Object.keys(decision.candidate)).not.toContain('apply');
    expect(decision.candidate.status).toBe('proposed');
  });
});
