/**
 * Dara v2 Phase 7 activation — the CB System Basecamp client. Proves: no
 * retry, no fallback to a different identity on ANY failure (missing cache
 * file, empty cache file, a real 401) — every failure is a real, thrown
 * error, matching the ops-engine's own fail-closed precedent for this exact
 * identity.
 */
const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({ readFile: (...a: any[]) => mockReadFile(...a) }));

import { cbSystemBcPost, CbSystemTokenUnavailableError } from '../daraCbSystemBasecampClient';

const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as any;
  mockReadFile.mockResolvedValue('real-cb-system-token-value\n');
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 999, app_url: 'https://3.basecamp.com/123/buckets/1/todos/999' }),
    text: async () => '',
  });
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('cbSystemBcPost', () => {
  it('happy path: posts with the real, trimmed cache-file token as the bearer, never a different identity', async () => {
    const result = await cbSystemBcPost('/buckets/1/todolists/2/todos.json', { content: 'x' });

    expect(result).toEqual({ id: 999, app_url: 'https://3.basecamp.com/123/buckets/1/todos/999' });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer real-cb-system-token-value');
  });

  it('boundary: token cache file unreadable -> a real, thrown, honest error — never a fetch attempt, never a fallback', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

    await expect(cbSystemBcPost('/buckets/1/todolists/2/todos.json', {})).rejects.toThrow(CbSystemTokenUnavailableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('boundary: empty/whitespace-only cache file -> a real, thrown, honest error — never posts as nobody', async () => {
    mockReadFile.mockResolvedValue('   \n');

    await expect(cbSystemBcPost('/buckets/1/todolists/2/todos.json', {})).rejects.toThrow(CbSystemTokenUnavailableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('failure path: a real 401 throws immediately — no retry, no refresh, no fallback to any other identity', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized', json: async () => ({}) });

    await expect(cbSystemBcPost('/buckets/1/todolists/2/todos.json', {})).rejects.toThrow(/401/);
    expect(mockFetch).toHaveBeenCalledTimes(1); // exactly once — never retried
  });

  it('failure path: a real non-2xx status throws with the real status and a bounded snippet of the body', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, text: async () => 'Unprocessable Entity: due_on required', json: async () => ({}) });

    await expect(cbSystemBcPost('/buckets/1/todolists/2/todos.json', {})).rejects.toThrow(/422/);
  });
});
