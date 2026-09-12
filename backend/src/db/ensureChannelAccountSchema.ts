import { sequelize } from '../config/database';

/**
 * marketing_channel_accounts + marketing_connector_credentials — T003, unblocked by ESC-001.
 *
 * OWNERSHIP IS A PAIR, NOT A BRAND. The spec describes these accounts as brand scoped, and for
 * the company's own pages they are. But Ali confirmed on 2026-09-10 that student social posting
 * is planned, and a student's LinkedIn is owned by the student, not by a brand. Rather than
 * ship a brand-only table and migrate it later under load, ownership is `brand_id` OR
 * `owner_member_id`, with a CHECK that exactly one is set. Brand-owned accounts read exactly as
 * before; person-owned accounts need no schema change when that work starts.
 *
 * WHY CREDENTIALS ARE A SEPARATE TABLE. Three reasons, in order of how much they matter:
 *   1. The account row is safe to read. Listing accounts, checking health, rendering the
 *      composer's "not connected" state, and every join that needs a display name all touch a
 *      table with no secret material in it at all. The API layer cannot leak what the row does
 *      not contain.
 *   2. A provider may hold more than one secret per account (an access token AND a rotating
 *      refresh token, with different expiries), so it is one-to-many, not one-to-one.
 *   3. Rotation sweeps and key-age reporting scan one narrow table.
 *
 * SEALED MATERIAL, NOT PLAINTEXT. The five `*_key`/`ciphertext`/`iv`/`auth_tag` columns are the
 * output of `credentialVault.seal()`; none is meaningful without the master key, which lives in
 * the process environment and never in this database. `key_id` is what makes master-key
 * rotation an online operation. See `services/security/credentialVault.ts`.
 *
 * Additive and idempotent like every ensure* in this workstream, with a post-condition, because
 * the DDL loop only warns on failure and "it booted" proves nothing about what landed.
 */

export const CHANNEL_ACCOUNT_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS marketing_channel_accounts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID REFERENCES brands(id),
     owner_member_id UUID,
     provider VARCHAR(64) NOT NULL,
     provider_account_id VARCHAR(255) NOT NULL,
     display_name VARCHAR(255) NOT NULL,
     handle VARCHAR(255),
     avatar_url TEXT,
     status VARCHAR(32) NOT NULL DEFAULT 'connected',
     granted_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
     missing_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
     connected_by UUID,
     connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_health_check_at TIMESTAMPTZ,
     last_health_ok BOOLEAN,
     last_health_error_class VARCHAR(64),
     revoked_at TIMESTAMPTZ,
     revoked_by UUID,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // Exactly one owner. Without this a row can be orphaned (neither set, so nobody can see it in
  // a scoped list) or ambiguous (both set, so two scopes claim the same token). Both are the
  // kind of defect that only surfaces once real accounts exist.
  `ALTER TABLE marketing_channel_accounts
     ADD CONSTRAINT marketing_channel_accounts_one_owner
     CHECK ((brand_id IS NOT NULL AND owner_member_id IS NULL)
         OR (brand_id IS NULL AND owner_member_id IS NOT NULL))`,

  // The same provider account connected twice would publish twice. Partial, because a revoked
  // row must not block reconnecting the same page later.
  `CREATE UNIQUE INDEX IF NOT EXISTS marketing_channel_accounts_provider_unique
     ON marketing_channel_accounts (tenant_id, provider, provider_account_id)
     WHERE revoked_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_marketing_channel_accounts_brand ON marketing_channel_accounts (brand_id)`,
  `CREATE INDEX IF NOT EXISTS idx_marketing_channel_accounts_member ON marketing_channel_accounts (owner_member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_marketing_channel_accounts_status ON marketing_channel_accounts (tenant_id, status)`,

  `CREATE TABLE IF NOT EXISTS marketing_connector_credentials (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     channel_account_id UUID NOT NULL REFERENCES marketing_channel_accounts(id) ON DELETE CASCADE,
     credential_type VARCHAR(32) NOT NULL,
     ciphertext TEXT NOT NULL,
     iv VARCHAR(64) NOT NULL,
     auth_tag VARCHAR(64) NOT NULL,
     wrapped_data_key TEXT NOT NULL,
     key_id VARCHAR(64) NOT NULL,
     encrypted_at TIMESTAMPTZ NOT NULL,
     token_expires_at TIMESTAMPTZ,
     rotated_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // One current secret of each type per account. A second access token for the same account is
  // not a second credential, it is a rotation, and it must overwrite rather than accumulate:
  // two live tokens means an ambiguous "which one is current" at publish time.
  `CREATE UNIQUE INDEX IF NOT EXISTS marketing_connector_credentials_account_type_unique
     ON marketing_connector_credentials (channel_account_id, credential_type)`,
  // The rotation sweep's query: find every row not on the active master key.
  `CREATE INDEX IF NOT EXISTS idx_marketing_connector_credentials_key ON marketing_connector_credentials (key_id)`,
  // The expiry monitor's query.
  `CREATE INDEX IF NOT EXISTS idx_marketing_connector_credentials_expiry ON marketing_connector_credentials (token_expires_at)`,

  // T005 created `content_variants.channel_account_id` as a bare nullable UUID with no FK,
  // because this table did not exist while T003 was gated. Adding the constraint now is the
  // additive half of that plan. NOT VALID so the statement takes no table-wide lock and cannot
  // fail on pre-existing rows; a later VALIDATE CONSTRAINT can check history when convenient.
  `ALTER TABLE content_variants
     ADD CONSTRAINT content_variants_channel_account_fk
     FOREIGN KEY (channel_account_id) REFERENCES marketing_channel_accounts(id) NOT VALID`,
];

const REQUIRED_ACCOUNT_COLUMNS = [
  'id', 'tenant_id', 'brand_id', 'owner_member_id', 'provider', 'provider_account_id',
  'display_name', 'handle', 'avatar_url', 'status', 'granted_scopes', 'missing_scopes',
  'connected_by', 'connected_at', 'last_health_check_at', 'last_health_ok',
  'last_health_error_class', 'revoked_at', 'revoked_by', 'metadata', 'created_at', 'updated_at',
];

const REQUIRED_CREDENTIAL_COLUMNS = [
  'id', 'tenant_id', 'channel_account_id', 'credential_type', 'ciphertext', 'iv', 'auth_tag',
  'wrapped_data_key', 'key_id', 'encrypted_at', 'token_expires_at', 'rotated_at',
  'created_at', 'updated_at',
];

const REQUIRED_INDEXES = [
  'marketing_channel_accounts_provider_unique',
  'marketing_connector_credentials_account_type_unique',
];

export interface ChannelAccountSchemaResult {
  ok: boolean;
  missing: string[];
  missingIndexes: string[];
}

async function columnsOf(table: string): Promise<Set<string>> {
  const [rows]: any = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :table`,
    { replacements: { table } },
  );
  return new Set((rows || []).map((r: any) => r.column_name));
}

