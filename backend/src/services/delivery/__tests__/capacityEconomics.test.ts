/**
 * Gate 12 — Multi-Project Capacity + Economics.
 *
 * Two constraints from master plan §Gate 12 pull against the tracking list in the same
 * section: *do not turn this into employee surveillance*, and *do not market externally
 * until methodology is validated*. Both are enforced in construction here rather than in
 * policy, and these tests are what make that claim checkable.
 */

import {
  CAPACITY_SIGNALS,
  PROJECT_ONLY_SIGNALS,
  SIGNAL_POLICY,
  decideSignalAccess,
  isCapacitySignal,
} from '../../../modules/delivery/capacitySignals';
import {
  ABSOLUTE_MAX_PARALLEL_PROJECTS,
  MAX_OVERRIDE_DAYS,
  assessOverload,
  decideCapacityOverride,
  effectiveMaxParallelProjects,
} from '../capacityOverride';
import {
  ECONOMIC_MEASURES,
  MEASURE_MEANING,
  MIN_THROUGHPUT_FOR_INTERPRETATION,
  THROUGHPUT_RATIO_VALIDATION,
  assertPublishable,
  buildEconomicsReport,
  computeThroughputRatio,
} from '../factoryEconomics';

const NOW = new Date('2026-08-24T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

// ---------------------------------------------------------------------------
// Capacity signals — the anti-surveillance construction
// ---------------------------------------------------------------------------

describe('capacity signals', () => {
  it('declares the master plan’s eleven signals', () => {
    expect(CAPACITY_SIGNALS).toHaveLength(11);
  });

  it('explains every signal', () => {
    for (const s of CAPACITY_SIGNALS) {
      expect(SIGNAL_POLICY[s].meaning.length).toBeGreaterThan(10);
    }
  });

  it('attention hours and meeting load can NEVER carry a person’s name', () => {
    // The two that become a productivity score with no denominator the moment they are
    // attributed. Pinned explicitly so a later edit has to argue with this test.
    expect(PROJECT_ONLY_SIGNALS).toContain('estimated_human_attention_hours');
    expect(PROJECT_ONLY_SIGNALS).toContain('meeting_load');
  });

  it('refuses an individual read of a project-only signal, whatever the justification', () => {
    const decision = decideSignalAccess({
      signal: 'meeting_load',
      scope: 'individual',
      justification: 'performance review preparation for the quarterly cycle',
      requestedByIdentityId: 'lead-1',
      sampleSize: 100,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusals.map((r) => r.rule)).toContain('signal_is_project_only');
    }
  });

  it('allows portfolio and project reads without ceremony', () => {
    // The control that keeps this usable. If ordinary reads needed justification, people
    // would route around the whole module with raw SQL.
    for (const scope of ['portfolio', 'project'] as const) {
      const decision = decideSignalAccess({ signal: 'meeting_load', scope });
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.auditRequired).toBe(false);
    }
  });

  it('requires a real justification for an individual read', () => {
    const decision = decideSignalAccess({
      signal: 'rework',
      scope: 'individual',
      justification: 'because',
      requestedByIdentityId: 'lead-1',
      sampleSize: 20,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusals.map((r) => r.rule)).toContain('justification_required');
    }
  });

  it('requires the requester to be named', () => {
    const decision = decideSignalAccess({
      signal: 'rework',
      scope: 'individual',
      justification: 'coaching conversation about repeated review findings',
      sampleSize: 20,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusals.map((r) => r.rule)).toContain('requester_unknown');
    }
  });

  it('refuses an individual rate computed from too small a sample', () => {
    const decision = decideSignalAccess({
      signal: 'rework',
      scope: 'individual',
      justification: 'coaching conversation about repeated review findings',
      requestedByIdentityId: 'lead-1',
      sampleSize: 2,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusals.map((r) => r.rule)).toContain('sample_too_small');
    }
  });

  it('ALLOWS a justified, named, well-sampled individual read — and audits it', () => {
    // The negative control. Without it, a module that refused everything would pass every
    // refusal test above while being useless for the coaching Gate 11 depends on.
    const decision = decideSignalAccess({
      signal: 'rework',
      scope: 'individual',
      justification: 'coaching conversation about repeated review findings',
      requestedByIdentityId: 'lead-1',
      sampleSize: 20,
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.auditRequired).toBe(true);
  });

  it('rejects an unknown signal', () => {
    expect(isCapacitySignal('keystrokes')).toBe(false);
    expect(decideSignalAccess({ signal: 'keystrokes', scope: 'project' }).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Capacity overrides
// ---------------------------------------------------------------------------

describe('capacity override', () => {
  const good = {
    builderIdentityId: 'builder-1',
    grantedByIdentityId: 'lead-1',
    baseMaxParallelProjects: 3,
    overrideMaxParallelProjects: 5,
    reason: 'Covering for a colleague on leave through the end of the sprint.',
    expiresAt: inDays(14),
    now: NOW,
  };

  it('grants a well-formed, time-bounded override and requires an audit', () => {
    const decision = decideCapacityOverride(good);
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.effectiveMax).toBe(5);
      expect(decision.auditRequired).toBe(true);
    }
  });

  it('refuses an override that expires in the past', () => {
    const decision = decideCapacityOverride({ ...good, expiresAt: inDays(-1) });
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusals.map((r) => r.rule)).toContain('expiry_in_past');
  });

  it('refuses an override that runs longer than the maximum', () => {
    const decision = decideCapacityOverride({ ...good, expiresAt: inDays(MAX_OVERRIDE_DAYS + 5) });
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusals.map((r) => r.rule)).toContain('expiry_too_far');
  });

  it('refuses to exceed the absolute ceiling, whoever signs it', () => {
    const decision = decideCapacityOverride({
      ...good,
      overrideMaxParallelProjects: ABSOLUTE_MAX_PARALLEL_PROJECTS + 1,
    });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.refusals.map((r) => r.rule)).toContain('exceeds_absolute_ceiling');
    }
  });

  it('refuses a placeholder reason', () => {
    const decision = decideCapacityOverride({ ...good, reason: 'busy' });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.refusals.map((r) => r.rule)).toContain('reason_insufficient');
    }
  });

  it('refuses an override that is not actually an increase', () => {
    const decision = decideCapacityOverride({ ...good, overrideMaxParallelProjects: 3 });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.refusals.map((r) => r.rule)).toContain('override_not_an_increase');
    }
  });

  it('an expired override falls back to the profile cap automatically', () => {
    // The reason expiry is mandatory: nobody has to remember to revoke anything.
    const expired = { overrideMaxParallelProjects: 6, expiresAt: inDays(-1) };
    expect(effectiveMaxParallelProjects(3, expired, NOW)).toBe(3);
  });

  it('a live override raises the cap, clamped to the absolute ceiling', () => {
    expect(effectiveMaxParallelProjects(3, { overrideMaxParallelProjects: 6, expiresAt: inDays(5) }, NOW)).toBe(6);
    expect(
      effectiveMaxParallelProjects(
        3,
        { overrideMaxParallelProjects: 99, expiresAt: inDays(5) },
        NOW,
      ),
    ).toBe(ABSOLUTE_MAX_PARALLEL_PROJECTS);
  });

  it('no override at all leaves the profile cap untouched', () => {
    expect(effectiveMaxParallelProjects(3, null, NOW)).toBe(3);
  });
});

