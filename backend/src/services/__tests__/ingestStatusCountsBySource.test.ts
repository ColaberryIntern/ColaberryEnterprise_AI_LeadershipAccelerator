/**
 * ingestStatusCountsBySource — BC #10099862873 (P1 follow-up): pivots raw
 * (source_slug, status, count) rows into a per-source breakdown so
 * dashboardThresholdWatcherService.ts can name the specific failing source
 * in an ingest-error-spike alert, not just the aggregate rate.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { ingestStatusCountsBySource } from '../ingestStatsService';
import { sequelize } from '../../config/database';

const mockQuery = sequelize.query as jest.Mock;

describe('ingestStatusCountsBySource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: pivots multiple statuses per source into one row per source', async () => {
    mockQuery.mockResolvedValue([
      { source_slug: 'apollo_import', status: 'accepted', count: '18' },
      { source_slug: 'apollo_import', status: 'rejected', count: '2' },
      { source_slug: 'linkedin_webhook', status: 'error', count: '5' },
    ]);

    const result = await ingestStatusCountsBySource(2);

    expect(result).toEqual([
      { source_slug: 'apollo_import', accepted: 18, rejected: 2, error: 0, pending: 0 },
      { source_slug: 'linkedin_webhook', accepted: 0, rejected: 0, error: 5, pending: 0 },
    ]);
  });

  it('boundary: no rows in the window returns an empty array, not null/undefined', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await ingestStatusCountsBySource(2);
    expect(result).toEqual([]);
  });

  it('boundary: a null source_slug is grouped under "unknown" rather than dropped', async () => {
    mockQuery.mockResolvedValue([
      { source_slug: 'unknown', status: 'error', count: '3' },
    ]);

    const result = await ingestStatusCountsBySource(2);

    expect(result).toEqual([{ source_slug: 'unknown', accepted: 0, rejected: 0, error: 3, pending: 0 }]);
  });
});
