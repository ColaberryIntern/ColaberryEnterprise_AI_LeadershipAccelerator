import { pullRecentOpenHouseRegistrants, syncEventbriteOpenHouseLeads } from '../eventbriteOpenHouseSyncService';
import { ingestOpenHouseBatch } from '../openHouseIngestService';

const request = { input: jest.fn().mockReturnThis(), query: jest.fn() };
const pool = { connect: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined), request: jest.fn(() => request) };
jest.mock('mssql', () => ({ ConnectionPool: jest.fn(() => pool), Int: 'Int' }));
jest.mock('../../config/env', () => ({ env: { mssqlHost: 'h', mssqlPort: 1433, mssqlUser: 'u', mssqlPass: 'p', mssqlDatabase: 'CCPP' } }));
jest.mock('../openHouseIngestService', () => ({
  ingestOpenHouseBatch: jest.fn(),
}));

describe('eventbriteOpenHouseSyncService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps CCPP rows to warm (registered) participants, lowercased, junk filtered', async () => {
    request.query.mockResolvedValue({ recordset: [
      { email: 'A@X.io', name: 'Ada' },
      { email: '  bob@x.io ', name: 'Bob' },
      { email: 'not-an-email', name: 'Bad' },
      { email: '', name: 'Empty' },
    ] });
    const parts = await pullRecentOpenHouseRegistrants(90);
    expect(parts).toEqual([
      { email: 'a@x.io', name: 'Ada', registered: true },
      { email: 'bob@x.io', name: 'Bob', registered: true },
    ]);
    expect(pool.close).toHaveBeenCalled(); // pool closed even on success
  });

  it('sync pulls then ingests the participants and returns the count', async () => {
    request.query.mockResolvedValue({ recordset: [{ email: 'a@x.io', name: 'Ada' }] });
    (ingestOpenHouseBatch as jest.Mock).mockResolvedValue({ total: 1, created: 1, existing: 0, by_status: { registered: 1, attended: 0, paid: 0 }, raised: 1, activities: 1, failed: 0, failures: [], apply: true, outcomes: [] });
    const r = await syncEventbriteOpenHouseLeads({ days: 90, apply: true });
    expect(r.pulled).toBe(1);
    expect(r.window_days).toBe(90);
    expect((ingestOpenHouseBatch as jest.Mock).mock.calls[0][0]).toEqual([{ email: 'a@x.io', name: 'Ada', registered: true }]);
    expect((ingestOpenHouseBatch as jest.Mock).mock.calls[0][1]).toEqual({ apply: true });
  });
});
