/**
 * Tests for the Basecamp token provider's IDENTITY check.
 *
 * Separate from `basecampToken.test.ts` because these are the first tests in this
 * subsystem that drive the CCPP branch, which needs `mssql` mocked. Mocking it in
 * the existing file would change what every test there exercises.
 *
 * ## What is actually being pinned
 *
 * A valid token belonging to the wrong person. On 2026-11-13 the active CCPP row
 * held a grant for CB System id 37708014 instead of Ali id 17454835. Nothing 401'd,
 * nothing threw: Basecamp answers 404 for a project that identity cannot see, so the
 * symptom was indistinguishable from a deleted ticket. These tests assert that this
 * case is now (a) detected, (b) emitted as an error with a stable error_class, and
 * (c) NOT converted into a failed refresh, because the wrong identity could still
 * see 64 of 65 projects and throwing would have been the larger outage.
 */

const query = jest.fn();
const close = jest.fn();

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      request: () => ({ query }),
      close,
    }),
  })),
}));

import {
  refreshBcToken,
  lastBcIdentityCheck,
  EXPECTED_BC_PERSON_ID,
  __resetForTests,
} from '../basecampToken';

const ORIG = { ...process.env };
const ALI = EXPECTED_BC_PERSON_ID;
const CB_SYSTEM = 37708014;

/** The real /my/profile.json carries nested objects that ALSO have an "id". */
function profile(id: number, email: string): unknown {
  return {
    id,
    attachable_sgid: 'sgid-not-a-person',
    name: 'Someone',
    email_address: email,
    company: { id: 999999, name: 'Colaberry' },
  };
}

function mockProfile(status: number, body?: unknown): jest.Mock {
  const f = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  (global as any).fetch = f;
  return f;
}

beforeEach(() => {
  __resetForTests();
  jest.clearAllMocks();
  process.env.MSSQL_HOST = 'ccpp.example.invalid';
  process.env.BASECAMP_ACCESS_TOKEN = 'env-token-123';
  delete process.env.BASECAMP_EXPECTED_PERSON_ID;
  query.mockResolvedValue({ recordset: [{ AccessToken: 'ccpp-token-abc' }] });
});

afterEach(() => {
  delete (global as any).fetch;
});

afterAll(() => {
  process.env = ORIG;
});

describe('happy path: the active row belongs to the expected person', () => {
  it('records a match and still returns the token', async () => {
    mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await expect(refreshBcToken()).resolves.toBe('ccpp-token-abc');
    const check = lastBcIdentityCheck();
    expect(check?.outcome).toBe('match');
    expect(check?.actual_person_id).toBe(ALI);
    expect(check?.error_class).toBeUndefined();
  });

  it('reads the TOP-LEVEL id, not a nested object id', async () => {
    // The shell version of this check originally used a greedy sed that returned
    // the LAST "id" in the body, which is the company's. Same trap, same endpoint.
    mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await refreshBcToken();
    expect(lastBcIdentityCheck()?.actual_person_id).toBe(ALI);
    expect(lastBcIdentityCheck()?.actual_person_id).not.toBe(999999);
  });

  it('does not log an error when the identity matches', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await refreshBcToken();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('the 2026-11-13 failure: a valid token belonging to someone else', () => {
  it('detects the mismatch and names both identities', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockProfile(200, profile(CB_SYSTEM, 'ali+999@colaberry.com'));
    await refreshBcToken();
    const check = lastBcIdentityCheck();
    expect(check?.outcome).toBe('mismatch');
    expect(check?.expected_person_id).toBe(ALI);
    expect(check?.actual_person_id).toBe(CB_SYSTEM);
    expect(check?.actual_email).toBe('ali+999@colaberry.com');
    (console.error as jest.Mock).mockRestore?.();
  });

  it('emits a structured error carrying the stable error_class', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockProfile(200, profile(CB_SYSTEM, 'ali+999@colaberry.com'));
    await refreshBcToken();
    expect(err).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(err.mock.calls[0][0] as string);
    expect(payload.level).toBe('error');
    expect(payload.outcome).toBe('failure');
    expect(payload.error_class).toBe('BasecampIdentityMismatch');
    expect(payload.event).toBe('basecamp_identity_mismatch');
    expect(payload.context.actual_person_id).toBe(CB_SYSTEM);
    expect(typeof payload.duration_ms).toBe('number');
    err.mockRestore();
  });

  it('NEVER logs the token, in any branch', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockProfile(200, profile(CB_SYSTEM, 'ali+999@colaberry.com'));
    await refreshBcToken();
    const everything = [...err.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(everything).not.toContain('ccpp-token-abc');
    err.mockRestore();
    warn.mockRestore();
  });

  it('still returns the token, because throwing would be the larger outage', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockProfile(200, profile(CB_SYSTEM, 'ali+999@colaberry.com'));
    await expect(refreshBcToken()).resolves.toBe('ccpp-token-abc');
    (console.error as jest.Mock).mockRestore?.();
  });
});

