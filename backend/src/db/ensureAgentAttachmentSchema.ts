import { sequelize } from '../config/database';

// Agent attachments (the read_attachments tool) — ensured via idempotent raw
// SQL, same pattern as ensureReeseOutreachSchema.ts / ensureWorkLedgerSchema.ts
// (the 215-model prod graph makes sync({alter:true}) hit pre-existing index
// conflicts). Every statement is CREATE ... IF NOT EXISTS in its own try/catch,
// so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing.
// Columns must match backend/src/models/AgentAttachment.ts EXACTLY.
//
// The unique index on (enrollment_id, sha256) is what makes upload idempotent:
// a student who drags the same screenshot in twice (or whose browser retries a
// flaky upload) gets the SAME attachment row back instead of a duplicate file
// and a second copy shipped to the vision model. Scoped per-enrollment rather
// than global so one student's upload can never resolve to another's row.
export async function ensureAgentAttachmentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_attachments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       sha256 VARCHAR(64) NOT NULL,
       mime VARCHAR(100) NOT NULL,
       byte_size INTEGER NOT NULL,
       filename VARCHAR(255) NOT NULL,
       stored_name VARCHAR(255) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_attachments_owner_hash ON agent_attachments (enrollment_id, sha256)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_attachments_enrollment ON agent_attachments (enrollment_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] agent_attachments schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Agent attachment schema ensured');
}
