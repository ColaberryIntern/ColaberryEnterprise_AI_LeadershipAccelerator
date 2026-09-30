/**
 * trustController — Phase B Trust 90+ drill-down handlers with no input validation
 * (T008 composite-breakdown, T010 blocked-writes, T012 agent-registry-detail). Matches the
 * happy/failure-path shape of trustController.registryHealth.test.ts — no sibling test file
 * exists for the other simple GET handlers today (a pre-existing gap, not introduced here).
 */
jest.mock('../../services/trustMetricsService', () => ({
  getCompositeBreakdown: jest.fn(),
  getBlockedWrites: jest.fn(),
  getAgentRegistryDetail: jest.fn(),
}));

import { getCompositeBreakdown, getBlockedWrites, getAgentRegistryDetail } from '../../services/trustMetricsService';
import { handleGetCompositeBreakdown, handleGetBlockedWrites, handleGetAgentRegistryDetail } from '../trustController';

const getCompositeBreakdownMock = getCompositeBreakdown as jest.Mock;
const getBlockedWritesMock = getBlockedWrites as jest.Mock;
const getAgentRegistryDetailMock = getAgentRegistryDetail as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleGetCompositeBreakdown', () => {
  it('happy path: returns the service result as JSON', async () => {
    const breakdown = { compositeTrustScore: 62, band: 'amber', rows: [], source: 'x' };
    getCompositeBreakdownMock.mockResolvedValue(breakdown);
    const res = mockRes();

    await handleGetCompositeBreakdown({} as any, res);

    expect(res.json).toHaveBeenCalledWith(breakdown);
  });

  it('failure path: a service error is caught, not thrown', async () => {
    getCompositeBreakdownMock.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await expect(handleGetCompositeBreakdown({} as any, res)).resolves.not.toThrow();
    expect(res.statusCode).toBe(500);
  });
});

describe('handleGetBlockedWrites', () => {
  it('happy path: returns the service result as JSON', async () => {
    const payload = { windowHours: 24, rows: [] };
    getBlockedWritesMock.mockResolvedValue(payload);
    const res = mockRes();

    await handleGetBlockedWrites({} as any, res);

    expect(res.json).toHaveBeenCalledWith(payload);
  });

  it('failure path: a service error is caught, not thrown', async () => {
    getBlockedWritesMock.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await expect(handleGetBlockedWrites({} as any, res)).resolves.not.toThrow();
    expect(res.statusCode).toBe(500);
  });
});

describe('handleGetAgentRegistryDetail', () => {
  it('happy path: returns the service result as JSON', async () => {
    const detail = { agentName: 'PromptMonitorAgent', runCount: 5 };
    getAgentRegistryDetailMock.mockResolvedValue(detail);
    const res = mockRes();

    await handleGetAgentRegistryDetail({ params: { name: 'PromptMonitorAgent' } } as any, res);

    expect(getAgentRegistryDetailMock).toHaveBeenCalledWith('PromptMonitorAgent');
    expect(res.json).toHaveBeenCalledWith(detail);
  });

  it('boundary: an unknown agent name is a 404, matching handleGetAgentDetail\'s convention', async () => {
    getAgentRegistryDetailMock.mockResolvedValue(null);
    const res = mockRes();

    await handleGetAgentRegistryDetail({ params: { name: 'NoSuchAgent' } } as any, res);

    expect(res.statusCode).toBe(404);
  });

  it('failure path: a service error is caught, not thrown', async () => {
    getAgentRegistryDetailMock.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await expect(handleGetAgentRegistryDetail({ params: { name: 'x' } } as any, res)).resolves.not.toThrow();
    expect(res.statusCode).toBe(500);
  });
});
