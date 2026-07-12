/**
 * Unit tests for the deterministic PMBOK risk scorer. Covers the four
 * mandatory test types (CLAUDE.md): happy path, failure path, boundary cases,
 * and idempotency. The scorer must be a pure function of (task, ctx).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rs = require('../launchPmoRiskScore');

const TODAY = '2026-07-10';
const LAUNCH = '2026-07-11';

describe('scoreTaskRisk - happy path', () => {
  test('worst case: unassigned overdue human launch-gate with deps -> CRITICAL 25', () => {
    const task = {
      content: 'Finalize and submit launch checklist',
      tier: 'human',
      owner_handle: 'unassigned',
      due_on: '2026-07-01',
      dependencies: 'Draft checklist',
    };
    const r = rs.scoreTaskRisk(task, { todayIso: TODAY, launchIso: LAUNCH, onCriticalPath: true, downstreamCount: 4 });
    expect(r.probability).toBe(5);
    expect(r.impact).toBe(5);
    expect(r.score).toBe(25);
    expect(r.band).toBe('CRITICAL');
    expect(r.drivers.join(' ')).toMatch(/overdue/);
    expect(r.drivers.join(' ')).toMatch(/launch-gate/);
  });

  test('calm case: owned AI task due well after launch -> LOW 1', () => {
    const task = { content: 'Draft blog post', tier: 'ai', owner_handle: 'kes-ai-systems', due_on: '2026-07-30', dependencies: 'none' };
    const r = rs.scoreTaskRisk(task, { todayIso: TODAY, launchIso: LAUNCH });
    expect(r.probability).toBe(1);
    expect(r.impact).toBe(1);
    expect(r.score).toBe(1);
    expect(r.band).toBe('LOW');
  });

  test('reads the daily-update task shape (assignees[]) too', () => {
    const readShape = { content: 'Approve pricing page', tier: 'HUMAN', assignees: ['Kes Delele'], due_on: '2026-07-12' };
    const r = rs.scoreTaskRisk(readShape, { todayIso: TODAY, launchIso: LAUNCH, downstreamCount: 2 });
    expect(r.impact).toBeGreaterThan(1); // downstream + approval gate raise impact
    expect(r.drivers.some((d: string) => /depend/.test(d))).toBe(true);
  });
});

describe('scoreTaskRisk - probability drivers', () => {
  test('overdue adds the most probability weight', () => {
    const base = { content: 'Do the thing', tier: 'ai', owner_handle: 'kes-ai-systems' };
    const overdue = rs.scoreTaskRisk({ ...base, due_on: '2026-07-01', dependencies: 'none' }, { todayIso: TODAY, launchIso: LAUNCH });
    const future = rs.scoreTaskRisk({ ...base, due_on: '2026-07-30', dependencies: 'none' }, { todayIso: TODAY, launchIso: LAUNCH });
    expect(overdue.probability).toBeGreaterThan(future.probability);
  });

  test('missing due date is itself a probability driver', () => {
    const r = rs.scoreTaskRisk({ content: 'Untracked task', tier: 'ai', owner_handle: 'kes-ai-systems', dependencies: 'none' }, { todayIso: TODAY, launchIso: LAUNCH });
    expect(r.probability).toBeGreaterThan(1);
    expect(r.drivers.some((d: string) => /no due date/.test(d))).toBe(true);
  });
});

describe('scoreTaskRisk - boundary cases', () => {
  test('probability and impact never exceed 5 even with every driver stacked', () => {
    const task = { content: 'Finalize launch go-live sign-off', tier: 'human', owner_handle: 'unassigned', due_on: '2026-06-01', dependencies: 'many upstream' };
    const r = rs.scoreTaskRisk(task, { todayIso: TODAY, launchIso: LAUNCH, onCriticalPath: true, downstreamCount: 99 });
    expect(r.probability).toBe(5);
    expect(r.impact).toBe(5);
    expect(r.score).toBeLessThanOrEqual(25);
  });

  test('empty/whitespace fields do not crash and score stays in range', () => {
    const r = rs.scoreTaskRisk({ content: '', tier: '', owner_handle: '', due_on: null, dependencies: '' }, { todayIso: TODAY });
    expect(r.probability).toBeGreaterThanOrEqual(1);
    expect(r.probability).toBeLessThanOrEqual(5);
    expect(r.impact).toBeGreaterThanOrEqual(1);
  });

  test('bandFor thresholds', () => {
    expect(rs.bandFor(1)).toBe('LOW');
    expect(rs.bandFor(3)).toBe('LOW');
    expect(rs.bandFor(4)).toBe('MEDIUM');
    expect(rs.bandFor(8)).toBe('MEDIUM');
    expect(rs.bandFor(9)).toBe('HIGH');
    expect(rs.bandFor(14)).toBe('HIGH');
    expect(rs.bandFor(15)).toBe('CRITICAL');
    expect(rs.bandFor(25)).toBe('CRITICAL');
  });
});

describe('scoreTaskRisk - failure path', () => {
  test('null task returns a safe LOW score, no throw', () => {
    const r = rs.scoreTaskRisk(null as any, { todayIso: TODAY });
    expect(r.band).toBe('LOW');
    expect(r.drivers).toContain('no task data');
  });

  test('missing ctx (no todayIso) still returns a valid score', () => {
    const r = rs.scoreTaskRisk({ content: 'x', tier: 'human', due_on: '2026-07-01', dependencies: 'none' });
    expect(r.score).toBeGreaterThanOrEqual(1);
    expect(r.score).toBeLessThanOrEqual(25);
  });

  test('malformed due date is ignored, not fatal', () => {
    const r = rs.scoreTaskRisk({ content: 'x', tier: 'ai', owner_handle: 'k', due_on: 'not-a-date', dependencies: 'none' }, { todayIso: TODAY, launchIso: LAUNCH });
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('scoreTaskRisk - idempotency', () => {
  test('same inputs -> identical output object', () => {
    const task = { content: 'Review and approve curriculum', tier: 'human', owner_handle: 'unassigned', due_on: '2026-07-09', dependencies: 'Draft curriculum' };
    const ctx = { todayIso: TODAY, launchIso: LAUNCH, onCriticalPath: true, downstreamCount: 2 };
    const a = rs.scoreTaskRisk(task, ctx);
    const b = rs.scoreTaskRisk(task, ctx);
    expect(a).toEqual(b);
  });
});

describe('rankTasksByRisk', () => {
  test('sorts most-risky first', () => {
    const tasks = [
      { content: 'Draft blog post', tier: 'ai', owner_handle: 'k', due_on: '2026-07-30', dependencies: 'none' },
      { content: 'Finalize and submit launch checklist', tier: 'human', owner_handle: 'unassigned', due_on: '2026-07-01', dependencies: 'x' },
    ];
    const ranked = rs.rankTasksByRisk(tasks, { todayIso: TODAY, launchIso: LAUNCH });
    expect(ranked[0].task.content).toMatch(/launch checklist/);
    expect(ranked[0].risk.score).toBeGreaterThan(ranked[1].risk.score);
  });

  test('empty input -> empty array', () => {
    expect(rs.rankTasksByRisk([], {})).toEqual([]);
    expect(rs.rankTasksByRisk(null as any, {})).toEqual([]);
  });

  test('per-task ctx override supplies graph signals', () => {
    const tasks = [{ content: 'Publish site', tier: 'ai', owner_handle: 'k', due_on: '2026-07-11', dependencies: 'none' }];
    const ranked = rs.rankTasksByRisk(tasks, { todayIso: TODAY, launchIso: LAUNCH }, () => ({ onCriticalPath: true, downstreamCount: 5 }));
    expect(ranked[0].risk.drivers.some((d: string) => /critical path/.test(d))).toBe(true);
  });
});
