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

// Website readiness reuses computeListReadiness through two FQDN matchers
// (/training\.colaberry/i and /enterprise\.colaberry/i), so the two website
// lists never cross-match each other the way a bare /website/i would. List
// names mirror the live Basecamp lists created by setupLaunchProject.js.
function stateWithSites(sites: {
  training?: { done: number; total: number };
  enterprise?: { done: number; total: number };
}) {
  const areas = [area('Marketing', 2, 4)];
  if (sites.training) areas.push(area('Website - training.colaberry.com', sites.training.done, sites.training.total));
  if (sites.enterprise) areas.push(area('Website - enterprise.colaberry.ai', sites.enterprise.done, sites.enterprise.total));
  return { today: '2026-06-10', areas, overall: 50, totalHuman: 0, totalAi: 0, totalOverdue: 0, daysToLaunch: 41 };
}

describe('Website Readiness KPI tiles', () => {
  it('training 9 / 20 -> 45%', () => {
    const v = buildView(stateWithSites({ training: { done: 9, total: 20 } }));
    expect(v.websiteTraining).toEqual({ pct: 45, done: 9, total: 20, present: true, hasData: true });
  });

  it('enterprise 3 / 12 -> 25%', () => {
    const v = buildView(stateWithSites({ enterprise: { done: 3, total: 12 } }));
    expect(v.websiteEnterprise).toEqual({ pct: 25, done: 3, total: 12, present: true, hasData: true });
  });

  it('the two site matchers do not cross-match each other', () => {
    const v = buildView(stateWithSites({ training: { done: 1, total: 4 }, enterprise: { done: 3, total: 4 } }));
    expect(v.websiteTraining.pct).toBe(25); // 1/4, not enterprise's 3/4
    expect(v.websiteEnterprise.pct).toBe(75); // 3/4, not training's 1/4
  });

  it('rounds to a whole-number percent (1/3 -> 33%)', () => {
    const v = buildView(stateWithSites({ training: { done: 1, total: 3 } }));
    expect(v.websiteTraining.pct).toBe(33);
  });

  it('divide-by-zero guard: 0 / 0 -> 0% with hasData:false', () => {
    const v = buildView(stateWithSites({ training: { done: 0, total: 0 } }));
    expect(v.websiteTraining).toEqual({ pct: 0, done: 0, total: 0, present: true, hasData: false });
  });

  it('missing list -> 0%, present:false, hasData:false', () => {
    const v = buildView(stateWithSites({ training: { done: 5, total: 5 } })); // enterprise absent
    expect(v.websiteEnterprise).toEqual({ pct: 0, done: 0, total: 0, present: false, hasData: false });
  });

  it('renders both tiles with percent + "done / total" denominator subtext', () => {
    const html = renderDashboardHtml(
      buildView(stateWithSites({ training: { done: 9, total: 20 }, enterprise: { done: 3, total: 12 } })),
    );
    expect(html).toContain('Website (training) Readiness');
    expect(html).toContain('Website (enterprise) Readiness');
    expect(html).toContain('9 / 20 tasks ready');
    expect(html).toContain('9 of 20 website (training) tasks complete'); // hover title
    expect(html).toContain('3 / 12 tasks ready');
  });

  it('renders "no website data" labels when a list is empty or missing', () => {
    const html = renderDashboardHtml(buildView(stateWithSites({ training: { done: 0, total: 0 } })));
    expect(html).toContain('no website (training) data'); // empty list
    expect(html).toContain('no website (enterprise) data'); // absent list
  });
});
