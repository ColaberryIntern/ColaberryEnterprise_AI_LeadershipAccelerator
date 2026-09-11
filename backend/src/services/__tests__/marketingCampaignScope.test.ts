/**
 * The scope strip states a brand and a date range. This proves the campaigns query receives
 * BOTH - and neither when they are not supplied. Before this suite the brand never reached
 * the SQL and the date clause was built but never interpolated (true on main as well), so
 * the numbers under the strip were the same unfiltered table whatever it said.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));
jest.mock('../governanceService', () => ({ logAgentExecution: jest.fn().mockResolvedValue(undefined) }));

import { getCampaignMetrics, totalCampaignMetrics } from '../marketingAnalyticsService';

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
  it('start and end filter interaction outcomes and visitors, each on its own column', async () => {
    await getCampaignMetrics({ start: '2026-08-01', end: '2026-08-31' });
    const { sql, replacements } = lastSql();
    expect(sql).toContain('AND io.created_at >= :start AND io.created_at <= :end');
    expect(sql).toContain('AND v."createdAt" >= :start AND v."createdAt" <= :end');
    expect(replacements).toMatchObject({ start: '2026-08-01', end: '2026-08-31' });
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
    expect(sql).toContain('io.created_at >= :start');
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
