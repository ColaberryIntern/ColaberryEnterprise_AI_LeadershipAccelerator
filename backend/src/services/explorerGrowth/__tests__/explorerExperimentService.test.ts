import {
  assignArm,
  bucket,
  computeLift,
  isHoldoutEligible,
  HOLDOUT_ELIGIBLE,
  MIN_ARM_N,
} from '../explorerExperimentService';

/**
 * Plan §25. The first describe block is the one that matters most, and it is
 * not about statistics.
 *
 * §25.2: "no learner is ever withheld from a message that helps them with a
 * problem they are actually having. Withholding a payment-failure recovery to
 * measure lift is not an experiment, it is negligence."
 */

const ids = (n: number) => Array.from({ length: n }, (_, i) => `enr-${i}`);

describe('a learner is never withheld from help they need (§25.2)', () => {
  it.each([
    'FRICTION_RECOVERY',
    'PAYMENT_FAILURE_RECOVERY',
    'SUPPORT_RESPONSE',
    'OPT_OUT_CONFIRMATION',
    'EVENT_LOGISTICS',
    'SECURITY_NOTICE',
  ])('never assigns %s to control, at any bucket', (intervention) => {
    // Every learner, not a sample: the guarantee is absolute, so a probabilistic
    // check would be the wrong shape of test.
    for (const id of ids(500)) {
      const a = assignArm({
        experimentKey: 'exp-1',
        enrollmentId: id,
        intervention,
        controlShare: 0.5,
      });
      expect(a.arm).toBe('treatment');
    }
  });

  it('says why it refused, rather than silently forcing treatment', () => {
    const a = assignArm({
      experimentKey: 'exp-1',
      enrollmentId: 'enr-1',
      intervention: 'FRICTION_RECOVERY',
      controlShare: 0.5,
    });
    expect(a.forcedReason).toContain('§25.2');
  });

  it('treats an UNKNOWN intervention as ineligible', () => {
    // Allowlist, not denylist: the cost of forgetting to classify a new
    // intervention must be a lost experiment, never a learner left without
    // help.
    expect(isHoldoutEligible('SOME_NEW_THING_ADDED_NEXT_QUARTER')).toBe(false);

    const a = assignArm({
      experimentKey: 'exp-1',
      enrollmentId: 'enr-1',
      intervention: 'SOME_NEW_THING_ADDED_NEXT_QUARTER',
      controlShare: 0.5,
    });
    expect(a.arm).toBe('treatment');
  });

  it('does allow the promotional interventions', () => {
    for (const i of HOLDOUT_ELIGIBLE) expect(isHoldoutEligible(i)).toBe(true);
  });

  it('withholds from nobody when controlShare is misconfigured', () => {
    for (const share of [0, -0.1, 0.9, NaN]) {
      const a = assignArm({
        experimentKey: 'exp-1',
        enrollmentId: 'enr-7',
        intervention: 'WEEKLY_DIGEST',
        controlShare: share,
      });
      expect(a.arm).toBe('treatment');
      expect(a.forcedReason).toBeDefined();
    }
  });
});

describe('assignment is stable', () => {
  it('gives the same arm every time for the same learner and experiment', () => {
    // A learner who flips between arms is in BOTH, which biases the result
    // toward whichever arm they engaged with, invisibly.
    const call = () =>
      assignArm({
        experimentKey: 'exp-1',
        enrollmentId: 'enr-42',
        intervention: 'WEEKLY_DIGEST',
        controlShare: 0.5,
      }).arm;

    const first = call();
    for (let i = 0; i < 50; i++) expect(call()).toBe(first);
  });

  it('is independent across experiments', () => {
    // Hashing the learner alone would put the same people in control every
    // time, making their traits the definition of "control" system-wide.
    const armFor = (key: string) =>
      ids(400).filter(
        (id) =>
          assignArm({
            experimentKey: key,
            enrollmentId: id,
            intervention: 'WEEKLY_DIGEST',
            controlShare: 0.5,
          }).arm === 'control',
      );

    const a = new Set(armFor('exp-a'));
    const b = armFor('exp-b');
    const overlap = b.filter((id) => a.has(id)).length;

    // Independent assignment puts ~50% of one experiment's control group in
    // the other's. Identical grouping would be ~100%.
    expect(overlap / b.length).toBeLessThan(0.75);
  });

  it('splits roughly in line with controlShare', () => {
    const control = ids(2000).filter(
      (id) =>
        assignArm({
          experimentKey: 'exp-1',
          enrollmentId: id,
          intervention: 'WEEKLY_DIGEST',
          controlShare: 0.2,
        }).arm === 'control',
    ).length;

    expect(control / 2000).toBeGreaterThan(0.15);
    expect(control / 2000).toBeLessThan(0.25);
  });

  it('produces buckets inside [0, 1)', () => {
    for (const id of ids(300)) {
      const b = bucket('exp-1', id);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(1);
    }
  });
});

describe('lift', () => {
  it('refuses below 100 per arm (§25.3)', () => {
    // An early experiment's "12% lift" is usually noise, and it is exactly the
    // number that gets screenshotted into a decision.
    const r = computeLift({ n: 99, converted: 20 }, { n: 200, converted: 20 });
    expect(r.lift.known).toBe(false);
    expect((r.lift as any).reason).toContain('99');
  });

  it('refuses when the CONTROL arm is short, not just treatment', () => {
    expect(computeLift({ n: 500, converted: 100 }, { n: 40, converted: 4 }).lift.known).toBe(false);
  });

  it('reports lift when both arms clear the bar', () => {
    const r = computeLift({ n: 500, converted: 100 }, { n: 500, converted: 50 });
    expect(r.lift.known).toBe(true);
    if (r.lift.known) expect(r.lift.point).toBeCloseTo(0.1, 6);
  });

  it('carries an interval that can straddle zero', () => {
    // A barely-different pair must not read as a real effect.
    const r = computeLift({ n: MIN_ARM_N, converted: 21 }, { n: MIN_ARM_N, converted: 20 });
    if (!r.lift.known) throw new Error('expected a measurement');
    expect(r.lift.low).toBeLessThan(0);
    expect(r.lift.high).toBeGreaterThan(0);
  });

  it('still reports each arm even when lift is refused', () => {
    // The arm rates are observed facts; only the comparison is unsupported.
    const r = computeLift({ n: 50, converted: 10 }, { n: 50, converted: 5 });
    expect(r.treatment.known).toBe(true);
    expect(r.control.known).toBe(true);
    expect(r.lift.known).toBe(false);
  });
});
