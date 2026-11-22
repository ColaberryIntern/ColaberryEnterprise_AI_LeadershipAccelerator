import { sequelize } from '../config/database';

/**
 * Career Prep v27, CP10.2 (kit "Employer portal", contract assumption 2): the employer accounts behind
 * hire.refactored.ai/client. Its own file because ensurePlacementSchema.ts is at its size limit; run at boot right after
 * it (boot/placementBoot.ts). Additive and re-runnable: every statement is IF NOT EXISTS.
 *
 *   hire_clients              one employer (a company account). Created by staff (the desk, T31); never by a sign-in.
 *   hire_client_members       the people who may sign in for a client: email stored lower-case (CHECK), UNIQUE per client.
 *                             A sign-in never creates one (the magic link proves the mailbox, not access).
 *   hire_client_candidates    the learners staff put forward to a client, UNIQUE (client_id, enrollment_id). A client sees
 *                             ONLY these candidates (and only interviews with its own members, services/placement/clientView.ts).
 *   hire_client_signin_tokens one row per emailed sign-in link: the token is stored HASHED (sha256 of a random UUID), lives
 *                             one hour and is used once (consumed_at set by one conditional UPDATE). Rows for addresses
 *                             with no access are never written; the per-address rate limit reads (email, created_at).
 * placement_offers.client_id holds hire_clients.id; it has no foreign key (that table is created first, and a boot-time
 * ALTER is avoided); offers get their client_id from the signed-in session only.
 */
export const HIRE_CLIENT_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS hire_clients (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(200) NOT NULL CHECK (length(btrim(name)) > 0),
     created_by VARCHAR(120) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS hire_client_members (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES hire_clients(id) ON DELETE CASCADE,
     email VARCHAR(254) NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
     display_name VARCHAR(160),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT uq_hire_client_members_email UNIQUE (client_id, email)
   )`,
  'CREATE INDEX IF NOT EXISTS idx_hire_client_members_email ON hire_client_members (email)',
  `CREATE TABLE IF NOT EXISTS hire_client_candidates (
     id BIGSERIAL PRIMARY KEY,
     client_id UUID NOT NULL REFERENCES hire_clients(id) ON DELETE CASCADE,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     put_forward_by VARCHAR(120) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT uq_hire_client_candidates UNIQUE (client_id, enrollment_id)
   )`,
  `CREATE TABLE IF NOT EXISTS hire_client_signin_tokens (
     id BIGSERIAL PRIMARY KEY,
     email VARCHAR(254) NOT NULL,
     token_hash CHAR(64) NOT NULL UNIQUE,
     expires_at TIMESTAMPTZ NOT NULL,
     consumed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_hire_client_signin_tokens_email ON hire_client_signin_tokens (email, created_at DESC)',
];

/** Run by hand to roll the employer tables back. Never run at boot. Dependents first. */
export const HIRE_CLIENT_SCHEMA_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS hire_client_signin_tokens',
  'DROP TABLE IF EXISTS hire_client_candidates',
  'DROP TABLE IF EXISTS hire_client_members',
  'DROP TABLE IF EXISTS hire_clients',
];

/** Boot: create what is missing. A statement that fails is logged and skipped; boot continues. */
export async function ensureHireClientSchema(): Promise<void> {
  for (const sql of HIRE_CLIENT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'hire_client_schema_stmt_skipped',
        outcome: 'partial', error_class: e.name || 'Error', context: { message: e.message.slice(0, 200) } }));
    }
  }
  console.log('[DB] hire client schema ensured');
}
