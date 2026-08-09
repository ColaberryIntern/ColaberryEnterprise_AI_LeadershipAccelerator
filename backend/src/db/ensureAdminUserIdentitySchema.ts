import { sequelize } from '../config/database';

// Reese Phase 1 — staff-identity columns on the existing `admin_users` table.
// Additive only, idempotent, following the ensureWorkLedgerSchema.ts template:
// every statement is ALTER TABLE ... ADD COLUMN IF NOT EXISTS, individually
// try/caught so a partial DB self-heals on the next boot. Never alters or drops
// any existing column, table, or constraint.
//
// `display_name` — human-readable name for staff-directory-style surfaces
// (AdminUser has none today; existing rows stay NULL and are unaffected).
// `is_ai_operated` — internal-only marker so admin views can tell an AI-operated
// staff account apart from a human one; never read by any student-facing route.
// `agent_id` — loose reference (no FK constraint) to `ai_agents.id`, linking a
// staff account to its AiAgent registry row when the account is AI-operated.
// Exported for the idempotency-shape unit test (asserts every statement is a
// safe, additive CREATE/ALTER ... IF NOT EXISTS form before it's ever run).
export const ADMIN_USER_IDENTITY_STATEMENTS: string[] = [
  `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`,
  `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_ai_operated BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS agent_id UUID`,
];

export async function ensureAdminUserIdentitySchema(): Promise<void> {
  for (const sql of ADMIN_USER_IDENTITY_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] admin-user identity schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Reese admin-user identity schema ensured');
}
