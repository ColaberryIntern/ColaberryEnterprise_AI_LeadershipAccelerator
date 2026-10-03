/**
 * P3-T5 — measures that cannot be made to flatter.
 *
 * Every number here is hand-computable, deliberately: a test whose expected value came out of the
 * implementation proves only that the implementation is self-consistent. Values are chosen to
 * divide cleanly so no assertion needs a float tolerance.
 */

import {
  measureAutomation,
  checkTargetDisclosure,
  renderShare,
  AI_SHARE_TARGET,
  EFFORT_CODES,
  type EffortAssessment,
} from '../effortMeasures';

const a = (over: Partial<EffortAssessment> & Pick<EffortAssessment, 'taskId' | 'executionClass'>): EffortAssessment => ({
  minutesPerOccurrence: 10, basis: 'ESTIMATED', occurrencesPerMonth: 1, ...over,
});

describe('the target is a target', () => {
  it('is 85%, and belowTarget is a disclosure flag rather than a pass/fail', () => {
    expect(AI_SHARE_TARGET).toBe(0.85);
  });

  it('declares its codes', () => {
    expect([...EFFORT_CODES]).toContain('BELOW_TARGET_UNEXPLAINED');
  });
});

describe('arithmetic, hand-computed', () => {
  it('splits AI and human by class', () => {
    // ai 10x1 = 10, human 30x1 = 30. total 40. ai share = 10/40 = 0.25 exactly.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 10 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 30 }),
    ]);
    expect(m.aiShare.fraction).toBe(0.25);
    expect(m.aiShare.numeratorMinutes).toBe(10);
    expect(m.aiShare.denominatorMinutes).toBe(40);
    expect(m.humanShare.fraction).toBe(0.75);
    expect(m.issues).toEqual([]);
  });

  it('weights by DECLARED occurrences, so a 20x task counts 20x', () => {
    // 5 min x 20/month = 100 AI; 100 min x 1 = 100 human. 100/200 = 0.5.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 5, occurrencesPerMonth: 20 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 100, occurrencesPerMonth: 1 }),
    ]);
    expect(m.aiShare.numeratorMinutes).toBe(100);
    expect(m.aiShare.fraction).toBe(0.5);
  });

  it('reports deterministic_software SEPARATELY and never inside the AI share', () => {
    // The cheapest way to inflate an "AI" number is to count the cron jobs.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'deterministic_software', minutesPerOccurrence: 60 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 40 }),
    ]);
    expect(m.aiShare.numeratorMinutes).toBe(0);
    expect(m.aiShare.fraction).toBe(0);
    expect(m.deterministicShare.fraction).toBe(0.6);
  });

  it('the three shares sum to 1 when anything is assessed', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 20 }),
      a({ taskId: 't2', executionClass: 'deterministic_software', minutesPerOccurrence: 20 }),
      a({ taskId: 't3', executionClass: 'human', minutesPerOccurrence: 60 }),
    ]);
    const sum = (m.aiShare.fraction as number)
      + (m.deterministicShare.fraction as number)
      + (m.humanShare.fraction as number);
    expect(sum).toBe(1);
  });
});

describe('a hybrid class cannot conceal the review minutes', () => {
  it('counts ai_with_approval execution as AI and its approval as HUMAN', () => {
    // exec 30x1 = 30 AI; approval 10x1 = 10 HUMAN. total 40. ai = 30/40 = 0.75, NOT 1.0.
    const m = measureAutomation([
      a({
        taskId: 't1', executionClass: 'ai_with_approval',
        minutesPerOccurrence: 30, approvalMinutesPerOccurrence: 10,
      }),
    ]);
    expect(m.aiShare.fraction).toBe(0.75);
    expect(m.humanShare.numeratorMinutes).toBe(10);
  });

  it('refuses ai_with_approval that states no approval minutes', () => {
    // Otherwise the class that most needs scrutiny would be the one that reports 100% automated.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_with_approval', approvalMinutesPerOccurrence: null }),
    ]);
    expect(m.issues.map((i) => i.code)).toEqual(['APPROVAL_EFFORT_MISSING']);
    expect(m.coverage.assessedTasks).toBe(0);
  });

  it('PASSING COUNTERPART: zero approval minutes is a statement, and is accepted', () => {
    // Explicit 0 differs from absent: somebody asserted the review is instantaneous. Implausible,
    // but stated and therefore reviewable, which is the distinction that matters.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_with_approval', approvalMinutesPerOccurrence: 0 }),
    ]);
    expect(m.issues).toEqual([]);
    expect(m.aiShare.fraction).toBe(1);
  });
});

