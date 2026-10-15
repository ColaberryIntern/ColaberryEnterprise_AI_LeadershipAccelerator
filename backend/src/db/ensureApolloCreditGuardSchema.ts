import { sequelize } from '../config/database';

// Apollo credit guard — the durable daily counter behind the spend ceiling.
//
// WHY A TABLE AND NOT AN IN-MEMORY COUNTER. The failure this guards against is
// unattended drain by scheduled agents (CC-20260710-a9f2). A process-local counter
// resets on every restart and on every crash-loop, which is exactly the condition
// under which a runaway would be restarting. The ceiling has to survive the process
// that is breaching it, so it lives in the database.
//
// Additive and idempotent, following the ensureAdminUserIdentitySchema template:
// CREATE TABLE IF NOT EXISTS, each statement individually try/caught so a partial
// DB self-heals on the next boot. Never alters or drops anything that exists.
//
// `usage_date` is the primary key, one row per UTC day. UTC rather than local time
// so the window cannot be lengthened or shortened by a server timezone change.
// `call_count` counts BILLABLE calls only: search, enrich and phone-reveal. The
// quota probe is excluded, otherwise a health check would consume the budget it is
// checking.
export const APOLLO_CREDIT_GUARD_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS apollo_credit_usage (
     usage_date   DATE PRIMARY KEY,
     call_count   INTEGER NOT NULL DEFAULT 0,
     last_call_at TIMESTAMPTZ,
     last_label   VARCHAR(80),
     alerted_at   TIMESTAMPTZ
   )`,
  `ALTER TABLE apollo_credit_usage ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ`,
  `ALTER TABLE apollo_credit_usage ADD COLUMN IF NOT EXISTS last_label VARCHAR(80)`,
];

export async function ensureApolloCreditGuardSchema(): Promise<void> {
  for (const sql of APOLLO_CREDIT_GUARD_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] apollo credit guard schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Apollo credit guard schema ensured');
}
