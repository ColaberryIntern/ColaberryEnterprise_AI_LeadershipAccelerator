/**
 * Rotating-refresh-token vault.
 *
 * Microsoft Graph returns a NEW refresh token on most refreshes. The previous
 * code logged that and discarded it, so `MS_GRAPH_REFRESH_TOKEN` only kept
 * working because the superseded token had not been invalidated yet — the
 * deployment was one invalidation away from Hotmail sync, auto-archive AND
 * reply-sending stopping at once, recoverable only by a human re-consent.
 *
 * The behaviours that matter here are the failure ones: a vault read failure
 * must degrade to the env var rather than take down mail, and a REJECTED stored
 * token must be cleared — otherwise the vault (which always wins over the env)
 * would serve a dead credential forever.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: mockQuery } }));

import {
  getRefreshToken,
  saveRotatedToken,
  invalidateStoredToken,
  __resetTokenCache,
} from '../graphTokenStore';

describe('graphTokenStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetTokenCache();
    process.env.MS_GRAPH_REFRESH_TOKEN = 'env-token';
  });

  it('prefers the rotated token in the vault over the env var', async () => {
    mockQuery.mockResolvedValue([{ refresh_token: 'vault-token' }]);

    await expect(getRefreshToken()).resolves.toBe('vault-token');
  });

  it('falls back to the env var when the vault is empty (the initial seed case)', async () => {
    mockQuery.mockResolvedValue([]);

    await expect(getRefreshToken()).resolves.toBe('env-token');
  });

  it('falls back to the env var when the vault read FAILS rather than breaking mail', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));

    await expect(getRefreshToken()).resolves.toBe('env-token');
  });

  it('persists a rotated token and serves it on the next read without re-querying', async () => {
    mockQuery.mockResolvedValue([]);

    await saveRotatedToken('rotated-1');
    const insert = mockQuery.mock.calls.find((c) => /INSERT INTO oauth_token_vault/i.test(c[0]));
    expect(insert).toBeDefined();
    expect(insert![1].replacements.token).toBe('rotated-1');

    mockQuery.mockClear();
    await expect(getRefreshToken()).resolves.toBe('rotated-1');
    expect(mockQuery).not.toHaveBeenCalled(); // served from cache
  });

  it('never throws when persisting fails — a failed write must not fail the mail operation', async () => {
    mockQuery.mockRejectedValue(new Error('disk full'));

    await expect(saveRotatedToken('rotated-2')).resolves.toBeUndefined();
  });

  it('ignores an empty token rather than overwriting a good one with nothing', async () => {
    await saveRotatedToken('');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('clearing a rejected token reverts the next read to the env var', async () => {
    mockQuery.mockResolvedValue([]);
    await saveRotatedToken('dead-token');
    await expect(getRefreshToken()).resolves.toBe('dead-token');

    await invalidateStoredToken();

    const del = mockQuery.mock.calls.find((c) => /DELETE FROM oauth_token_vault/i.test(c[0]));
    expect(del).toBeDefined();
    await expect(getRefreshToken()).resolves.toBe('env-token');
  });

  it('upserts on provider so repeated rotations replace rather than accumulate', async () => {
    mockQuery.mockResolvedValue([]);

    await saveRotatedToken('rotated-3');

    const insert = mockQuery.mock.calls.find((c) => /INSERT INTO oauth_token_vault/i.test(c[0]));
    expect(insert![0]).toMatch(/ON CONFLICT \(provider\) DO UPDATE/i);
  });
});
