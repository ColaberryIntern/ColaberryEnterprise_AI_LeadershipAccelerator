import {
  CommandCenterDeps,
  computableTiles,
  getCommandCenterSummary,
} from '../commandCenterService';

const okDeps = (): CommandCenterDeps => ({
  getVisitorKpis: jest.fn().mockResolvedValue({
    unique_visitors: 994,
    unique_visitors_7d: 725,
    engaged_visitors: 413,
    conversion_rate: 2.31,
  }),
  countLiveVisitors: jest.fn().mockResolvedValue(7),
  getDashboardStats: jest.fn().mockResolvedValue({ totalLeads: 24673 }),
});

const tileFor = (summary: { tiles: Array<{ key: string }> }, key: string) =>
  summary.tiles.find((t) => t.key === key)!;

describe('command center summary', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => errSpy.mockRestore());

  it('reads every source and reports real values', async () => {
    const summary = await getCommandCenterSummary(okDeps());
    expect(tileFor(summary, 'growth.unique_visitors').value).toBe(994);
    expect(tileFor(summary, 'growth.engaged_visitors').value).toBe(413);
    expect(summary.degraded).toEqual([]);
  });

  // ── The rule the service exists to enforce ────────────────────────────────

  it('reports null, NOT zero, when a source fails', async () => {
    // The War Room wraps each fetch in `.catch(() => ({ data: {} }))`, so a 500
    // becomes an empty object and renders as 0 — a broken backend and a real
    // zero look identical. This is the fix, and it is the whole point.
    const deps = okDeps();
    deps.getVisitorKpis = jest.fn().mockRejectedValue(new Error('db down'));

    const summary = await getCommandCenterSummary(deps);
    const t = tileFor(summary, 'growth.unique_visitors');
    expect(t.value).toBeNull();
    expect(t.value).not.toBe(0);
    expect(t.status).toBe('failed');
  });

  it('names the failing source so the page can say so out loud', async () => {
    const deps = okDeps();
    deps.getVisitorKpis = jest.fn().mockRejectedValue(new Error('db down'));
    const summary = await getCommandCenterSummary(deps);
    expect(summary.degraded).toContain('visitor metrics');
  });

  it('records an error class so a failure is diagnosable', async () => {
    class TimeoutError extends Error {}
    const deps = okDeps();
    deps.getVisitorKpis = jest.fn().mockRejectedValue(new TimeoutError('slow'));
    const summary = await getCommandCenterSummary(deps);
    expect(tileFor(summary, 'growth.unique_visitors').errorClass).toBe('TimeoutError');
  });

  it('keeps the tiles that did load when one source fails', async () => {
    // A single broken source must not blank the whole page. Partial truth beats
    // no truth, as long as the gap is labelled.
    const deps = okDeps();
    deps.getDashboardStats = jest.fn().mockRejectedValue(new Error('db down'));
    const summary = await getCommandCenterSummary(deps);
    expect(tileFor(summary, 'growth.unique_visitors').value).toBe(994);
    expect(summary.degraded).toEqual(['dashboard stats']);
  });

  it('survives every source failing at once', async () => {
    const deps: CommandCenterDeps = {
      getVisitorKpis: jest.fn().mockRejectedValue(new Error('x')),
      countLiveVisitors: jest.fn().mockRejectedValue(new Error('x')),
      getDashboardStats: jest.fn().mockRejectedValue(new Error('x')),
    };
    const summary = await getCommandCenterSummary(deps);
    expect(summary.degraded).toHaveLength(3);
    // Still renders every tile, each honestly empty.
    expect(summary.tiles.length).toBeGreaterThan(0);
    for (const t of summary.tiles) {
      expect(t.value).toBeNull();
    }
  });

  // ── Unavailable is not the same as broken, and neither is zero ────────────

  it('renders unavailable metrics rather than hiding them', async () => {
    // A missing tile reads as "we don't track that". An unavailable one reads as
    // "we can't tell yet". Only the second is true, so the tile must be present.
    const summary = await getCommandCenterSummary(okDeps());
    const revenue = tileFor(summary, 'revenue.net_revenue');
    expect(revenue).toBeDefined();
    expect(revenue.value).toBeNull();
    expect(revenue.status).toBe('unavailable');
    expect(revenue.note).toBeTruthy();
  });

  it('distinguishes unavailable from failed', async () => {
    // Different problems needing different responses: one needs a data source
    // wired, the other needs someone to look at an error.
    const deps = okDeps();
    deps.getVisitorKpis = jest.fn().mockRejectedValue(new Error('db down'));
    const summary = await getCommandCenterSummary(deps);
    expect(tileFor(summary, 'growth.unique_visitors').status).toBe('failed');
    expect(tileFor(summary, 'revenue.net_revenue').status).toBe('unavailable');
    expect(tileFor(summary, 'learning.active_learners').status).toBe('unavailable');
  });

  // ── What may be computed with ─────────────────────────────────────────────

  it('lets only trusted, successfully-read metrics feed a score', async () => {
    const summary = await getCommandCenterSummary(okDeps());
    const keys = computableTiles(summary).map((t) => t.key);

    expect(keys).toContain('growth.unique_visitors');
    expect(keys).toContain('growth.engaged_visitors');
    // Registered 'partial' — shown with its caveat, never averaged.
    expect(keys).not.toContain('growth.visitor_to_lead');
    expect(keys).not.toContain('revenue.net_revenue');
    expect(keys).not.toContain('learning.active_learners');
  });

  it('excludes a failed source from computation even when it is trusted', async () => {
    const deps = okDeps();
    deps.getVisitorKpis = jest.fn().mockRejectedValue(new Error('db down'));
    const summary = await getCommandCenterSummary(deps);
    expect(computableTiles(summary)).toEqual([]);
  });

  it('carries the caveat for a partial metric', async () => {
    const summary = await getCommandCenterSummary(okDeps());
    const t = tileFor(summary, 'growth.visitor_to_lead');
    expect(t.trust).toBe('partial');
    expect(t.note).toBeTruthy();
    // Still shown, with its real value — partial means caveated, not hidden.
    expect(t.value).toBe(2.31);
  });

  it('passes the requested window through to the source', async () => {
    const deps = okDeps();
    const summary = await getCommandCenterSummary(deps, 7);
    expect(deps.getVisitorKpis).toHaveBeenCalledWith(7);
    expect(summary.windowDays).toBe(7);
  });
});
