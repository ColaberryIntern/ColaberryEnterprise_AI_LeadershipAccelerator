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

// ─── /inbox-zero T6 (CC-20260910-3q7x): timeouts + pagination ───────────────
// Before this, no fetch in this client carried a signal, so a Basecamp stall
// hung the caller forever; and there was no paginator, so every TypeScript
// read of a collection was silently first-page-only.
import { bcGetAll, bcPut, BcTimeoutError, BC_DEFAULT_MAX_PAGES } from '../basecampClient';
import { parseNextLink, bcTimeoutMs, BC_DEFAULT_TIMEOUT_MS } from '../bcRetry';

const abortErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const pageResp = (data: unknown, nextUrl?: string) => ({
  ok: true,
  status: 200,
  headers: { get: (k: string) => (k.toLowerCase() === 'link' && nextUrl ? `<${nextUrl}>; rel="next"` : null) },
  json: async () => data,
  text: async () => '',
});

describe('timeouts', () => {
  afterEach(() => { delete process.env.BC_TIMEOUT_MS; });

  it('passes an AbortSignal to every fetch (GET, POST, PUT)', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(okResp({}));
    await bcGet('/a.json');
    await bcPost('/b.json', {});
    await bcPut('/c.json', {});
    for (const call of (global.fetch as jest.Mock).mock.calls) {
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('retries a timed-out attempt inside the retry budget, then succeeds', async () => {
    (global as any).fetch = jest.fn().mockRejectedValueOnce(abortErr()).mockResolvedValueOnce(okResp({ id: 3 }));
    expect(await bcGet('/x.json')).toEqual({ id: 3 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces a classified TimeoutError after the retry cap instead of hanging', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(abortErr());
    const p = bcGet('/x.json');
    await expect(p).rejects.toBeInstanceOf(BcTimeoutError);
    await expect(p).rejects.toMatchObject({ error_class: 'TimeoutError', attempts: 6 });
    expect(global.fetch).toHaveBeenCalledTimes(6); // initial + 5 retries, same budget as a 429
  });

  it('does not treat a non-abort rejection as a timeout', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(bcGet('/x.json')).rejects.toThrow('ECONNRESET');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('bcTimeoutMs reads the env override at call time and falls back to the default', () => {
    expect(bcTimeoutMs()).toBe(BC_DEFAULT_TIMEOUT_MS);
    process.env.BC_TIMEOUT_MS = '2500';
    expect(bcTimeoutMs()).toBe(2500);
    process.env.BC_TIMEOUT_MS = 'nonsense';
    expect(bcTimeoutMs()).toBe(BC_DEFAULT_TIMEOUT_MS);
  });
});

describe('parseNextLink', () => {
  it('extracts the rel="next" URL from a Basecamp Link header', () => {
    expect(parseNextLink('<https://3.basecampapi.com/1/buckets/2/todos.json?page=2>; rel="next"')).toBe('https://3.basecampapi.com/1/buckets/2/todos.json?page=2');
  });
  it('returns null when there is no next page or no header', () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://x/y?page=1>; rel="prev"')).toBeNull();
  });
});

describe('bcGetAll', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('a single-page collection issues exactly one request', async () => {
    (global as any).fetch = jest.fn().mockResolvedValueOnce(pageResp([{ id: 1 }, { id: 2 }]));
    expect(await bcGetAll('/todos.json')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows Link rel="next" and returns every page in order', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(pageResp([{ id: 1 }], 'https://3.basecampapi.com/x/todos.json?page=2'))
      .mockResolvedValueOnce(pageResp([{ id: 2 }], 'https://3.basecampapi.com/x/todos.json?page=3'))
      .mockResolvedValueOnce(pageResp([{ id: 3 }]));
    expect(await bcGetAll('/todos.json')).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://3.basecampapi.com/x/todos.json?page=2');
  });

  it('stops at the page cap and logs it rather than truncating silently', async () => {
    (global as any).fetch = jest.fn().mockImplementation(async (url: string) => pageResp([{ url }], `${url}&more`));
    const out = await bcGetAll('/todos.json', { maxPages: 3 });
    expect(out).toHaveLength(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const warned = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(warned.some((l) => l.includes('basecamp_pagination_capped') && l.includes('"max_pages":3'))).toBe(true);
  });

  it('defaults the cap to BC_DEFAULT_MAX_PAGES', () => {
    expect(BC_DEFAULT_MAX_PAGES).toBe(20);
  });
});
