/**
 * The scope strip states a brand and a date range. This proves the campaigns query receives
 * BOTH - and neither when they are not supplied. Before this suite the brand never reached
 * the SQL and the date clause was built but never interpolated (true on main as well), so
 * the numbers under the strip were the same unfiltered table whatever it said.
 */

const mockQuery = jest.fn();
// A REAL Sequelize instance (never connected) so the models can init against it - the column
// assertion below reads Visitor/InteractionOutcome's declared attributes - with `query` stubbed.
jest.mock('../../config/database', () => {
  const { Sequelize } = jest.requireActual('sequelize');
  const sequelize = new Sequelize('postgres://never:never@127.0.0.1:1/never', { logging: false });
  sequelize.query = (...a: unknown[]) => mockQuery(...a);
  return { sequelize };
});
jest.mock('../governanceService', () => ({ logAgentExecution: jest.fn().mockResolvedValue(undefined) }));

import { ACTIVITY_DATE_COLUMNS, buildDateFilter, getCampaignMetrics, totalCampaignMetrics } from '../marketingAnalyticsService';
import Visitor from '../../models/Visitor';
import InteractionOutcome from '../../models/InteractionOutcome';

function lastSql(): { sql: string; replacements: Record<string, unknown> } {
  const [sql, opts] = mockQuery.mock.calls.at(-1) as [string, { replacements: Record<string, unknown> }];
  return { sql: sql.replace(/\s+/g, ' '), replacements: opts.replacements };
}

beforeEach(() => { mockQuery.mockReset().mockResolvedValue([]); });

describe('brand scope reaches the SQL', () => {
  it('with a brand: the campaigns WHERE carries the brand id as a bound replacement', async () => {
    await getCampaignMetrics({ brandId: 'b0000000-0000-4000-8000-000000000001' });
    const { sql, replacements } = lastSql();
    expect(sql).toContain('AND c.brand_id = :brandId');
    expect(replacements.brandId).toBe('b0000000-0000-4000-8000-000000000001');
    expect(sql).not.toContain('b0000000'); // bound, never interpolated
  });

  it('without a brand: no brand clause and no brand replacement', async () => {
    await getCampaignMetrics({});
    const { sql, replacements } = lastSql();
    expect(sql).not.toContain('brand_id = :brandId');
    expect(replacements.brandId).toBeUndefined();
  });
});

describe('the date range reaches BOTH activity sources', () => {
  it('the columns the clause names are columns the models DECLARE - a check a mocked query cannot fake', () => {
    // Attempt 2 of this task shipped `v."createdAt"`: a literal nothing had ever executed,
    // made live, on a table whose column is `created_at`. The SQL-text test passed because it
    // pinned the same wrong string. This assertion goes to the model definition instead.
    expect(Object.keys(Visitor.getAttributes())).toContain(ACTIVITY_DATE_COLUMNS.visitors);
    expect(Object.keys(InteractionOutcome.getAttributes())).toContain(ACTIVITY_DATE_COLUMNS.interaction_outcomes);
    // And neither model is a Sequelize-timestamped one, so there is no camelCase alias to fall back on.
    expect(Object.keys(Visitor.getAttributes())).not.toContain('createdAt');
    expect(Object.keys(InteractionOutcome.getAttributes())).not.toContain('createdAt');
  });

  it('start and end filter interaction outcomes and visitors, each on its declared column', async () => {
    await getCampaignMetrics({ start: '2026-08-01', end: '2026-08-31' });
    const { sql, replacements } = lastSql();
    expect(sql).toContain(`AND io.${ACTIVITY_DATE_COLUMNS.interaction_outcomes} >= CAST(:start AS date)`);
    expect(sql).toContain(`AND v.${ACTIVITY_DATE_COLUMNS.visitors} >= CAST(:start AS date)`);
    expect(replacements).toMatchObject({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('the end day is INCLUSIVE: the bound is strictly before the following day, never <= midnight', () => {
    const f = buildDateFilter({ start: '2026-08-01', end: '2026-08-31' });
    const clause = f.clauseFor('x.created_at');
    expect(clause).toBe("AND x.created_at >= CAST(:start AS date) AND x.created_at < (CAST(:end AS date) + INTERVAL '1 day')");
    expect(clause).not.toContain('<= :end');
  });

  it('no range: no date clause at all', async () => {
    await getCampaignMetrics();
    const { sql, replacements } = lastSql();
    expect(sql).not.toContain(':start');
    expect(sql).not.toContain(':end');
    expect(replacements.start).toBeUndefined();
  });

  it('start only: only the lower bound', async () => {
    await getCampaignMetrics({ start: '2026-08-01' });
    const { sql } = lastSql();
    expect(sql).toContain('io.created_at >= CAST(:start AS date)');
    expect(sql).not.toContain(':end');
  });
});

describe('comparison totals', () => {
  it('sums the trusted counts and nothing else', () => {
    const t = totalCampaignMetrics([
      { visitors_count: 10, leads_count: 4, engagement_count: 6, enrollments_count: 1 },
      { visitors_count: 5, leads_count: 1, engagement_count: 0, enrollments_count: 0 },
    ]);
    expect(t).toEqual({ campaigns: 2, visitors_count: 15, leads_count: 5, engagement_count: 6, enrollments_count: 1 });
    expect(Object.keys(t)).not.toContain('revenue');
  });

  it('an empty period is zeros, not an error', () => {
    expect(totalCampaignMetrics([]).campaigns).toBe(0);
  });
});
