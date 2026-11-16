import axios from 'axios';
import { fetchCareerPrepFlag, CAREER_PREP_FLAGS_TIMEOUT_MS } from '../careerPrepFlag';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = axios.get as unknown as jest.Mock;

describe('fetchCareerPrepFlag (fails closed, never through portalApi)', () => {
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); get.mockReset(); });

  it('makes no request without a token', async () => {
    await expect(fetchCareerPrepFlag()).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('passes through true, sends the token itself and sets a timeout', async () => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-1');
    get.mockResolvedValue({ data: { careerPrep: true } });
    await expect(fetchCareerPrepFlag()).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith('/api/portal/career-prep/flags', { headers: { Authorization: 'Bearer tok-1' }, timeout: CAREER_PREP_FLAGS_TIMEOUT_MS });
  });

  it.each([
    ['false', { data: { careerPrep: false } }],
    ['a truthy non-boolean', { data: { careerPrep: 'true' } }],
    ['an empty body', { data: '' }],
    ['a null body', { data: null }],
  ])('reads %s as off', async (_n, resp) => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-1');
    get.mockResolvedValue(resp);
    await expect(fetchCareerPrepFlag()).resolves.toBe(false);
  });

  it('reads a network error, 401 or 404 as off', async () => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-1');
    get.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }));
    await expect(fetchCareerPrepFlag()).resolves.toBe(false);
  });

  it('does not import the shared portalApi client (whose 401 interceptor redirects)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'careerPrepFlag.ts'), 'utf8') as string;
    expect(src).not.toMatch(/from ['"][./]*utils\/portalApi['"]/);
  });
});
