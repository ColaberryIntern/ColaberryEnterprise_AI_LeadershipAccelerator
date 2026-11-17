import express from 'express';
import request from 'supertest';

const m = { query: jest.fn() };

jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
jest.mock('../../middlewares/authMiddleware', () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import commercializationRoutes from '../admin/commercializationRoutes';

/**
 * C8.2 — the Commercialization Command Center route and the board behind it.
 *
 * THE MOUNT PROOF IS THE POINT OF THIS FILE. `/api/admin` blanket-401s before routing,
 * so a 401 never distinguished "the route exists and refused me" from "the route was
 * never mounted". Here the router is mounted on a bare app with auth stubbed out, so a
 * 200 with a real body is positive evidence that the path serves.
 *
 * The rest asserts the behavior that makes the board trustworthy: a zero is only
 * printed when a real table is really empty, and the board corrects itself in both
 * directions without anyone editing the registry.
 */
interface Opts { replacements?: { name?: string } }

/**
 * The revenue row shape, which changed on 2026-11-16.
 *
 * It used to be one row per plan (`{ plan, cents }`) that the service multiplied by a
 * per-plan table. The figure now composes `PAYING_MEMBERS_CTE` — the shared definition the
 * marketing surfaces already used — and comes back as ONE row: the total plus a count per
 * exclusion bucket. The old shape disagreed with that CTE by $26,268 a year on production.
 */
interface RevenueRow {
  cents: string; people: string; lapsed: string; no_period: string; staff: string; duplicate: string;
}

function revenueRow(over: Partial<RevenueRow> = {}): RevenueRow {
  return {
    cents: '6207600', people: '30', lapsed: '0', no_period: '0', staff: '0', duplicate: '0', ...over,
  };
}

function mockDb(opts: {
  presentTables: string[];
  counts?: Record<string, number>;
  revenue?: RevenueRow[];
}) {
  const counts = opts.counts ?? {};
  m.query.mockImplementation((sql: string, o: Opts) => {
    if (sql.includes('information_schema.tables')) {
      const name = o?.replacements?.name ?? '';
      return Promise.resolve([{ n: opts.presentTables.includes(name) ? 1 : 0 }]);
    }
    // The revenue query is now identifiable by the shared CTE rather than by GROUP BY.
    if (sql.includes('paying AS (')) {
      return Promise.resolve(opts.revenue ?? [revenueRow()]);
    }
    const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
    return Promise.resolve([{ n: counts[table] ?? 0 }]);
  });
}

function app() {
  const a = express();
  a.use(commercializationRoutes);
  return a;
}

const ALL_TABLES = [
  'subscriptions', 'revenue_opportunities', 'delivery_engagements',
  'delivery_contracts', 'interaction_outcomes',
];

beforeEach(() => m.query.mockReset());

describe('GET /api/admin/commercialization/board', () => {
  it('is mounted and serves a board — proven by a 200 body, not by a 401', async () => {
    mockDb({ presentTables: ALL_TABLES });

    const res = await request(app()).get('/api/admin/commercialization/board');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tiles).toHaveLength(10);
    // A 404 here would be the real failure mode: the router not wired at all.
    expect(res.status).not.toBe(404);
  });

  it('serves the annualized figure the shared revenue rule produced', async () => {
    mockDb({ presentTables: ALL_TABLES, revenue: [revenueRow({ cents: '6207600' })] });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const revenue = res.body.data.tiles.find((t: { key: string }) => t.key === 'annualized_revenue');

    expect(revenue.status).toBe('live');
    expect(revenue.value).toBe('$62,076');
    // No caveat when every active paying row was collectible. Silence is a claim here, so
    // it must not be manufactured — see the exclusion cases below.
    expect(revenue.caveat).toBeUndefined();
  });

  it('asks the database for the SHARED definition, not a local one', async () => {
    // This test exists because the two disagreed for two months. The route-level proof that
    // they cannot drift again is that the query carries the marketing CTE and the period
    // check, rather than this service re-deriving the rule.
    mockDb({ presentTables: ALL_TABLES });

    await request(app()).get('/api/admin/commercialization/board');

    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => s.includes('paying AS ('));
    expect(sql).toBeDefined();
    expect(sql).toContain('current_period_end >= now()');
    expect(sql).toContain('DISTINCT ON');
  });

  /**
   * This replaces 'flags an unrecognized plan instead of silently dropping its revenue'.
   *
   * That test guarded a real principle — a quiet exclusion is the failure this board exists
   * to prevent — against a mechanism that no longer exists: there is no per-plan multiplier
   * table to miss a plan, because the CTE resolves every plan to a monthly-equivalent MRR
   * and admits only `annual` and `monthly`. The principle is now carried by the exclusion
   * buckets, so it is asserted against those instead of deleted with the mechanism.
   */
  it('names what it excluded instead of quietly reporting a smaller number', async () => {
    mockDb({
      presentTables: ALL_TABLES,
      revenue: [revenueRow({ cents: '4298400', people: '18', lapsed: '8', staff: '3' })],
    });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const revenue = res.body.data.tiles.find((t: { key: string }) => t.key === 'annualized_revenue');

    expect(revenue.value).toBe('$42,984');
    expect(revenue.caveat).toContain('18 paying member(s)');
    expect(revenue.caveat).toContain('8 active row(s)');
    expect(revenue.caveat).toContain('3 staff row(s)');
  });

  it('degrades the revenue tile alone when its query fails, keeping the other nine', async () => {
    // The board assembles with an unguarded Promise.all, so an exception here used to blank
    // all ten tiles. The query now joins `enrollments` and `community_members`, which are two
    // more tables that can be absent.
    m.query.mockImplementation((sql: string, o: Opts) => {
      if (sql.includes('information_schema.tables')) {
        const name = o?.replacements?.name ?? '';
        return Promise.resolve([{ n: ALL_TABLES.includes(name) ? 1 : 0 }]);
      }
      if (sql.includes('paying AS (')) {
        return Promise.reject(new Error('relation "community_members" does not exist'));
      }
      return Promise.resolve([{ n: 0 }]);
    });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const revenue = res.body.data.tiles.find((t: { key: string }) => t.key === 'annualized_revenue');

    expect(res.status).toBe(200);
    expect(res.body.data.tiles).toHaveLength(10);
    expect(revenue.status).toBe('unmeasurable');
    expect(revenue.value).toBeNull();
    expect(revenue.caveat).toContain('community_members');
  });

  it('reports a measured zero when the table is present and empty', async () => {
    mockDb({ presentTables: ALL_TABLES, counts: { revenue_opportunities: 0 } });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const pipeline = res.body.data.tiles.find((t: { key: string }) => t.key === 'qualified_pipeline');

    expect(pipeline.status).toBe('measured_zero');
    expect(pipeline.value).toBe('0');
    expect(pipeline.sourceTable).toBe('revenue_opportunities');
  });

  it('DEGRADES a measured zero to unmeasurable when its table is missing', async () => {
    // "0" and "I cannot see" must never print the same. This is the single most
    // important behavior in the service.
    mockDb({ presentTables: ALL_TABLES.filter((t) => t !== 'revenue_opportunities') });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const pipeline = res.body.data.tiles.find((t: { key: string }) => t.key === 'qualified_pipeline');

    expect(pipeline.status).toBe('unmeasurable');
    expect(pipeline.value).toBeNull();
    expect(pipeline.sourceTable).toBeNull();
    expect(pipeline.caveat).toContain('not present');
  });

  it('PROMOTES a declared zero once somebody starts recording', async () => {
    // The board should start telling the truth the day the pipe gets a writer,
    // rather than printing a stale zero until this file is edited.
    mockDb({ presentTables: ALL_TABLES, counts: { revenue_opportunities: 7 } });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const pipeline = res.body.data.tiles.find((t: { key: string }) => t.key === 'qualified_pipeline');

    expect(pipeline.status).toBe('proxy');
    expect(pipeline.caveat).toContain('7 row(s)');
  });

  it('never shows a win rate of zero', async () => {
    mockDb({ presentTables: ALL_TABLES, counts: { revenue_opportunities: 0 } });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const win = res.body.data.tiles.find((t: { key: string }) => t.key === 'win_rate');

    expect(win.status).toBe('undefined_rate');
    expect(win.value).toBeNull();
  });

  it('summarizes the board by status so the gap is visible at a glance', async () => {
    mockDb({ presentTables: ALL_TABLES, counts: { delivery_engagements: 2, interaction_outcomes: 9 } });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const { summary } = res.body.data;

    expect(summary.live).toBe(1);
    expect(summary.unmeasurable).toBeGreaterThanOrEqual(4);
    const total = Object.values(summary).reduce((a, b) => (a as number) + (b as number), 0);
    expect(total).toBe(10);
  });
});
