import { getTypeExposureMap } from '../feedTypeExposureService';
import { sequelize } from '../../../config/database';

const mockQuery = jest.spyOn(sequelize, 'query');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTypeExposureMap', () => {
  it('boundary: no impression rows returns an empty map', async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    const map = await getTypeExposureMap('enr-1');
    expect(map.size).toBe(0);
  });

  it('happy path: aggregates multiple impressions of the same type into one entry with count and most-recent served_at', async () => {
    // The query itself does the GROUP BY; this mocks the aggregated result the SQL would produce.
    mockQuery.mockResolvedValueOnce([
      { type: 'ai_news_flash', n: '3', last: '2026-08-09T12:00:00.000Z' },
    ] as any);
    const map = await getTypeExposureMap('enr-1');
    expect(map.get('ai_news_flash')).toEqual({ count: 3, lastShownAt: new Date('2026-08-09T12:00:00.000Z') });
  });

  it('happy path: different types produce separate map entries', async () => {
    mockQuery.mockResolvedValueOnce([
      { type: 'ai_news_flash', n: '2', last: '2026-08-09T12:00:00.000Z' },
      { type: 'market_intelligence', n: '1', last: '2026-08-08T09:00:00.000Z' },
    ] as any);
    const map = await getTypeExposureMap('enr-1');
    expect(map.size).toBe(2);
    expect(map.get('ai_news_flash')?.count).toBe(2);
    expect(map.get('market_intelligence')?.count).toBe(1);
  });

  it('scopes the query to the given enrollment', async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await getTypeExposureMap('enr-42');
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/GROUP BY item->>'type'/);
    expect((opts as any).replacements).toEqual({ eid: 'enr-42' });
  });

  it('failure path: a DB error degrades to an empty map (fail-soft), never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));
    await expect(getTypeExposureMap('enr-1')).resolves.toEqual(new Map());
  });

  it('boundary: a row with a null type is skipped rather than corrupting the map', async () => {
    mockQuery.mockResolvedValueOnce([
      { type: null, n: '1', last: '2026-08-09T12:00:00.000Z' },
      { type: 'ai_news_flash', n: '1', last: '2026-08-09T12:00:00.000Z' },
    ] as any);
    const map = await getTypeExposureMap('enr-1');
    expect(map.size).toBe(1);
    expect(map.has('ai_news_flash')).toBe(true);
  });

  it('boundary: a null last_shown_at (impossible in practice since served_at is NOT NULL, but defensive) maps to lastShownAt: null', async () => {
    mockQuery.mockResolvedValueOnce([
      { type: 'ai_news_flash', n: '1', last: null },
    ] as any);
    const map = await getTypeExposureMap('enr-1');
    expect(map.get('ai_news_flash')).toEqual({ count: 1, lastShownAt: null });
  });
});
