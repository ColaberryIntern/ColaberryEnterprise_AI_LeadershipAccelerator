/**
 * factoryApi hits the right endpoints through the shared axios client. The client itself (auth
 * header, 401 handling) is tested elsewhere; here we only pin the paths and the typed return.
 */
jest.mock('../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
import api from '../utils/api';
import {
  getFactorySample, getFactoryContract, listFactoryContracts, approveFactoryContract, requestFactoryChanges,
} from './factoryApi';

const mockGet = (api as unknown as { get: jest.Mock }).get;
const mockPost = (api as unknown as { post: jest.Mock }).post;

describe('factoryApi', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  it('getFactorySample calls the sample endpoint and returns the view', async () => {
    mockGet.mockResolvedValue({ data: { isSample: true, contractName: 'AI Government Contract Finder' } });
    const v = await getFactorySample();
    expect(mockGet).toHaveBeenCalledWith('/api/admin/factory/sample');
    expect(v.isSample).toBe(true);
    expect(v.contractName).toBe('AI Government Contract Finder');
  });

  it('getFactoryContract calls the contract endpoint with the id encoded', async () => {
    mockGet.mockResolvedValue({ data: { isSample: false, deliveryProjectId: 'dp-1' } });
    const v = await getFactoryContract('dp-1');
    expect(mockGet).toHaveBeenCalledWith('/api/admin/factory/contract/dp-1');
    expect(v.isSample).toBe(false);
  });

  it('listFactoryContracts returns the contracts array', async () => {
    mockGet.mockResolvedValue({ data: { contracts: [{ deliveryProjectId: 'dp-1', name: 'A', trackType: 'solution_build', status: 'draft', version: 1 }] } });
    const list = await listFactoryContracts();
    expect(mockGet).toHaveBeenCalledWith('/api/admin/factory/contracts');
    expect(list).toHaveLength(1);
    expect(list[0].deliveryProjectId).toBe('dp-1');
  });

  it('approveFactoryContract posts the body to the approve endpoint', async () => {
    mockPost.mockResolvedValue({ data: { id: 'd2', version: 2, status: 'documented' } });
    const body = { trackType: 'solution_build', expectedVersion: 1, level: 'documented' as const, enrichmentStatus: 'partial' as const };
    const res = await approveFactoryContract('dp-1', body);
    expect(mockPost).toHaveBeenCalledWith('/api/admin/factory/contract/dp-1/approve', body);
    expect(res.version).toBe(2);
  });

  it('requestFactoryChanges posts the reason to the request-changes endpoint', async () => {
    mockPost.mockResolvedValue({ data: { id: 'rev-1', decision: 'changes_requested' } });
    const body = { trackType: 'solution_build', reviewedVersion: 1, reason: 'tighten oversight' };
    const res = await requestFactoryChanges('dp-1', body);
    expect(mockPost).toHaveBeenCalledWith('/api/admin/factory/contract/dp-1/request-changes', body);
    expect(res.decision).toBe('changes_requested');
  });
});