export async function ensureChannelAccountSchema(): Promise<ChannelAccountSchemaResult> {
  for (const sql of CHANNEL_ACCOUNT_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      // Re-running ADD CONSTRAINT on an existing constraint is the expected steady state, not
      // a problem; anything else is worth the warn line.
      const message = err?.message?.split('\n')[0] ?? '';
      if (!/already exists/i.test(message)) {
        console.warn('[DB] channel account schema stmt skipped:', message);
      }
    }
  }

  let missing: string[] = [];
  let missingIndexes: string[] = [];
  try {
    const accountCols = await columnsOf('marketing_channel_accounts');
    const credentialCols = await columnsOf('marketing_connector_credentials');
    missing = [
      ...REQUIRED_ACCOUNT_COLUMNS.filter((c) => !accountCols.has(c)).map((c) => `marketing_channel_accounts.${c}`),
      ...REQUIRED_CREDENTIAL_COLUMNS.filter((c) => !credentialCols.has(c)).map((c) => `marketing_connector_credentials.${c}`),
    ];

    const [idxRows]: any = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
       AND tablename IN ('marketing_channel_accounts', 'marketing_connector_credentials')`,
    );
    const present = new Set((idxRows || []).map((r: any) => r.indexname));
    missingIndexes = REQUIRED_INDEXES.filter((i) => !present.has(i));

    if (missing.length > 0 || missingIndexes.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: {
          tables: ['marketing_channel_accounts', 'marketing_connector_credentials'],
          missing_columns: missing,
          missing_indexes: missingIndexes,
          impact: missingIndexes.length > 0
            ? 'a duplicate connection or a second live token per account can be written silently, so publishing could post twice or use a stale credential'
            : 'social accounts cannot be connected or read; publishing stays in handoff mode',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] channel account schema verification failed:', err?.message);
  }

  console.log('[DB] Channel account schema ensured');
  return { ok: missing.length === 0 && missingIndexes.length === 0, missing, missingIndexes };
}
