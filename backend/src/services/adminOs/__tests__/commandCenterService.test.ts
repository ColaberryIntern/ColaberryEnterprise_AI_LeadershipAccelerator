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
  getAlerts: jest.fn().mockResolvedValue([
    { id: 'a1', title: 'Payment failed', severity: 3, created_at: '2026-09-06T10:00:00Z' },
  ]),
  getActivityFeed: jest.fn().mockResolvedValue([
    { source: 'visitor', event_type: 'cta_click', detail: 'Pricing CTA', created_at: '2026-09-06T10:01:00Z' },
  ]),
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
      getAlerts: jest.fn().mockRejectedValue(new Error('x')),
      getActivityFeed: jest.fn().mockRejectedValue(new Error('x')),
    };
    const summary = await getCommandCenterSummary(deps);
    expect(summary.degraded).toHaveLength(5);
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

  // ── The War Room sections, absorbed ──────────────────────────────────────

  it('carries the attention queue and the activity feed', async () => {
    const summary = await getCommandCenterSummary(okDeps());
    expect(summary.attention.status).toBe('ok');
    expect(summary.attention.items[0].label).toBe('Payment failed');
    expect(summary.activity.status).toBe('ok');
    expect(summary.activity.items[0].detail).toBe('Pricing CTA');
  });

  it('tells an empty queue apart from an unread one', async () => {
    // THE POINT of FeedSection. `items: []` with status 'ok' means genuinely
    // nothing to show; the same empty array with status 'failed' means we could
    // not look. Rendering both as "All clear" is how an outage looks like a
    // calm morning.
    const quiet = okDeps();
    quiet.getAlerts = jest.fn().mockResolvedValue([]);
    const quietSummary = await getCommandCenterSummary(quiet);
    expect(quietSummary.attention.status).toBe('ok');
    expect(quietSummary.attention.items).toEqual([]);

    const broken = okDeps();
    broken.getAlerts = jest.fn().mockRejectedValue(new Error('db down'));
    const brokenSummary = await getCommandCenterSummary(broken);
    expect(brokenSummary.attention.status).toBe('failed');
    expect(brokenSummary.attention.items).toEqual([]);
    expect(brokenSummary.degraded).toContain('attention queue');
  });

  it('does not invent a label for an alert that has none', async () => {
    // A row with no title must not silently borrow another field and present it
    // as the alert's name.
    const deps = okDeps();
    deps.getAlerts = jest.fn().mockResolvedValue([{ id: 'a2' }]);
    const summary = await getCommandCenterSummary(deps);
    expect(summary.attention.items[0].label).toBe('Untitled alert');
    expect(summary.attention.items[0].detail).toBeUndefined();
  });

  it('keeps the metric tiles when only the feed fails', async () => {
    const deps = okDeps();
    deps.getActivityFeed = jest.fn().mockRejectedValue(new Error('db down'));
    const summary = await getCommandCenterSummary(deps);
    expect(tileFor(summary, 'growth.unique_visitors').value).toBe(994);
    expect(summary.activity.status).toBe('failed');
    expect(summary.degraded).toEqual(['activity feed']);
  });

  // ── A hang is not a failure, which is what made it dangerous ─────────────

  it('treats a source that never responds as failed rather than waiting', async () => {
    // On 2026-09-06 the visitor-KPI query took 72 seconds on production, so this
    // endpoint never responded and the page sat on "Loading…" forever. Every
    // other failure mode here was built to be visible; that one was invisible
    // because nothing ever returned.
    jest.useFakeTimers();
    const deps = okDeps();
    deps.getVisitorKpis = jest.fn().mockReturnValue(new Promise(() => {})); // never settles

    const promise = getCommandCenterSummary(deps);
    await jest.advanceTimersByTimeAsync(11_000);
    const summary = await promise;
    jest.useRealTimers();

    const t = tileFor(summary, 'growth.unique_visitors');
    expect(t.status).toBe('failed');
    expect(t.value).toBeNull();
    expect(t.errorClass).toBe('SourceTimeoutError');
    expect(summary.degraded).toContain('visitor metrics');
  });

  it('does not time out a source that answers in time', async () => {
    jest.useFakeTimers();
    const deps = okDeps();
    const promise = getCommandCenterSummary(deps);
    await jest.advanceTimersByTimeAsync(50);
    const summary = await promise;
    jest.useRealTimers();
    expect(tileFor(summary, 'growth.unique_visitors').value).toBe(994);
    expect(summary.degraded).toEqual([]);
  });

  it('passes the requested window through to the source', async () => {
    const deps = okDeps();
    const summary = await getCommandCenterSummary(deps, 7);
    expect(deps.getVisitorKpis).toHaveBeenCalledWith(7);
    expect(summary.windowDays).toBe(7);
  });
});
