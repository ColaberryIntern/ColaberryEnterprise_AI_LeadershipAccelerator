/**
 * Unit tests for the deterministic critical-path (CPM) engine. Covers the four
 * mandatory test types (CLAUDE.md): happy path, failure path (empty / cycles /
 * dangling edges), boundary cases (single node, diamond), and idempotency.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cp = require('../launchPmoCriticalPath');

const T = (...ids: any[]) => ids.map((id) => ({ id }));

describe('computeCriticalPath - happy path', () => {
  test('linear chain A->B->C: whole chain is critical, zero slack', () => {
    const r = cp.computeCriticalPath(T('A', 'B', 'C'), [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]);
    expect(r.criticalPath).toEqual(['A', 'B', 'C']);
    expect(r.length).toBe(3);
    expect([...r.onCriticalPath].sort()).toEqual(['A', 'B', 'C']);
    expect(r.slack.get('A')).toBe(0);
    expect(r.slack.get('C')).toBe(0);
    expect(r.downstreamReach.get('A')).toBe(2);
    expect(r.downstreamDirect.get('A')).toBe(1);
  });

  test('branch with slack: A->B->C->D plus A->E->D, E has 1 day slack', () => {
    const edges = [
      { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' },
      { from: 'A', to: 'E' }, { from: 'E', to: 'D' },
    ];
    const r = cp.computeCriticalPath(T('A', 'B', 'C', 'D', 'E'), edges);
    expect(r.criticalPath).toEqual(['A', 'B', 'C', 'D']);
    expect(r.length).toBe(4);
    expect(r.onCriticalPath.has('E')).toBe(false);
    expect(r.slack.get('E')).toBe(1);
  });
});

describe('computeCriticalPath - boundary cases', () => {
  test('diamond with equal weights: both middle nodes are critical', () => {
    const edges = [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'D' }];
    const r = cp.computeCriticalPath(T('A', 'B', 'C', 'D'), edges);
    expect(r.length).toBe(3);
    expect([...r.onCriticalPath].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(r.downstreamReach.get('A')).toBe(3);
    // deterministic tie-break picks the smaller-id child
    expect(r.criticalPath).toEqual(['A', 'B', 'D']);
  });

  test('single node: it is its own critical path', () => {
    const r = cp.computeCriticalPath(T('solo'), []);
    expect(r.criticalPath).toEqual(['solo']);
    expect(r.length).toBe(1);
    expect(r.onCriticalPath.has('solo')).toBe(true);
  });

  test('weightOf shifts the critical path onto the heavier branch', () => {
    // A->H (human, 1.5) and A->L (ai, 0.15). Heavier branch H wins.
    const tasks = [{ id: 'A', tier: 'ai' }, { id: 'H', tier: 'human' }, { id: 'L', tier: 'ai' }];
    const edges = [{ from: 'A', to: 'H' }, { from: 'A', to: 'L' }];
    const weightOf = (t: any) => (t.tier === 'human' ? 1.5 : 0.15);
    const r = cp.computeCriticalPath(tasks, edges, { weightOf });
    expect(r.criticalPath).toEqual(['A', 'H']);
    expect(r.length).toBeCloseTo(0.15 + 1.5, 5);
    expect(r.onCriticalPath.has('L')).toBe(false);
  });
});

describe('computeCriticalPath - failure path', () => {
  test('empty graph -> empty result, no throw', () => {
    const r = cp.computeCriticalPath([], []);
    expect(r.criticalPath).toEqual([]);
    expect(r.length).toBe(0);
    expect(r.onCriticalPath.size).toBe(0);
  });

  test('edges referencing unknown ids are ignored', () => {
    const r = cp.computeCriticalPath(T('A', 'B'), [{ from: 'A', to: 'B' }, { from: 'A', to: 'GHOST' }, { from: 'X', to: 'Y' }]);
    expect(r.criticalPath).toEqual(['A', 'B']);
    expect(r.length).toBe(2);
  });

  test('a cycle is detected and broken instead of hanging', () => {
    const r = cp.computeCriticalPath(T('A', 'B', 'C'), [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }]);
    expect(r.cycles.length).toBeGreaterThan(0);
    expect(Array.isArray(r.criticalPath)).toBe(true);
    expect(r.criticalPath.length).toBeGreaterThan(0);
  });

  test('self-loop edge is dropped', () => {
    const r = cp.computeCriticalPath(T('A'), [{ from: 'A', to: 'A' }]);
    expect(r.cycles).toEqual([]);
    expect(r.criticalPath).toEqual(['A']);
  });
});

describe('computeCriticalPath - idempotency', () => {
  test('same graph -> identical path and critical set', () => {
    const tasks = T('A', 'B', 'C', 'D', 'E');
    const edges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'A', to: 'E' }, { from: 'E', to: 'D' }];
    const a = cp.computeCriticalPath(tasks, edges);
    const b = cp.computeCriticalPath(tasks, edges);
    expect(a.criticalPath).toEqual(b.criticalPath);
    expect([...a.onCriticalPath].sort()).toEqual([...b.onCriticalPath].sort());
    expect(a.length).toBe(b.length);
  });

  test('edge order does not change the result', () => {
    const tasks = T('A', 'B', 'C');
    const forward = cp.computeCriticalPath(tasks, [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]);
    const shuffled = cp.computeCriticalPath(tasks, [{ from: 'B', to: 'C' }, { from: 'A', to: 'B' }]);
    expect(forward.criticalPath).toEqual(shuffled.criticalPath);
  });
});
