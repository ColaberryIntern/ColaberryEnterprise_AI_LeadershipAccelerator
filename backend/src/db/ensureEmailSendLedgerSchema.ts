import { sequelize } from '../config/database';

/**
 * Transactional email dedup ledger — `email_send_ledger`.
 *
 * CLAUDE.md (Idempotency & Replayability) mandates application-level dedup
 * keyed on `(recipient, subject, business_event_id)` for transactional Mandrill
 * sends. Until this table existed there was no such key anywhere in production:
 * a retry, a crash mid-batch, or a re-run of a send script would deliver a
 * second copy of the same mail to the same person, and nothing in the system
 * could have noticed.
 *
 * Ensured via idempotent raw SQL rather than `sequelize.sync({ alter: true })`,
 * matching ensureSbpSchema/ensureWorkLedgerSchema. Additive only: one new
 * table, nothing existing is altered or dropped.
 *
 * ── WHY TWO UNIQUE INDEXES ──────────────────────────────────────────────────
 *
 * `email_send_ledger_key_unique` on `idempotency_key` is the index the claim
 * conflicts against. `email_send_ledger_triple_unique` on
 * `(lower(recipient), subject, business_event_id)` is the natural key CLAUDE.md
 * actually mandates. They are redundant only for as long as the key is computed
 * correctly. The moment a caller computes it from the wrong inputs — a trimmed
 * subject, a differently-cased address, a hash over the wrong separator — the
 * hash stops colliding and the hash index stops protecting anyone. The triple
 * index does not depend on any caller getting arithmetic right, so it still
 * raises a unique violation and the send still cannot happen twice.
 *
 * That is the whole point of the design: the duplicate is prevented by the
 * storage engine refusing to hold two rows, not by application code choosing
 * not to send. A SELECT-then-INSERT would be a race with a comfortable name.
 *
 * POST-CONDITION ASSERTION (see below): every statement here is best-effort and
 * only warns on failure, exactly as its siblings do, so "it didn't throw" is NOT
 * evidence the schema landed. The post-check therefore verifies not just that
 * the indexes exist but that they are UNIQUE — a non-unique index of the right
 * name would satisfy a `pg_indexes` name lookup while providing no protection
 * whatsoever, which is the failure this whole table exists to make impossible.
 */
export async function ensureEmailSendLedgerSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS email_send_ledger (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       idempotency_key VARCHAR(64) NOT NULL,
       recipient VARCHAR(320) NOT NULL,
       subject VARCHAR(500) NOT NULL,
       business_event_id VARCHAR(120) NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'claimed',
       attempts INTEGER NOT NULL DEFAULT 0,
       provider_message_id TEXT,
       error_class VARCHAR(80),
       error_detail TEXT,
       correlation_id UUID,
       claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       sent_at TIMESTAMPTZ,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,

    // The index the claim's ON CONFLICT targets. Without UNIQUE the conflict
    // clause has nothing to arbitrate on and Postgres rejects the statement
    // outright, which is a louder failure than a silent double send.
    `CREATE UNIQUE INDEX IF NOT EXISTS email_send_ledger_key_unique
       ON email_send_ledger (idempotency_key)`,

    // The mandated natural key. `lower(recipient)` because Bob@x.com and
    // bob@x.com are one mailbox, and a case-sensitive key would let the same
    // person be mailed twice by an address book that disagrees with itself.
    `CREATE UNIQUE INDEX IF NOT EXISTS email_send_ledger_triple_unique
       ON email_send_ledger (lower(recipient), subject, business_event_id)`,

    // Operational reads: "what did this campaign do", "what is stuck claimed".
    `CREATE INDEX IF NOT EXISTS idx_email_send_ledger_event
       ON email_send_ledger (business_event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_email_send_ledger_status
       ON email_send_ledger (status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] email send ledger schema stmt skipped:', err?.message);
    }
  }

  await assertEmailSendLedgerSchema();
}

/** What ensureEmailSendLedgerSchema must have produced. Checked, not assumed. */
export const REQUIRED_TABLES = ['email_send_ledger'] as const;

/**
 * Indexes that must exist AND be unique. Uniqueness is checked separately from
 * existence because an index of the right name that is not unique is worse than
 * no index: it satisfies every name-based check while permitting the exact
 * duplicate row it was named after preventing.
 */
export const REQUIRED_UNIQUE_INDEXES = [
  'email_send_ledger_key_unique',
  'email_send_ledger_triple_unique',
] as const;

/** Columns the send wrapper reads or writes. Checked, not assumed. */
export const REQUIRED_COLUMNS = [
  'email_send_ledger.idempotency_key',
  'email_send_ledger.recipient',
  'email_send_ledger.subject',
  'email_send_ledger.business_event_id',
  'email_send_ledger.status',
  'email_send_ledger.attempts',
  'email_send_ledger.provider_message_id',
  'email_send_ledger.error_class',
  'email_send_ledger.error_detail',
  'email_send_ledger.correlation_id',
  'email_send_ledger.claimed_at',
  'email_send_ledger.sent_at',
] as const;

/**
 * Verify the post-condition against the catalog and report loudly if it is not
 * met. Exported so a test can prove the assertion fires against an un-migrated
 * database — an assertion nobody has watched fail is not an assertion.
 */
export async function assertEmailSendLedgerSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [tableRows]: any = await sequelize.query(
      `SELECT array_agg(table_name) AS tables FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const foundTables: string[] = tableRows?.[0]?.tables ?? [];
    for (const t of REQUIRED_TABLES) if (!foundTables.includes(t)) missing.push(`table:${t}`);

    // pg_index.indisunique, not pg_indexes.indexname. The name tells you
    // somebody once ran a CREATE; indisunique tells you the database will
    // actually refuse the second row.
    const [idxRows]: any = await sequelize.query(
      `SELECT c.relname AS indexname, i.indisunique AS is_unique
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($indexes)`,
      { bind: { indexes: [...REQUIRED_UNIQUE_INDEXES] } },
    );
    const uniqueByName = new Map<string, boolean>(
      (idxRows ?? []).map((r: any) => [r.indexname, r.is_unique === true]),
    );
    for (const i of REQUIRED_UNIQUE_INDEXES) {
      if (!uniqueByName.has(i)) missing.push(`index:${i}`);
      else if (!uniqueByName.get(i)) missing.push(`index-not-unique:${i}`);
    }

    const [colRows]: any = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...new Set(REQUIRED_COLUMNS.map((c) => c.split('.')[0]))] } },
    );
    const found = new Set((colRows ?? []).map((r: any) => `${r.table_name}.${r.column_name}`));
    for (const c of REQUIRED_COLUMNS) if (!found.has(c)) missing.push(`column:${c}`);
  } catch (err: any) {
    console.warn('[DB] email send ledger post-check could not run:', err?.message);
    return { ok: false, missing: ['post-check-failed'] };
  }

  if (missing.length > 0) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'email_send_ledger_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaInvariantViolation',
      context: {
        missing,
        impact:
          'transactional sends have no idempotency guard: a retry, a crash mid-batch or a re-run of a send script will deliver a second copy of the same email to the same recipient, and nothing will detect it. A missing or non-unique index means the claim degrades from a guarantee to a hope.',
        remedy:
          'inspect the [DB] email send ledger schema stmt skipped warnings above; the CREATE statements are idempotent and safe to re-run. Do NOT run a send batch until this reports ok.',
      },
    }));
    return { ok: false, missing };
  }

  console.log('[DB] Email send ledger schema ensured (email_send_ledger)');
  return { ok: true, missing: [] };
}
