export {};
/**
 * Unit tests for the risk/critical-path VIEW that wires the deterministic
 * engines into the daily PMO email. Covers the four mandatory test types
 * (CLAUDE.md): happy path, failure path, boundary cases, idempotency.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rv = require('../launchPmoRiskView');

const TODAY = '2026-07-10';
const LAUNCH = '2026-07-23';

// Minimal shape of what pullProjectState produces (areas[].openTodos[]).
function sampleState() {
  return {
    today: TODAY,
    areas: [
      { listName: 'Curriculum', openTodos: [
        { id: 1, content: 'Draft curriculum outline', tier: 'HUMAN', due_on: '2026-07-08', assignees: ['Swati Raman'], url: 'https://bc/1' },
        { id: 2, content: 'Review and approve curriculum outline', tier: 'HUMAN', due_on: '2026-07-12', assignees: [], url: 'https://bc/2' },
      ] },
      { listName: 'AI Systems', openTodos: [
        { id: 3, content: 'Finalize and submit launch checklist', tier: 'HUMAN', due_on: '2026-07-02', assignees: ['unassigned'], url: 'https://bc/3' },
        { id: 4, content: 'Draft blog post', tier: 'AI', due_on: '2026-07-30', assignees: ['kes'], url: 'https://bc/4' },
      ] },
    ],
  };
}
// Task 2 (approval) is blocked on its open upstream task 1 -> edge 1 -> 2.
function sampleBlockerMap() {
  return new Map<number, any>([
    [1, { blocked: false }],
    [2, { blocked: true, upstreamId: 1 }],
    [3, { blocked: false }],
    [4, { blocked: false }],
  ]);
}

describe('buildRiskView - happy path', () => {
  const view = rv.buildRiskView(sampleState(), sampleBlockerMap(), { todayIso: TODAY, launchIso: LAUNCH });

  test('ranks the unassigned-overdue-human launch-gate task first', () => {
    expect(view.ranked[0].id).toBe(3);
    expect(view.ranked[0].risk.band).toBe('CRITICAL');
  });

  test('derives a real critical path from the blocker edge (1 -> 2)', () => {
    expect(view.criticalCount).toBe(2);
    expect(view.criticalPath.map((t: any) => t.id)).toEqual([1, 2]);
    expect(view.overdueOnCritical).toBeGreaterThanOrEqual(0);
  });

  test('elevated excludes the calm AI task', () => {
    const ids = view.elevated.map((t: any) => t.id);
    expect(ids).toContain(3);
    expect(ids).not.toContain(4); // "Draft blog post", far-future AI -> LOW
  });
});

describe('renderRiskSectionHtml - happy path', () => {
  const view = rv.buildRiskView(sampleState(), sampleBlockerMap(), { todayIso: TODAY, launchIso: LAUNCH });
  const html = rv.renderRiskSectionHtml(view, { today: TODAY });

  test('renders the section with the top risk and a critical-path tag', () => {
    expect(html).toContain('Top predicted risks');
    expect(html).toContain('Finalize and submit launch checklist');
    expect(html).toContain('CRITICAL PATH');
  });

  test('never emits a literal em-dash (would trip the Mandrill preflight)', () => {
    expect(html.includes('—')).toBe(false);
    expect(html.includes('–')).toBe(false);
  });
});

describe('boundary cases', () => {
  test('no dependency edges -> risk still scored, but no critical path claimed', () => {
    const view = rv.buildRiskView(sampleState(), new Map(), { todayIso: TODAY, launchIso: LAUNCH });
    expect(view.criticalCount).toBe(0);
    expect(view.ranked.length).toBe(4);
    const html = rv.renderRiskSectionHtml(view, { today: TODAY });
    expect(html).not.toContain('CRITICAL PATH');
    expect(html).toContain('Top predicted risks');
  });

  test('all-LOW project -> green all-clear, not an empty string', () => {
    const calm = { today: TODAY, areas: [{ listName: 'X', openTodos: [
      { id: 9, content: 'Draft blog post', tier: 'AI', due_on: '2026-07-30', assignees: ['kes'], url: 'u' },
    ] }] };
    const view = rv.buildRiskView(calm, new Map(), { todayIso: TODAY, launchIso: LAUNCH });
    const html = rv.renderRiskSectionHtml(view, { today: TODAY });
    expect(view.elevated.length).toBe(0);
    expect(html).toContain('No elevated task risks');
  });
});

describe('failure path', () => {
  test('null state / null blockerMap -> empty view, no throw', () => {
    const view = rv.buildRiskView(null, null, { todayIso: TODAY, launchIso: LAUNCH });
    expect(view.ranked).toEqual([]);
    expect(view.criticalCount).toBe(0);
  });

  test('null view -> empty string (section omitted)', () => {
    expect(rv.renderRiskSectionHtml(null)).toBe('');
    expect(rv.renderRiskSectionHtml(undefined as any)).toBe('');
  });
});

describe('idempotency', () => {
  test('same inputs -> identical ranking and identical html', () => {
    const a = rv.buildRiskView(sampleState(), sampleBlockerMap(), { todayIso: TODAY, launchIso: LAUNCH });
    const b = rv.buildRiskView(sampleState(), sampleBlockerMap(), { todayIso: TODAY, launchIso: LAUNCH });
    const key = (v: any) => JSON.stringify(v.ranked.map((r: any) => ({ id: r.id, score: r.risk.score })));
    expect(key(a)).toBe(key(b));
    expect(rv.renderRiskSectionHtml(a, { today: TODAY })).toBe(rv.renderRiskSectionHtml(b, { today: TODAY }));
  });
});
