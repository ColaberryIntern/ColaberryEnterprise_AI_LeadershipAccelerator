/**
 * No sibling test file exists for trustController.ts's other GET handlers today (a
 * pre-existing gap, not introduced here). Minimal happy/failure-path test for the new
 * handler, matching its own try/catch -> fail(res, ...) shape.
 */
jest.mock('../../services/trustMetricsService', () => ({ getRegistryHealth: jest.fn() }));

import { getRegistryHealth } from '../../services/trustMetricsService';
import { handleGetRegistryHealth } from '../trustController';

const getRegistryHealthMock = getRegistryHealth as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleGetRegistryHealth', () => {
  it('happy path: returns the service result as JSON', async () => {
    const health = { live: { count: 1, agents: [] } };
    getRegistryHealthMock.mockResolvedValue(health);
    const res = mockRes();

    await handleGetRegistryHealth({} as any, res);

    expect(res.json).toHaveBeenCalledWith(health);
  });

  it('failure path: a service error is caught, not thrown, and results in a non-200 response', async () => {
    getRegistryHealthMock.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await expect(handleGetRegistryHealth({} as any, res)).resolves.not.toThrow();
    expect(res.status).toHaveBeenCalled();
    expect(res.statusCode).not.toBe(200);
  });
});