describe('failure paths: the check itself cannot run', () => {
  it('records unknown on a non-200 profile response and does not fail the refresh', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockProfile(503);
    await expect(refreshBcToken()).resolves.toBe('ccpp-token-abc');
    expect(lastBcIdentityCheck()?.outcome).toBe('unknown');
    expect(lastBcIdentityCheck()?.error_class).toBe('ProfileHttp503');
    warn.mockRestore();
  });

  it('records unknown when the profile body has no usable id', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockProfile(200, { name: 'no id here', email_address: 'x@y.z' });
    await expect(refreshBcToken()).resolves.toBe('ccpp-token-abc');
    expect(lastBcIdentityCheck()?.outcome).toBe('unknown');
    expect(lastBcIdentityCheck()?.error_class).toBe('ProfileShape');
    warn.mockRestore();
  });

  it('records unknown when the profile call throws, and still resolves', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('econnrefused'));
    await expect(refreshBcToken()).resolves.toBe('ccpp-token-abc');
    expect(lastBcIdentityCheck()?.outcome).toBe('unknown');
    expect(lastBcIdentityCheck()?.error_class).toBe('UpstreamUnavailable');
    warn.mockRestore();
  });

  it('classifies an aborted profile call as TimeoutError', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    (global as any).fetch = jest.fn().mockRejectedValue(abort);
    await refreshBcToken();
    expect(lastBcIdentityCheck()?.error_class).toBe('TimeoutError');
    warn.mockRestore();
  });

  it('unknown is not treated as a pass: the outcome is never match', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockProfile(500);
    await refreshBcToken();
    expect(lastBcIdentityCheck()?.outcome).not.toBe('match');
    warn.mockRestore();
  });
});

describe('boundary cases', () => {
  it('honors BASECAMP_EXPECTED_PERSON_ID when it is a valid id', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.BASECAMP_EXPECTED_PERSON_ID = String(CB_SYSTEM);
    mockProfile(200, profile(CB_SYSTEM, 'ali+999@colaberry.com'));
    await refreshBcToken();
    expect(lastBcIdentityCheck()?.outcome).toBe('match');
    (console.error as jest.Mock).mockRestore?.();
  });

  it('falls back to the default when the override is garbage, rather than passing everything', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.BASECAMP_EXPECTED_PERSON_ID = 'not-a-number';
    mockProfile(200, profile(CB_SYSTEM, 'ali+999@colaberry.com'));
    await refreshBcToken();
    const check = lastBcIdentityCheck();
    expect(check?.expected_person_id).toBe(ALI);
    expect(check?.outcome).toBe('mismatch');
    warn.mockRestore();
    (console.error as jest.Mock).mockRestore?.();
  });

  it('treats an empty override as absent', async () => {
    process.env.BASECAMP_EXPECTED_PERSON_ID = '   ';
    mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await refreshBcToken();
    expect(lastBcIdentityCheck()?.expected_person_id).toBe(ALI);
  });

  it('rejects a non-positive override and keeps the default', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.BASECAMP_EXPECTED_PERSON_ID = '0';
    mockProfile(200, profile(CB_SYSTEM, 'x@y.z'));
    await refreshBcToken();
    expect(lastBcIdentityCheck()?.expected_person_id).toBe(ALI);
    warn.mockRestore();
    (console.error as jest.Mock).mockRestore?.();
  });
});

describe('it does not become a hidden dependency', () => {
  it('does NOT call the profile endpoint on the env-token fallback path', async () => {
    delete process.env.MSSQL_HOST;
    const f = mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await expect(refreshBcToken()).resolves.toBe('env-token-123');
    expect(f).not.toHaveBeenCalled();
    expect(lastBcIdentityCheck()).toBeNull();
  });

  it('verifies once for concurrent refreshes, not once per caller', async () => {
    const f = mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await Promise.all([refreshBcToken(), refreshBcToken(), refreshBcToken()]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('asks /my/profile.json with the refreshed token and a bounded signal', async () => {
    const f = mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await refreshBcToken();
    const [url, init] = f.mock.calls[0] as [string, any];
    expect(url).toContain('/my/profile.json');
    expect(init.headers.Authorization).toBe('Bearer ccpp-token-abc');
    expect(init.signal).toBeDefined();
  });

  it('lastBcIdentityCheck starts null, so null means not established', () => {
    expect(lastBcIdentityCheck()).toBeNull();
  });
});

describe('idempotency', () => {
  it('two refreshes of the same unchanged row reach the same verdict', async () => {
    mockProfile(200, profile(ALI, 'ali@colaberry.com'));
    await refreshBcToken();
    const first = lastBcIdentityCheck();
    await refreshBcToken();
    const second = lastBcIdentityCheck();
    expect(second?.outcome).toBe(first?.outcome);
    expect(second?.actual_person_id).toBe(first?.actual_person_id);
  });
});
