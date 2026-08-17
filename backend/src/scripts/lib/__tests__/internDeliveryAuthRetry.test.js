/**
 * Tests for Basecamp 401 recovery in the Intern Delivery harvester.
 *
 * WHY THIS SUITE EXISTS
 * On 2026-08-17 the 08:45 CT briefing died on a single 401 from
 * /todosets/.../todolists.json. The token was NOT expired: the byte-identical
 * token probed 200 at 08:00, 401 at 08:45, and 200 again nine minutes later.
 * 401 fell through to the non-retryable branch, so one transient upstream auth
 * failure took out the whole morning report.
 *
 * The invariants pinned here are the ones that let that happen, plus the ones
 * that would make the fix worse than the bug (hammering CCPP on every 401,
 * replaying an identical request with an identical token, or retrying forever).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  createTokenSource,
  bcFetch,
  AUTH_MAX_ATTEMPTS,
  MAX_TOKEN_REFRESHES,
} = require('../internDeliveryData');

const URL = 'https://3.basecampapi.com/3945211/projects.json';

function response(status, body = []) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  };
}

/** Drive a promise to settlement while fake timers stand in for the backoff. */
async function settle(promise) {
  const tracked = promise.then(
    (v) => ({ ok: true, value: v }),
    (e) => ({ ok: false, error: e })
  );
  let done = false;
  tracked.then(() => { done = true; });
  for (let i = 0; i < 50 && !done; i += 1) {
    await jest.advanceTimersByTimeAsync(60000);
  }
  return tracked;
}

/** Bearer token actually sent on a given fetch call. */
function tokenOnCall(call) {
  return call[1].headers.Authorization.replace(/^Bearer\s+/, '');
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  delete global.fetch;
});

describe('bcFetch 401 recovery', () => {
  it('returns immediately on 200 without touching the resolver', async () => {
    global.fetch = jest.fn(async () => response(200));
    const refresh = jest.fn();
    const auth = createTokenSource('good-token', refresh);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(true);
    expect(r.value.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-resolves the token on 401 and retries with the NEW value', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(async () => response(401))
      .mockImplementationOnce(async () => response(200));
    const refresh = jest.fn(async () => 'rotated-token');
    const auth = createTokenSource('stale-token', refresh);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(true);
    expect(r.value.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // The retry must carry the rotated token, not the stale one.
    expect(tokenOnCall(global.fetch.mock.calls[0])).toBe('stale-token');
    expect(tokenOnCall(global.fetch.mock.calls[1])).toBe('rotated-token');
  });

  it('a rotated token sticks for every later request in the same run', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(async () => response(401))
      .mockImplementation(async () => response(200));
    const auth = createTokenSource('stale-token', async () => 'rotated-token');

    await settle(bcFetch(URL, auth));
    await settle(bcFetch(URL, auth));

    // Third call is the second bcFetch: it must not fall back to the stale token.
    expect(tokenOnCall(global.fetch.mock.calls[2])).toBe('rotated-token');
    expect(auth.get()).toBe('rotated-token');
  });

  it('treats an unchanged token as no rotation and waits instead of hot-looping', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(async () => response(401))
      .mockImplementationOnce(async () => response(200));
    // The resolver hands back the SAME token: CCPP has not rotated, so the only
    // thing that can help is waiting out the upstream blip.
    const refresh = jest.fn(async () => 'same-token');
    const auth = createTokenSource('same-token', refresh);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(true);
    expect(r.value.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers from a transient 401 with no resolver wired at all', async () => {
    // This is the 2026-08-17 shape exactly: valid token, upstream says 401,
    // upstream then says 200. Nothing to re-resolve; only backoff saves it.
    global.fetch = jest.fn()
      .mockImplementationOnce(async () => response(401))
      .mockImplementationOnce(async () => response(401))
      .mockImplementationOnce(async () => response(200));
    const auth = createTokenSource('valid-token', null);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(true);
    expect(r.value.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up with AuthError once the auth attempts are exhausted', async () => {
    global.fetch = jest.fn(async () => response(401));
    const auth = createTokenSource('dead-token', null);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(false);
    expect(r.error.error_class).toBe('AuthError');
    expect(global.fetch).toHaveBeenCalledTimes(AUTH_MAX_ATTEMPTS);
  });

  it('caps CCPP re-resolutions so a dead token cannot hammer the database', async () => {
    global.fetch = jest.fn(async () => response(401));
    const refresh = jest.fn()
      .mockImplementationOnce(async () => 'token-2')
      .mockImplementationOnce(async () => 'token-3')
      .mockImplementation(async () => 'token-4');
    const auth = createTokenSource('token-1', refresh);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(false);
    expect(r.error.error_class).toBe('AuthError');
    expect(refresh).toHaveBeenCalledTimes(MAX_TOKEN_REFRESHES);
  });

  it('survives a resolver that throws, treating it as no rotation', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(async () => response(401))
      .mockImplementationOnce(async () => response(200));
    const refresh = jest.fn(async () => { throw new Error('CCPP unreachable'); });
    const auth = createTokenSource('valid-token', refresh);

    const r = await settle(bcFetch(URL, auth));

    // A broken resolver must degrade to backoff, never become the fatal error.
    expect(r.ok).toBe(true);
    expect(r.value.status).toBe(200);
  });

  it('still retries 429 and 5xx (no regression in the existing curve)', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(async () => response(429))
      .mockImplementationOnce(async () => response(503))
      .mockImplementationOnce(async () => response(200));
    const auth = createTokenSource('good-token', null);

    const r = await settle(bcFetch(URL, auth));

    expect(r.ok).toBe(true);
    expect(r.value.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

describe('createTokenSource', () => {
  it('reports rotation only when the value actually changes', async () => {
    const changed = createTokenSource('a', async () => 'b');
    await expect(changed.refresh()).resolves.toBe(true);
    expect(changed.get()).toBe('b');

    const unchanged = createTokenSource('a', async () => 'a');
    await expect(unchanged.refresh()).resolves.toBe(false);
    expect(unchanged.get()).toBe('a');
  });

  it('treats a null/empty resolution as no rotation and keeps the old token', async () => {
    const auth = createTokenSource('a', async () => null);
    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.get()).toBe('a');
  });

  it('collapses concurrent refreshes into one CCPP round trip', async () => {
    let calls = 0;
    const auth = createTokenSource('a', async () => { calls += 1; return 'b'; });

    const results = await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);

    // Three parallel 401s must not become three CCPP queries.
    expect(calls).toBe(1);
    expect(results).toEqual([true, true, true]);
  });

  it('stops offering refreshes once the cap is reached', async () => {
    const auth = createTokenSource('a', async () => 'b');
    expect(auth.canRefresh()).toBe(true);
    for (let i = 0; i < MAX_TOKEN_REFRESHES; i += 1) await auth.refresh();
    expect(auth.canRefresh()).toBe(false);
  });

  it('never offers a refresh when no resolver was supplied', () => {
    expect(createTokenSource('a', null).canRefresh()).toBe(false);
  });
});
