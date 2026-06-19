/**
 * Launch Readiness rollup - headline "Overall Readiness %".
 *
 * Proves computeOverallReadiness pools done/total across launch WORKSTREAMS only
 * (round(sum(done)/sum(total)*100)), excluding the PMO meta-lists, per the
 * 2026-06-19 decision. Covers the happy path, the meta-list exclusion (and that
 * excluding it actually moves the number), the divide-by-zero guard, and
 * malformed-input tolerance.
 *
 * The module under test is pure JS (no I/O), so it unit-tests without Basecamp.
 */

// `export {}` marks this file a module so its top-level test helpers (area,
// workstreams) are file-scoped, not globals that collide with same-named
// helpers in sibling test files (tsc TS2393).
export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeOverallReadiness, isLaunchWorkstream } = require('../../scripts/lib/launchReadiness');

// Minimal area factory. computeOverallReadiness only reads listName + done/total.
function area(listName: string, done: number, total: number) {
  return { listName, done, total };
}

// The live launch workstreams (9) plus the one PMO meta-list, mirroring the
// Basecamp lists created by setupLaunchProject.js.
function workstreams() {
  return [
    area('Curriculum', 5, 10),
    area('Website - training.colaberry.com', 9, 20),
    area('Website - enterprise.colaberry.ai', 3, 12),
    area('Marketing', 2, 4),
    area('AI Systems', 4, 8),
    area('Open Houses & Events', 3, 3),
    area('Sales & Admissions', 1, 5),
    area('TWC Compliance', 7, 9),
    area('Student Platform Build', 6, 20),
  ];
}

describe('computeOverallReadiness', () => {
  it('pools done/total across all launch workstreams (task-weighted)', () => {
    // sum(done) = 5+9+3+2+4+3+1+7+6 = 40; sum(total) = 10+20+12+4+8+3+5+9+20 = 91
    const r = computeOverallReadiness(workstreams());
    expect(r).toEqual({ pct: Math.round((40 / 91) * 100), done: 40, total: 91, areaCount: 9 });
    expect(r.pct).toBe(44); // 43.95 -> 44
  });

  it('excludes the "Launch Readiness Dashboard" PMO meta-list', () => {
    const withMeta = [...workstreams(), area('Launch Readiness Dashboard', 0, 30)];
    const r = computeOverallReadiness(withMeta);
    // The 30 dashboard-backlog todos must NOT dilute the number.
    expect(r).toEqual({ pct: 44, done: 40, total: 91, areaCount: 9 });
  });

  it('excluding the meta-list actually changes the result (guards against a no-op)', () => {
    const withMeta = [...workstreams(), area('Launch Readiness Dashboard', 0, 30)];
    const pooledNaively = Math.round((40 / (91 + 30)) * 100); // if meta were counted: 40/121 = 33%
    expect(pooledNaively).toBe(33);
    expect(computeOverallReadiness(withMeta).pct).toBe(44);
    expect(computeOverallReadiness(withMeta).pct).not.toBe(pooledNaively);
  });

  it('defensively excludes a retired "Approval Queues" list if one reappears', () => {
    const withApprovals = [...workstreams(), area('Approval Queues', 0, 50)];
    expect(computeOverallReadiness(withApprovals)).toEqual({ pct: 44, done: 40, total: 91, areaCount: 9 });
  });

  it('rounds to a whole-number percent', () => {
    expect(computeOverallReadiness([area('Curriculum', 1, 3)]).pct).toBe(33); // 33.33 -> 33
    expect(computeOverallReadiness([area('Curriculum', 2, 3)]).pct).toBe(67); // 66.67 -> 67
  });

  it('100% when every workstream todo is done', () => {
    expect(computeOverallReadiness([area('Curriculum', 10, 10), area('Marketing', 4, 4)]).pct).toBe(100);
  });

  it('divide-by-zero guard: only the meta-list has todos -> 0%', () => {
    const r = computeOverallReadiness([area('Launch Readiness Dashboard', 5, 5)]);
    expect(r).toEqual({ pct: 0, done: 0, total: 0, areaCount: 0 });
  });

  it('divide-by-zero guard: empty workstreams (0/0) -> 0%', () => {
    expect(computeOverallReadiness([area('Curriculum', 0, 0)])).toEqual({ pct: 0, done: 0, total: 0, areaCount: 1 });
  });

  it('tolerates missing/malformed input without throwing', () => {
    expect(computeOverallReadiness(undefined)).toEqual({ pct: 0, done: 0, total: 0, areaCount: 0 });
    expect(computeOverallReadiness([])).toEqual({ pct: 0, done: 0, total: 0, areaCount: 0 });
    // Missing done/total fields are treated as 0, not NaN.
    const r = computeOverallReadiness([{ listName: 'Curriculum' }, area('Marketing', 2, 4)]);
    expect(r).toEqual({ pct: 50, done: 2, total: 4, areaCount: 2 });
    expect(Number.isNaN(r.pct)).toBe(false);
  });
});

describe('isLaunchWorkstream', () => {
  it('treats the 9 real workstreams as launch work', () => {
    for (const a of workstreams()) expect(isLaunchWorkstream(a.listName)).toBe(true);
  });

  it('excludes the PMO meta-lists (anchored, case-insensitive)', () => {
    expect(isLaunchWorkstream('Launch Readiness Dashboard')).toBe(false);
    expect(isLaunchWorkstream('launch readiness dashboard')).toBe(false);
    expect(isLaunchWorkstream('  Approval Queues  ')).toBe(false);
  });

  it('does not exclude a real workstream that merely contains a meta-list word', () => {
    // Anchored matchers: "Readiness Dashboard v2" is not the exact meta-list name.
    expect(isLaunchWorkstream('Student Readiness Dashboard Build')).toBe(true);
    expect(isLaunchWorkstream('Curriculum')).toBe(true);
  });

  it('treats null/empty as a workstream (does not silently drop unknown lists)', () => {
    expect(isLaunchWorkstream(null)).toBe(true);
    expect(isLaunchWorkstream('')).toBe(true);
  });
});
