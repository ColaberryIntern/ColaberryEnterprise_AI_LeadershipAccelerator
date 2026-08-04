/**
 * trustController — 24h activity detail (T009) + day-of-trend detail (T011).
 * Verifies the Zod validation branch (invalid kind / invalid date -> 400, BEFORE the
 * generic fail() 500 path) and the happy/failure paths for both handlers.
 */
jest.mock('../../services/trustMetricsService', () => ({
  getActivityDetail: jest.fn(),
  getActivityDetailForDay: jest.fn(),
}));

import { getActivityDetail, getActivityDetailForDay } from '../../services/trustMetricsService';
import { handleGetActivityDetail, handleGetActivityDetailForDay } from '../trustController';

const getActivityDetailMock = getActivityDetail as jest.Mock;
const getActivityDetailForDayMock = getActivityDetailForDay as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleGetActivityDetail', () => {
  it.each(['conversations', 'generations', 'agent-runs', 'errors'])(
    'happy path: kind=%s is passed through to the service and returned as JSON',
    async (kind) => {
      const payload = { kind, windowHours: 24, rows: [] };
      getActivityDetailMock.mockResolvedValue(payload);
      const res = mockRes();

      await handleGetActivityDetail({ params: { kind } } as any, res);

      expect(getActivityDetailMock).toHaveBeenCalledWith(kind);
      expect(res.json).toHaveBeenCalledWith(payload);
      expect(res.statusCode).toBe(200);
    }
  );

  it('boundary: an invalid kind is rejected with 400, and the service is never called', async () => {
    const res = mockRes();

    await handleGetActivityDetail({ params: { kind: 'not-a-real-kind' } } as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(getActivityDetailMock).not.toHaveBeenCalled();
  });

  it('boundary: a missing kind param is rejected with 400', async () => {
    const res = mockRes();
    await handleGetActivityDetail({ params: {} } as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('failure path: a service error results in a 500, not a throw', async () => {
    getActivityDetailMock.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await expect(handleGetActivityDetail({ params: { kind: 'conversations' } } as any, res)).resolves.not.toThrow();
    expect(res.statusCode).toBe(500);
  });
});

describe('handleGetActivityDetailForDay', () => {
  it('happy path: a valid YYYY-MM-DD date is passed through to the service', async () => {
    const payload = { date: '2026-07-30', counts: { conversations: 0, generations: 0, agentRuns: 0 }, conversations: [], generations: [], agentRuns: [] };
    getActivityDetailForDayMock.mockResolvedValue(payload);
    const res = mockRes();

    await handleGetActivityDetailForDay({ params: { date: '2026-07-30' } } as any, res);

    expect(getActivityDetailForDayMock).toHaveBeenCalledWith('2026-07-30');
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  it.each(['30-07-2026', '2026/07/30', 'not-a-date', '2026-13-45', ''])(
    'boundary: invalid date "%s" is rejected with 400, and the service is never called',
    async (date) => {
      const res = mockRes();
      await handleGetActivityDetailForDay({ params: { date } } as any, res);
      expect(res.statusCode).toBe(400);
      expect(getActivityDetailForDayMock).not.toHaveBeenCalled();
    }
  );

  it('failure path: a service error results in a 500, not a throw', async () => {
    getActivityDetailForDayMock.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await expect(handleGetActivityDetailForDay({ params: { date: '2026-07-30' } } as any, res)).resolves.not.toThrow();
    expect(res.statusCode).toBe(500);
  });
});
