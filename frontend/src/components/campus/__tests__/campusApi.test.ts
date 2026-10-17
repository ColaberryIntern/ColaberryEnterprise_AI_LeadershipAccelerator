import axios from 'axios';
import { fetchCampusFlags, CAMPUS_FLAGS_TIMEOUT_MS } from '../campusApi';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = axios.get as unknown as jest.Mock;

describe('fetchCampusFlags (fails closed, never through portalApi)', () => {
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

  it('makes no request without a token', async () => {
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: false });
    expect(get).not.toHaveBeenCalled();
  });

  it('passes through a true answer, sends the token itself and sets an explicit timeout', async () => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-1');
    get.mockResolvedValue({ data: { campus: true } });
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: true });
    expect(get).toHaveBeenCalledWith('/api/portal/campus/flags', { headers: { Authorization: 'Bearer tok-1' }, timeout: CAMPUS_FLAGS_TIMEOUT_MS });
  });

  it.each([
    ['false', { data: { campus: false } }],
    ['a truthy non-boolean', { data: { campus: 'true' } }],
    ['an empty body', { data: '' }],
    ['a null body', { data: null }],
  ])('reads %s as off', async (_n, resp) => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-1');
    get.mockResolvedValue(resp);
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: false });
  });

  it('reads a network error, 401 or 404 as off', async () => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-1');
    get.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } }));
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: false });
  });

  it('does not import the shared portalApi client (whose 401 interceptor redirects)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'campusApi.ts'), 'utf8') as string;
    expect(src).not.toMatch(/from ['"][./]*utils\/portalApi['"]/);
  });
});