describe('assessOverload', () => {
  it('flags a builder over their effective cap', () => {
    const out = assessOverload({
      activeProjects: 5,
      baseMaxParallelProjects: 3,
      override: null,
      now: NOW,
    });
    expect(out.overloaded).toBe(true);
    expect(out.effectiveMax).toBe(3);
  });

  it('surfaces when someone is only within capacity BECAUSE of an override', () => {
    // "Within capacity" and "within capacity only because someone signed an exception
    // three weeks ago" are different situations a lead should not have to go looking for.
    const out = assessOverload({
      activeProjects: 5,
      baseMaxParallelProjects: 3,
      override: { overrideMaxParallelProjects: 6, expiresAt: inDays(5) },
      now: NOW,
    });
    expect(out.overloaded).toBe(false);
    expect(out.reliesOnOverride).toBe(true);
  });

  it('does not claim reliance when the builder is inside the base cap anyway', () => {
    const out = assessOverload({
      activeProjects: 2,
      baseMaxParallelProjects: 3,
      override: { overrideMaxParallelProjects: 6, expiresAt: inDays(5) },
      now: NOW,
    });
    expect(out.reliesOnOverride).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Factory economics
// ---------------------------------------------------------------------------

describe('factory economics', () => {
  it('declares the master plan’s six measures, each explained', () => {
    expect(ECONOMIC_MEASURES).toHaveLength(6);
    for (const m of ECONOMIC_MEASURES) expect(MEASURE_MEANING[m].length).toBeGreaterThan(10);
  });

  it('the throughput ratio is UNVALIDATED, in code', () => {
    // A sentence in a plan is read once. This value travels with every computed ratio.
    expect(THROUGHPUT_RATIO_VALIDATION).toBe('unvalidated');
  });

  it('computes throughput over human judgment effort', () => {
    const ratio = computeThroughputRatio({ verifiedThroughput: 20, humanJudgmentEffort: 5 });
    expect(ratio.value).toBe(4);
    expect(ratio.validation).toBe('unvalidated');
    expect(ratio.caveat).toMatch(/unvalidated/i);
  });

  it('returns null, not Infinity, when nobody has reviewed anything', () => {
    // Zero human judgment effort does not mean infinite efficiency, and Infinity on a
    // dashboard is exactly the number that gets screenshotted.
    const ratio = computeThroughputRatio({ verifiedThroughput: 20, humanJudgmentEffort: 0 });
    expect(ratio.value).toBeNull();
    expect(ratio.interpretable).toBe(false);
  });

  it('is not interpretable below the minimum throughput', () => {
    const thin = computeThroughputRatio({
      verifiedThroughput: MIN_THROUGHPUT_FOR_INTERPRETATION - 1,
      humanJudgmentEffort: 2,
    });
    expect(thin.value).not.toBeNull();
    expect(thin.interpretable).toBe(false);
  });

  it('REFUSES external and client publication while unvalidated', () => {
    const ratio = computeThroughputRatio({ verifiedThroughput: 50, humanJudgmentEffort: 10 });
    for (const audience of ['external', 'client'] as const) {
      const refusals = assertPublishable(ratio, audience);
      expect(refusals.map((r) => r.rule)).toContain('methodology_unvalidated');
    }
  });

  it('permits internal use', () => {
    // The negative control: a guard that blocked everything would make the metric useless
    // for the internal purpose the plan actually asked for.
    const ratio = computeThroughputRatio({ verifiedThroughput: 50, humanJudgmentEffort: 10 });
    expect(assertPublishable(ratio, 'internal')).toEqual([]);
  });

  it('a client is not an internal audience', () => {
    // A number shown to a client becomes a claim about what they are buying.
    const ratio = computeThroughputRatio({ verifiedThroughput: 50, humanJudgmentEffort: 10 });
    expect(assertPublishable(ratio, 'client').length).toBeGreaterThan(0);
  });

  it('omits absent measures rather than reporting them as zero', () => {
    // Zero cost and unmeasured cost are different facts, and a dashboard cannot tell them
    // apart once they look the same.
    const report = buildEconomicsReport({ verifiedThroughput: 10, humanJudgmentEffort: 4 });
    expect('execution_cost' in report.measures).toBe(false);
    expect('elapsed_delivery_time' in report.measures).toBe(false);
    expect(report.reworkRate).toBeNull();
  });

  it('includes measures that were supplied', () => {
    const report = buildEconomicsReport({
      verifiedThroughput: 10,
      humanJudgmentEffort: 4,
      executionCostCents: 12_345,
      elapsedDeliveryHours: 96,
      reworkCount: 2,
      acceptanceCount: 3,
    });
    expect(report.measures.execution_cost).toBe(12_345);
    expect(report.reworkRate).toBeCloseTo(0.2);
  });
});
