/**
 * Launch Readiness Dashboard - Curriculum Readiness KPI tile.
 *
 * Proves the tile's formula: percent = round(done / total * 100), sourced from
 * the "Curriculum" Basecamp todo list (same units / same pattern as every other
 * area's pct in pullProjectState). Covers the spec'd cases plus the
 * divide-by-zero guard.
 *
 * The module under test is plain JS (no I/O), so it unit-tests without Basecamp.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildView, renderDashboardHtml } = require('../../scripts/lib/launchPmoDashboardHtml');

// Minimal area factory. buildView only reads listName, openCount, openTodos,
// feasibility and the done/total counts off each area, so we stub just those.
function area(name: string, done: number, total: number) {
  return {
    listName: name,
    done,
    total,
    openCount: 0,
    openTodos: [],
    overdue: [],
    feasibility: { score: 100, requiredDays: 0, daysToLaunch: 41 },
  };
}

// Minimal state for buildView. Curriculum list carries done/total; the rest is
// just enough to let buildView run end to end.
function stateWith(curriculum: { done: number; total: number } | null) {
  const areas = [area('Marketing', 2, 4)];
  if (curriculum) areas.push(area('Curriculum', curriculum.done, curriculum.total));
  return {
    today: '2026-06-10',
    areas,
    overall: 50,
    totalHuman: 0,
    totalAi: 0,
    totalOverdue: 0,
    daysToLaunch: 41,
  };
}

describe('Curriculum Readiness KPI tile', () => {
  it('0 / 25 -> 0%', () => {
    const v = buildView(stateWith({ done: 0, total: 25 }));
    expect(v.curriculum).toEqual({ pct: 0, done: 0, total: 25, present: true, hasData: true });
  });

  it('25 / 25 -> 100%', () => {
    const v = buildView(stateWith({ done: 25, total: 25 }));
    expect(v.curriculum.pct).toBe(100);
  });

  it('18 / 25 -> 72%', () => {
    const v = buildView(stateWith({ done: 18, total: 25 }));
    expect(v.curriculum.pct).toBe(72);
  });

  it('rounds to a whole-number percent (e.g. 7/25 -> 28%)', () => {
    const v = buildView(stateWith({ done: 7, total: 25 }));
    expect(v.curriculum.pct).toBe(28); // 28.0
    const v2 = buildView(stateWith({ done: 1, total: 3 }));
    expect(v2.curriculum.pct).toBe(33); // 33.33 -> 33
  });

  it('divide-by-zero guard: 0 / 0 -> 0% with hasData:false ("no data")', () => {
    const v = buildView(stateWith({ done: 0, total: 0 }));
    expect(v.curriculum).toEqual({ pct: 0, done: 0, total: 0, present: true, hasData: false });
  });

  it('no Curriculum list at all -> 0%, present:false, hasData:false', () => {
    const v = buildView(stateWith(null));
    expect(v.curriculum).toEqual({ pct: 0, done: 0, total: 0, present: false, hasData: false });
  });

  it('renders the tile with the percent and the "done / total" denominator subtext', () => {
    const html = renderDashboardHtml(buildView(stateWith({ done: 18, total: 25 })));
    expect(html).toContain('Curriculum Readiness');
    expect(html).toContain('>72<'); // the value, before the % unit span
    expect(html).toContain('18 / 25 tasks ready');
    expect(html).toContain('18 of 25 curriculum tasks complete'); // hover title
  });

  it('renders "no curriculum data" when the list is empty', () => {
    const html = renderDashboardHtml(buildView(stateWith({ done: 0, total: 0 })));
    expect(html).toContain('no curriculum data');
  });
});
