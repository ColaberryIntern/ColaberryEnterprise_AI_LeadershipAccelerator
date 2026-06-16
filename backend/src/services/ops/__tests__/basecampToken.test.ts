/**
 * Tests for the Basecamp token provider — the in-container CCPP-refresh layer
 * that stops a token rotation from 401-ing the ops BC calls until the .env is
 * manually updated.
 */
import { getBcToken, refreshBcToken, isAuthError, __resetForTests } from '../basecampToken';

const ORIG = { ...process.env };

beforeEach(() => {
  __resetForTests();
  delete process.env.MSSQL_HOST; // default: no CCPP creds -> env fallback path
  process.env.BASECAMP_ACCESS_TOKEN = 'env-token-123';
});
afterAll(() => {
  process.env = ORIG;
});

describe('isAuthError', () => {
  it('is true only for 401', () => {
    expect(isAuthError(401)).toBe(true);
    expect(isAuthError(200)).toBe(false);
    expect(isAuthError(403)).toBe(false);
    expect(isAuthError(429)).toBe(false);
    expect(isAuthError(500)).toBe(false);
  });
});

describe('getBcToken', () => {
  it('returns the env token when nothing is cached', () => {
    expect(getBcToken()).toBe('env-token-123');
  });

  it('strips a leading "Bearer " prefix', () => {
    __resetForTests();
    process.env.BASECAMP_ACCESS_TOKEN = 'Bearer abc.def';
    expect(getBcToken()).toBe('abc.def');
  });

  it('throws when no token is available anywhere', () => {
    __resetForTests();
    delete process.env.BASECAMP_ACCESS_TOKEN;
    expect(() => getBcToken()).toThrow(/BASECAMP_ACCESS_TOKEN/);
  });
});

describe('refreshBcToken', () => {
  it('falls back to the env token when CCPP creds are absent', async () => {
    await expect(refreshBcToken()).resolves.toBe('env-token-123');
  });

  it('caches the refreshed token so getBcToken returns it', async () => {
    process.env.BASECAMP_ACCESS_TOKEN = 'rotated-token-456';
    __resetForTests();
    process.env.BASECAMP_ACCESS_TOKEN = 'rotated-token-456';
    await refreshBcToken();
    expect(getBcToken()).toBe('rotated-token-456');
  });

  it('is single-flight: concurrent refreshes share one resolution', async () => {
    const [a, b, c] = await Promise.all([refreshBcToken(), refreshBcToken(), refreshBcToken()]);
    expect(a).toBe('env-token-123');
    expect(b).toBe('env-token-123');
    expect(c).toBe('env-token-123');
  });

  it('rejects when CCPP creds are absent AND no env fallback exists', async () => {
    __resetForTests();
    delete process.env.BASECAMP_ACCESS_TOKEN;
    delete process.env.MSSQL_HOST;
    await expect(refreshBcToken()).rejects.toThrow(/no BASECAMP_ACCESS_TOKEN fallback/);
  });
});
