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

function mockDb(opts: {
  presentTables: string[];
  counts?: Record<string, number>;
  subscriptionRows?: Array<{ plan: string; cents: string }>;
}) {
  const counts = opts.counts ?? {};
  m.query.mockImplementation((sql: string, o: Opts) => {
    if (sql.includes('information_schema.tables')) {
      const name = o?.replacements?.name ?? '';
      return Promise.resolve([{ n: opts.presentTables.includes(name) ? 1 : 0 }]);
    }
    if (sql.includes('FROM subscriptions') && sql.includes('GROUP BY')) {
      return Promise.resolve(opts.subscriptionRows ?? []);
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

  it('annualizes monthly and annual plans on their own cadences', async () => {
    mockDb({
      presentTables: ALL_TABLES,
      subscriptionRows: [
        { plan: 'monthly', cents: '457700' },   // $4,577/mo -> $54,924/yr
        { plan: 'annual', cents: '715200' },    // $7,152/yr  -> $7,152/yr
      ],
    });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const revenue = res.body.data.tiles.find((t: { key: string }) => t.key === 'annualized_revenue');

    expect(revenue.status).toBe('live');
    expect(revenue.value).toBe('$62,076');
    expect(revenue.caveat).toBeUndefined();
  });

  it('flags an unrecognized plan instead of silently dropping its revenue', async () => {
    // Silently excluding a plan would understate revenue with nothing in the output
    // to show it happened — the quiet failure this board exists to prevent.
    mockDb({
      presentTables: ALL_TABLES,
      subscriptionRows: [
        { plan: 'monthly', cents: '100000' },
        { plan: 'quarterly', cents: '900000' },
      ],
    });

    const res = await request(app()).get('/api/admin/commercialization/board');
    const revenue = res.body.data.tiles.find((t: { key: string }) => t.key === 'annualized_revenue');

    expect(revenue.value).toBe('$12,000');
    expect(revenue.caveat).toContain('quarterly');
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
