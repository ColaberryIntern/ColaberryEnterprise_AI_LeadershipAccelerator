import { sequelize } from '../config/database';

// /inbox-zero commitment ledger (T8, CC-20260910-3q7x): what ALI owes other
// people. Idempotent raw SQL like ensureInboxCaseSchema.ts; every statement
// is CREATE/ADD ... IF NOT EXISTS and each is wrapped so a partial DB
// self-heals on the next boot. Columns must match models/InboxCommitment.ts
// EXACTLY. Additive: a brand-new table, nothing existing is altered.
//
// Why a table of its own: caseActionPlanner.buildWaitingActions() DROPS every
// commitment whose owner is Ali ("Ali's own commitments aren't waiting on
// someone else"), and that was the only consumer of commitments_made, so
// Ali's promises vanished. They belong here, not on the WAITING ledger.
export async function ensureInboxCommitmentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS inbox_commitments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       case_id UUID NOT NULL REFERENCES inbox_cases(id),
       statement TEXT NOT NULL,
       statement_hash VARCHAR(64) NOT NULL,
       owed_to VARCHAR(255),
       due_at TIMESTAMPTZ,
       status VARCHAR(10) NOT NULL DEFAULT 'OPEN',
       source VARCHAR(20) NOT NULL DEFAULT 'assessment',
       source_item_id UUID,
       fulfilled_at TIMESTAMPTZ,
       correlation_id UUID NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_commitments DROP CONSTRAINT IF EXISTS ck_inbox_commitments_status`,
    `ALTER TABLE inbox_commitments ADD CONSTRAINT ck_inbox_commitments_status CHECK (status IN ('OPEN','FULFILLED','CANCELLED'))`,
    `ALTER TABLE inbox_commitments DROP CONSTRAINT IF EXISTS ck_inbox_commitments_source`,
    `ALTER TABLE inbox_commitments ADD CONSTRAINT ck_inbox_commitments_source CHECK (source IN ('assessment','sent_mail'))`,
    // Re-planning is idempotent: the same promise on the same case is one row.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_commitments_case_statement ON inbox_commitments (case_id, statement_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_commitments_status_due ON inbox_commitments (status, due_at)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_commitments_case_id ON inbox_commitments (case_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] inbox-commitment schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Inbox Zero commitment-ledger schema ensured');

  const check = await assertInboxCommitmentSchema();
  if (!check.ok) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'inbox_commitment_schema_postcondition_failed',
        outcome: 'failure',
        error_class: 'SchemaPostconditionError',
        context: { missing: check.missing },
      }),
    );
  }
}

export const INBOX_COMMITMENT_REQUIRED_COLUMNS = [
  'inbox_commitments.case_id',
  'inbox_commitments.statement',
  'inbox_commitments.statement_hash',
  'inbox_commitments.owed_to',
  'inbox_commitments.due_at',
  'inbox_commitments.status',
  'inbox_commitments.source',
  'inbox_commitments.correlation_id',
] as const;

/** Post-condition: the table AND its unique index exist. Exported so a test
 * can prove it fires. Uses pg_index.indisunique, not the index name — the
 * name says somebody ran a CREATE; indisunique says Postgres will refuse the
 * duplicate row. */
export async function assertInboxCommitmentSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [cols]: any = await sequelize.query(
      `SELECT table_name || '.' || column_name AS col FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inbox_commitments'`,
    );
    const found = new Set<string>((cols ?? []).map((r: any) => r.col));
    for (const c of INBOX_COMMITMENT_REQUIRED_COLUMNS) if (!found.has(c)) missing.push(c);
    const [idx]: any = await sequelize.query(
      `SELECT i.indisunique AS is_unique FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = 'uq_inbox_commitments_case_statement'`,
    );
    if (!idx?.[0]?.is_unique) missing.push('unique_index:uq_inbox_commitments_case_statement');
  } catch (err: any) {
    missing.push(`catalog_query_failed:${err?.message ?? 'unknown'}`);
  }
  return { ok: missing.length === 0, missing };
}
