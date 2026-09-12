import { CHANNEL_ACCOUNT_SCHEMA_STATEMENTS } from '../ensureChannelAccountSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import '../../models';

/**
 * Schema/model parity for the two credential tables, in the same shape as the other six
 * ensure* suites in this workstream.
 *
 * Parity matters more here than anywhere else: a sealed column present in the DDL but missing
 * from the model is invisible to Sequelize, so the write is silently dropped and the row is
 * stored with an empty `wrapped_data_key`. That is a credential that cannot be opened, and it
 * would not be discovered until the first publish.
 */

describe('ensureChannelAccountSchema — DDL and model agree', () => {
  const created = parseCreatedTables(CHANNEL_ACCOUNT_SCHEMA_STATEMENTS);

  it('creates exactly the two tables', () => {
    expect(created.map((t) => t.table).sort()).toEqual([
      'marketing_channel_accounts',
      'marketing_connector_credentials',
    ]);
  });

  it.each(['marketing_channel_accounts', 'marketing_connector_credentials'])(
    'every DDL column of %s is declared on the model, and vice versa',
    (table) => {
      const model = modelsByTable()[table];
      expect(model).toBeDefined();
      const mapped = modelColumnNames(model);
      const ddl = created.find((t) => t.table === table)!.columns;
      expect(ddl.filter((c) => !mapped.has(c))).toEqual([]);
      expect(Array.from(mapped).filter((c) => !ddl.includes(c))).toEqual([]);
    },
  );

  it('carries every column the vault needs to open a row', () => {
    // Losing any one of these makes the stored credential permanently unreadable.
    const ddl = created.find((t) => t.table === 'marketing_connector_credentials')!.columns;
    expect(ddl).toEqual(expect.arrayContaining([
      'ciphertext', 'iv', 'auth_tag', 'wrapped_data_key', 'key_id', 'encrypted_at',
    ]));
  });

  it('one live credential of each type per account, enforced by the database', () => {
    // Two access tokens for one account means a publish picks whichever row comes back first.
    const idx = CHANNEL_ACCOUNT_SCHEMA_STATEMENTS.find((s) => s.includes('marketing_connector_credentials_account_type_unique'));
    expect(idx).toMatch(/UNIQUE INDEX/);
    expect(idx).toMatch(/\(channel_account_id, credential_type\)/);
  });

  it('one live connection per provider account, and revoked rows do not block reconnecting', () => {
    const idx = CHANNEL_ACCOUNT_SCHEMA_STATEMENTS.find((s) => s.includes('marketing_channel_accounts_provider_unique'));
    expect(idx).toMatch(/UNIQUE INDEX/);
    expect(idx).toMatch(/\(tenant_id, provider, provider_account_id\)/);
    // Partial on purpose: without this a page disconnected once could never be reconnected.
    expect(idx).toMatch(/WHERE revoked_at IS NULL/);
  });

  it('ownership is exactly one of brand or person, enforced by the database', () => {
    // The student-posting case is why owner_member_id exists; the CHECK is why a row can never
    // be both or neither, which would make a token either ambiguous or invisible.
    const check = CHANNEL_ACCOUNT_SCHEMA_STATEMENTS.find((s) => s.includes('marketing_channel_accounts_one_owner'));
    expect(check).toMatch(/CHECK/);
    expect(check).toMatch(/brand_id IS NOT NULL AND owner_member_id IS NULL/);
    expect(check).toMatch(/brand_id IS NULL AND owner_member_id IS NOT NULL/);
  });

  it('adds the content_variants FK that T005 deferred while T003 was gated', () => {
    const fk = CHANNEL_ACCOUNT_SCHEMA_STATEMENTS.find((s) => s.includes('content_variants_channel_account_fk'));
    expect(fk).toMatch(/FOREIGN KEY \(channel_account_id\) REFERENCES marketing_channel_accounts\(id\)/);
    // NOT VALID so the statement takes no table-wide lock and cannot fail on existing rows.
    expect(fk).toMatch(/NOT VALID/);
  });

  it('every CREATE statement is idempotent', () => {
    const creates = CHANNEL_ACCOUNT_SCHEMA_STATEMENTS.filter((s) => /^\s*CREATE/i.test(s));
    for (const sql of creates) expect(sql).toMatch(/IF NOT EXISTS/i);
  });

  it('is additive only', () => {
    const joined = CHANNEL_ACCOUNT_SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME/);
    expect(joined).not.toMatch(/ALTER\s+COLUMN/);
    expect(joined).not.toMatch(/TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET/);
  });

  it('stores no column that could hold a plaintext secret', () => {
    // The whole point of ESC-001. A future column named `access_token` on either table would
    // be exactly the mistake github_connections made, and this fails the build for it.
    const accountCols = created.find((t) => t.table === 'marketing_channel_accounts')!.columns;
    const credentialCols = created.find((t) => t.table === 'marketing_connector_credentials')!.columns;
    for (const column of [...accountCols, ...credentialCols]) {
      expect(column).not.toMatch(/^(access_token|refresh_token|secret|password|token)$/);
    }
  });
});
