/**
 * factoryApi hits the right endpoints through the shared axios client. The client itself (auth
 * header, 401 handling) is tested elsewhere; here we only pin the paths and the typed return.
 */
jest.mock('../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../utils/api';
import { getFactorySample, getFactoryContract } from './factoryApi';

const mockGet = (api as unknown as { get: jest.Mock }).get;

describe('factoryApi', () => {
  beforeEach(() => mockGet.mockReset());

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
});
