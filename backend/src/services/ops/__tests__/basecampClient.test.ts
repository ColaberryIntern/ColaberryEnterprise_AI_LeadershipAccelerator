/**
 * Tests for the basecampClient 401-refresh-and-retry behavior — the thing that
 * makes a Basecamp token rotation self-heal instead of failing the call.
 */
jest.mock('../basecampToken', () => {
  let tok = 'stale';
  return {
    getBcToken: jest.fn(() => tok),
    refreshBcToken: jest.fn(async () => { tok = 'fresh'; return tok; }),
    isAuthError: (s: number) => s === 401,
  };
});
// Keep the real backoff math/predicate, but make the waits instant in tests.
jest.mock('../bcRetry', () => ({
  ...jest.requireActual('../bcRetry'),
  sleep: jest.fn(() => Promise.resolve()),
  bcPace: jest.fn(() => Promise.resolve()),
}));

import { bcGet, bcPost } from '../basecampClient';
import { refreshBcToken } from '../basecampToken';

const headers = (retryAfter?: string) => ({ get: (k: string) => (k.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) });
const okResp = (data: unknown) => ({ ok: true, status: 200, headers: headers(), json: async () => data, text: async () => '' });
const errResp = (status: number, body = '', retryAfter?: string) => ({ ok: false, status, headers: headers(retryAfter), json: async () => ({}), text: async () => body });

beforeEach(() => {
  (refreshBcToken as jest.Mock).mockClear();
});

describe('bcGet', () => {
  it('returns the body on a first-try 200 (no refresh)', async () => {
    (global as any).fetch = jest.fn().mockResolvedValueOnce(okResp({ id: 1 }));
    const out = await bcGet<{ id: number }>('/projects.json');
    expect(out).toEqual({ id: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(refreshBcToken).not.toHaveBeenCalled();
  });

  it('refreshes the token and retries once on a 401, then succeeds', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(errResp(401, 'OAuth token expired'))
      .mockResolvedValueOnce(okResp({ id: 2 }));
    const out = await bcGet<{ id: number }>('/projects.json');
    expect(out).toEqual({ id: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(refreshBcToken).toHaveBeenCalledTimes(1);
  });

  it('throws if the retry after refresh still fails', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(errResp(401))
      .mockResolvedValueOnce(errResp(401, 'still bad'));
    await expect(bcGet('/x.json')).rejects.toThrow(/-> 401/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT refresh on a non-auth error (e.g. 500)', async () => {
    (global as any).fetch = jest.fn().mockResolvedValueOnce(errResp(500, 'boom'));
    await expect(bcGet('/x.json')).rejects.toThrow(/-> 500/);
    expect(refreshBcToken).not.toHaveBeenCalled();
  });

  it('backs off and retries on a 429, then succeeds (no token refresh)', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(errResp(429, 'rate limit', '1'))
      .mockResolvedValueOnce(okResp({ id: 9 }));
    const out = await bcGet<{ id: number }>('/projects.json');
    expect(out).toEqual({ id: 9 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(refreshBcToken).not.toHaveBeenCalled();
  });

  it('gives up after the retry cap on persistent 429s', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(errResp(429, 'still limited'));
    await expect(bcGet('/x.json')).rejects.toThrow(/-> 429/);
    // initial try + 5 retries
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });
});

describe('bcPost', () => {
  it('refreshes + retries once on a 401', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(errResp(401))
      .mockResolvedValueOnce(okResp({ ok: true }));
    const out = await bcPost<{ ok: boolean }>('/comments.json', { content: 'hi' });
    expect(out).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(refreshBcToken).toHaveBeenCalledTimes(1);
  });
});