describe('a zero denominator is "not assessed", never 0%', () => {
  it('returns null for every share when nothing is assessable', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'human', minutesPerOccurrence: null }),
    ]);
    expect(m.aiShare.fraction).toBeNull();
    expect(m.humanShare.fraction).toBeNull();
    expect(m.deterministicShare.fraction).toBeNull();
  });

  it('an empty input is not assessed either, and does not throw', () => {
    const m = measureAutomation([]);
    expect(m.aiShare.fraction).toBeNull();
    expect(m.coverage).toEqual({ assessedTasks: 0, totalTasks: 0 });
  });

  it('belowTarget is NULL when the share is unmeasurable, not true', () => {
    // "We could not measure it" is not "you missed the target". Reporting the second from the
    // first manufactures a finding out of missing data.
    const m = measureAutomation([a({ taskId: 't1', executionClass: 'human', minutesPerOccurrence: null })]);
    expect(m.belowTarget).toBeNull();
    expect(checkTargetDisclosure(m, null)).toEqual([]);
  });

  it('a genuinely zero AI share IS 0 and IS below target', () => {
    // The counterpart that makes the distinction above meaningful rather than a nicety.
    const m = measureAutomation([a({ taskId: 't1', executionClass: 'human', minutesPerOccurrence: 10 })]);
    expect(m.aiShare.fraction).toBe(0);
    expect(m.belowTarget).toBe(true);
  });
});

describe('exclusions are reported, so coverage cannot quietly shrink', () => {
  it('excludes an UNKNOWN basis and says so', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', basis: 'UNKNOWN' }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 10 }),
    ]);
    expect(m.issues.map((i) => i.code)).toEqual(['EFFORT_BASIS_UNKNOWN']);
    expect(m.coverage).toEqual({ assessedTasks: 1, totalTasks: 2 });
    // And the excluded minutes are NOT in the numerator.
    expect(m.aiShare.numeratorMinutes).toBe(0);
  });

  it('excludes a task with no declared occurrences, naming why', () => {
    // FactoryTask.frequency is free text and is never parsed numerically anywhere, so a monthly
    // total needs a declaration. This is the plan criterion the data could not support.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', occurrencesPerMonth: null }),
    ]);
    expect(m.issues[0].code).toBe('EFFORT_UNASSESSED');
    expect(m.issues[0].message).toContain('free text');
    expect(m.coverage.assessedTasks).toBe(0);
  });

  it('refuses a negative quantity rather than letting it offset a total', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: -50 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 10 }),
    ]);
    expect(m.issues.map((i) => i.code)).toEqual(['EFFORT_NEGATIVE']);
    expect(m.aiShare.numeratorMinutes).toBe(0);
  });

  it('refuses the same task assessed twice', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 10 }),
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 10 }),
    ]);
    expect(m.issues.map((i) => i.code)).toEqual(['EFFORT_DUPLICATE_TASK']);
    expect(m.aiShare.numeratorMinutes).toBe(10);
  });

  it('refuses an execution class outside the four', () => {
    const m = measureAutomation([
      { taskId: 't1', executionClass: 'magic', minutesPerOccurrence: 10, basis: 'ESTIMATED', occurrencesPerMonth: 1 } as unknown as EffortAssessment,
    ]);
    expect(m.issues.map((i) => i.code)).toEqual(['EFFORT_UNASSESSED']);
  });

  it('reports EVERY exclusion, not just the first', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'human', basis: 'UNKNOWN' }),
      a({ taskId: 't2', executionClass: 'human', occurrencesPerMonth: null }),
      a({ taskId: 't3', executionClass: 'human', minutesPerOccurrence: 10 }),
    ]);
    expect(m.issues).toHaveLength(2);
    expect(m.coverage).toEqual({ assessedTasks: 1, totalTasks: 3 });
  });
});

