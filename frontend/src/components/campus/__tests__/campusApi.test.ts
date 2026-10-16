import portalApi from '../../../utils/portalApi';
import { fetchCampusFlags, CAMPUS_FLAGS_TIMEOUT_MS } from '../campusApi';

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = portalApi.get as jest.Mock;

describe('fetchCampusFlags (fails closed)', () => {
  it('passes through a true answer and sets an explicit timeout', async () => {
    get.mockResolvedValue({ data: { campus: true } });
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: true });
    expect(get).toHaveBeenCalledWith('/api/portal/campus/flags', { timeout: CAMPUS_FLAGS_TIMEOUT_MS });
  });

  it.each([
    ['false', { data: { campus: false } }],
    ['a truthy non-boolean', { data: { campus: 'true' } }],
    ['an empty body', { data: '' }],
    ['a null body', { data: null }],
  ])('reads %s as off', async (_n, resp) => {
    get.mockResolvedValue(resp);
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: false });
  });

  it('reads a network error, 401 or 404 as off', async () => {
    get.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } }));
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: false });
  });
});
