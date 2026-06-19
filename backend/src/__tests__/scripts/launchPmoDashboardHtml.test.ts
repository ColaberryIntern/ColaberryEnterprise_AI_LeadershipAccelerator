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

// Marketing readiness reuses computeListReadiness through the /marketing/i
// matcher. List name mirrors the live Basecamp "Marketing" list created by
// setupLaunchProject.js. No other launch list name contains "marketing", so a
// bare /marketing/i matcher is unambiguous (it cannot cross-match Curriculum,
// Website, TWC, etc.). Marketing todos already count toward overall readiness;
// this tile just surfaces the per-area % beside Curriculum + the two sites.
function stateWithMkt(marketing: { done: number; total: number } | null) {
  const areas = [area('Curriculum', 5, 10)];
  if (marketing) areas.push(area('Marketing', marketing.done, marketing.total));
  return { today: '2026-06-10', areas, overall: 50, totalHuman: 0, totalAi: 0, totalOverdue: 0, daysToLaunch: 41 };
}

describe('Marketing Readiness KPI tile', () => {
  it('2 / 4 -> 50%', () => {
    const v = buildView(stateWithMkt({ done: 2, total: 4 }));
    expect(v.marketing).toEqual({ pct: 50, done: 2, total: 4, present: true, hasData: true });
  });

  it('rounds to a whole-number percent (1/3 -> 33%)', () => {
    const v = buildView(stateWithMkt({ done: 1, total: 3 }));
    expect(v.marketing.pct).toBe(33);
  });

  it('divide-by-zero guard: 0 / 0 -> 0% with hasData:false', () => {
    const v = buildView(stateWithMkt({ done: 0, total: 0 }));
    expect(v.marketing).toEqual({ pct: 0, done: 0, total: 0, present: true, hasData: false });
  });

  it('missing Marketing list -> 0%, present:false, hasData:false', () => {
    const v = buildView(stateWithMkt(null));
    expect(v.marketing).toEqual({ pct: 0, done: 0, total: 0, present: false, hasData: false });
  });

  it('does not cross-match the Curriculum list', () => {
    const v = buildView(stateWithMkt(null)); // Curriculum present, Marketing absent
    expect(v.marketing.present).toBe(false); // must NOT borrow Curriculum's 5/10
    expect(v.curriculum.pct).toBe(50);
  });

  it('renders the tile with percent + "done / total" denominator subtext', () => {
    const html = renderDashboardHtml(buildView(stateWithMkt({ done: 2, total: 4 })));
    expect(html).toContain('Marketing Readiness');
    expect(html).toContain('2 / 4 tasks ready');
    expect(html).toContain('2 of 4 marketing tasks complete'); // hover title
  });

  it('renders "no marketing data" when the list is empty or missing', () => {
    const empty = renderDashboardHtml(buildView(stateWithMkt({ done: 0, total: 0 })));
    expect(empty).toContain('no marketing data'); // empty list
    const absent = renderDashboardHtml(buildView(stateWithMkt(null)));
    expect(absent).toContain('no marketing data'); // absent list
  });
});

// "Launch readiness by area" section: every curated launch workstream
// (AREA_TILES) gets a readiness tile, exposed on buildView as `areaReadiness`.
// Config-driven (not state.areas), so a known-but-absent list still renders a
// "no <area> data" tile. List names mirror the live Basecamp lists.
const LIST_NAME: Record<string, string> = {
  Curriculum: 'Curriculum',
  'Website (training)': 'Website - training.colaberry.com',
  'Website (enterprise)': 'Website - enterprise.colaberry.ai',
  Marketing: 'Marketing',
  'AI Systems': 'AI Systems',
  'Sales & Admissions': 'Sales & Admissions',
  'Open Houses & Events': 'Open Houses & Events',
  'TWC Compliance': 'TWC Compliance',
  'Student Platform': 'Student Platform Build',
};
function stateWithAreas(byLabel: Record<string, { done: number; total: number }>) {
  const areas = Object.entries(byLabel).map(([label, c]) => area(LIST_NAME[label] || label, c.done, c.total));
  return { today: '2026-06-10', areas, overall: 50, totalHuman: 0, totalAi: 0, totalOverdue: 0, daysToLaunch: 41 };
}

describe('Launch readiness by area section', () => {
  it('exposes one areaReadiness entry per curated area (9), in narrative order', () => {
    const v = buildView(stateWithAreas({}));
    expect(v.areaReadiness.map((r: { label: string }) => r.label)).toEqual([
      'Curriculum', 'Website (training)', 'Website (enterprise)', 'Marketing',
      'AI Systems', 'Sales & Admissions', 'Open Houses & Events', 'TWC Compliance', 'Student Platform',
    ]);
  });

  it('computes each present area as round(done/total*100), no cross-match', () => {
    const v = buildView(stateWithAreas({ 'AI Systems': { done: 11, total: 16 }, 'TWC Compliance': { done: 7, total: 9 }, 'Sales & Admissions': { done: 1, total: 5 } }));
    const by = (l: string) => v.areaReadiness.find((r: { label: string }) => r.label === l);
    expect(by('AI Systems')).toMatchObject({ pct: 69, done: 11, total: 16, present: true, hasData: true });
    expect(by('TWC Compliance')).toMatchObject({ pct: 78, done: 7, total: 9, present: true, hasData: true });
    expect(by('Sales & Admissions')).toMatchObject({ pct: 20, done: 1, total: 5, present: true });
    expect(by('Marketing')).toMatchObject({ present: false, hasData: false }); // absent, not borrowed
  });

  it('a known-but-absent area still renders a "no data" tile (config-driven)', () => {
    const html = renderDashboardHtml(buildView(stateWithAreas({ Marketing: { done: 2, total: 4 } })));
    expect(html).toContain('Launch readiness by area');
    expect(html).toContain('AI Systems Readiness'); // tile exists even with no AI Systems list
    expect(html).toContain('no AI Systems data'); // absent -> no data
    expect(html).toContain('Marketing Readiness');
    expect(html).toContain('2 / 4 tasks ready');
  });

  it('renders tiles + escaped labels for the program areas', () => {
    const html = renderDashboardHtml(buildView(stateWithAreas({
      'AI Systems': { done: 4, total: 8 }, 'Sales & Admissions': { done: 1, total: 5 },
      'Open Houses & Events': { done: 3, total: 3 }, 'Student Platform': { done: 6, total: 20 },
    })));
    expect(html).toContain('AI Systems Readiness');
    expect(html).toContain('Sales &amp; Admissions Readiness'); // "&" escaped in HTML
    expect(html).toContain('Open Houses &amp; Events Readiness');
    expect(html).toContain('Student Platform Readiness');
    expect(html).toContain('6 / 20 tasks ready');
  });
});