describe('below target is a disclosure requirement, not a failure', () => {
  const belowTarget = () => measureAutomation([
    a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 50 }),
    a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 50 }),
  ]);

  it('flags an undisclosed shortfall, with the real percentage in the message', () => {
    const m = belowTarget();
    expect(m.aiShare.fraction).toBe(0.5);
    const issues = checkTargetDisclosure(m, null);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('BELOW_TARGET_UNEXPLAINED');
    expect(issues[0].subject).toBe('50%');
  });

  it('PASSING COUNTERPART: a rationale plus a named acceptor clears it', () => {
    const issues = checkTargetDisclosure(belowTarget(), {
      rationale: 'Admissions judgement is deliberately human; see Fixture B.',
      acceptedBy: 'owner@example.test',
    });
    expect(issues).toEqual([]);
  });

  it('refuses a blank rationale, and refuses an unnamed acceptor', () => {
    expect(checkTargetDisclosure(belowTarget(), { rationale: '  ', acceptedBy: 'owner@example.test' }))
      .toHaveLength(1);
    expect(checkTargetDisclosure(belowTarget(), { rationale: 'deliberately human', acceptedBy: '' }))
      .toHaveLength(1);
  });

  it('says below target is a disclosure requirement rather than a failure', () => {
    const issues = checkTargetDisclosure(belowTarget(), null);
    expect(issues[0].message).toContain('not a failure');
  });

  it('requires nothing when the target is met', () => {
    // 90 AI / 100 total = 0.9, above 0.85.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 90 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 10 }),
    ]);
    expect(m.belowTarget).toBe(false);
    expect(checkTargetDisclosure(m, null)).toEqual([]);
  });

  it('exactly at target is NOT below it', () => {
    // 85/100. An off-by-one here would turn a met target into a disclosure demand.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 85 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 15 }),
    ]);
    expect(m.aiShare.fraction).toBe(0.85);
    expect(m.belowTarget).toBe(false);
  });
});

describe('no percentage renders without its scale', () => {
  it('carries the assessed minutes and the task coverage', () => {
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', minutesPerOccurrence: 30 }),
      a({ taskId: 't2', executionClass: 'human', minutesPerOccurrence: 10 }),
      a({ taskId: 't3', executionClass: 'human', minutesPerOccurrence: null }),
    ]);
    const text = renderShare(m.aiShare, m.coverage);

    expect(text).toContain('75%');
    expect(text).toContain('40 assessed minutes');
    expect(text).toContain('2 of 3 tasks');
  });

  it('says "not assessed" rather than printing a percentage, when there is none', () => {
    const m = measureAutomation([a({ taskId: 't1', executionClass: 'human', minutesPerOccurrence: null })]);
    const text = renderShare(m.aiShare, m.coverage);

    expect(text).toContain('not assessed');
    expect(text).not.toContain('%');
  });

  it('never manufactures an 85% claim out of unknown inputs', () => {
    // The request's own wording. A fixture with nothing usable yields incomplete coverage, not a
    // flattering default and not a fabricated zero.
    const m = measureAutomation([
      a({ taskId: 't1', executionClass: 'ai_autonomous', basis: 'UNKNOWN' }),
      a({ taskId: 't2', executionClass: 'ai_autonomous', occurrencesPerMonth: null }),
    ]);
    expect(m.aiShare.fraction).toBeNull();
    expect(m.belowTarget).toBeNull();
    expect(renderShare(m.aiShare, m.coverage)).toContain('0 of 2 tasks');
  });
});
