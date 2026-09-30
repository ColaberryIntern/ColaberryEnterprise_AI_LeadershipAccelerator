/**
 * ensureChannelAccountSchema post-condition — the credential tables, where a silent failure is
 * worse than anywhere else in this workstream.
 *
 * The DDL loop only warns, so `ok` is the only thing that can distinguish "created" from
 * "silently skipped". The two unique indexes here are the silent half, and each maps to a
 * concrete incident:
 *   - `marketing_channel_accounts_provider_unique` gone: the same Facebook page connected
 *     twice, so one scheduled post publishes twice to the same audience.
 *   - `marketing_connector_credentials_account_type_unique` gone: two live access tokens for
 *     one account, so a publish picks whichever row comes back first and an expired one looks
 *     like a revoked account.
 *
 * A missing COLUMN is the loud half, but it is worth pinning too: without `key_id` the vault
 * cannot tell which master key sealed a row, and master-key rotation stops being possible.
 */

import { catalogResponder, throwingCatalogResponder, violationPayloads } from './postconditionHarness';

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const COLUMNS: Record<string, string[]> = {
  marketing_channel_accounts: [
    'id', 'tenant_id', 'brand_id', 'owner_member_id', 'provider', 'provider_account_id',
    'display_name', 'handle', 'avatar_url', 'status', 'granted_scopes', 'missing_scopes',
    'connected_by', 'connected_at', 'last_health_check_at', 'last_health_ok',
    'last_health_error_class', 'revoked_at', 'revoked_by', 'metadata', 'created_at', 'updated_at',
  ],
  marketing_connector_credentials: [
    'id', 'tenant_id', 'channel_account_id', 'credential_type', 'ciphertext', 'iv', 'auth_tag',
    'wrapped_data_key', 'key_id', 'encrypted_at', 'token_expires_at', 'rotated_at',
    'created_at', 'updated_at',
  ],
};

/**
 * A test-local literal on purpose, not an import from the module: importing would make the
 * test agree with the module by construction and assert nothing. Adding an index to the module
 * without adding it here turns these cases red, which is the intended alarm.
 */
const ALL_INDEXES = [
  'marketing_channel_accounts_provider_unique',
  'marketing_connector_credentials_account_type_unique',
];

describe('ensureChannelAccountSchema post-condition', () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockQuery.mockReset();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function arrange(columns: Record<string, string[]>, indexes: string[]) {
    mockQuery.mockImplementation(catalogResponder({ columns, indexes }));
  }

  it('reports ok when both tables and both unique indexes are present', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    arrange(COLUMNS, ALL_INDEXES);

    const result = await ensureChannelAccountSchema();

    expect(result).toEqual({ ok: true, missing: [], missingIndexes: [] });
    expect(violationPayloads(errorSpy)).toEqual([]);
  });

  it('names the qualified column when the credential table failed to create', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    arrange({ ...COLUMNS, marketing_connector_credentials: [] }, ALL_INDEXES);

    const result = await ensureChannelAccountSchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      'marketing_connector_credentials.ciphertext',
      'marketing_connector_credentials.key_id',
      'marketing_connector_credentials.wrapped_data_key',
    ]));
    // The account table was fine and must not be blamed.
    expect(result.missing.some((m) => m.startsWith('marketing_channel_accounts.'))).toBe(false);
  });

  it('catches a missing key_id specifically, because without it rotation is impossible', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    const withoutKeyId = COLUMNS.marketing_connector_credentials.filter((c) => c !== 'key_id');
    arrange({ ...COLUMNS, marketing_connector_credentials: withoutKeyId }, ALL_INDEXES);

    const result = await ensureChannelAccountSchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['marketing_connector_credentials.key_id']);
  });

  it('catches a missing owner_member_id, which is what makes student accounts storable', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    const withoutOwner = COLUMNS.marketing_channel_accounts.filter((c) => c !== 'owner_member_id');
    arrange({ ...COLUMNS, marketing_channel_accounts: withoutOwner }, ALL_INDEXES);

    const result = await ensureChannelAccountSchema();

    expect(result.missing).toEqual(['marketing_channel_accounts.owner_member_id']);
  });

  it.each(ALL_INDEXES)('reports the SILENT failure when %s is absent', async (absent) => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    arrange(COLUMNS, ALL_INDEXES.filter((i) => i !== absent));

    const result = await ensureChannelAccountSchema();

    expect(result.ok).toBe(false);
    expect(result.missingIndexes).toEqual([absent]);
    expect(result.missing).toEqual([]); // every column is present; only the index is gone
  });

  it('explains the duplicate-publish impact when an index is missing, not just the column impact', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    arrange(COLUMNS, []);

    await ensureChannelAccountSchema();

    const [payload] = violationPayloads(errorSpy);
    expect(payload.error_class).toBe('SchemaInvariantViolation');
    expect(payload.context.missing_indexes).toEqual(ALL_INDEXES);
    expect(payload.context.impact).toMatch(/post twice|stale credential/);
  });

  it('does not throw when the catalog itself is unreadable, and says so', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    mockQuery.mockImplementation(throwingCatalogResponder('permission denied for schema public'));

    const result = await ensureChannelAccountSchema();

    // Boot must survive a locked-down catalog; the warn line is the operator's signal.
    expect(result.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[DB] channel account schema verification failed:',
      expect.stringContaining('permission denied'),
    );
  });

  it('stays quiet about an already-existing constraint, which is the steady state', async () => {
    const { ensureChannelAccountSchema } = await import('../ensureChannelAccountSchema');
    mockQuery.mockImplementation((sql: string, opts?: any) => {
      if (typeof sql === 'string' && sql.includes('ADD CONSTRAINT')) {
        throw new Error('constraint "marketing_channel_accounts_one_owner" already exists');
      }
      return catalogResponder({ columns: COLUMNS, indexes: ALL_INDEXES })(sql, opts);
    });

    const result = await ensureChannelAccountSchema();

    expect(result.ok).toBe(true);
    // Every boot re-runs the ADD CONSTRAINT statements; warning each time would train the
    // operator to ignore the warn channel, which is where real problems appear.
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
