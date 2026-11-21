import { sequelize } from '../config/database';

/**
 * Career Prep v27, Releases 2 and 3 (the getting-hired pipeline): the placement tables. One module so the Career Prep
 * schema file stays small; later tasks append their tables here in order (CP6 inbox, CP8 interviews, CP9 room, CP10
 * offers and employers, CP11 desk).
 *
 * ADDITIVE ONLY. Every statement is CREATE ... IF NOT EXISTS, so this runs on every boot and a re-run is a no-op.
 * Nothing existing is altered. Run by hand to roll back: PLACEMENT_SCHEMA_ROLLBACK (never at boot).
 *
 *   job_search_inboxes   (CP6.1, kit F2) one row per learner: the Gmail address they made for their job search
 *                        (UNIQUE per learner) and its canonical Gmail mailbox (dots and +tag removed, UNIQUE across
 *                        learners, so two learners can never claim one inbox), when forwarding was
 *                        verified, the last mail and the last daily test (sent at, token, how long it took to arrive).
 *                        broken_since / broken_alerted_at / broken_alert_attempts (CP6.1c): the current "forwarding
 *                        broken" spell (the missed test that began it), and its one email alert (at most 3 tries).
 *                        Health (Healthy / Quiet / Forwarding broken / Not tested) is computed, never stored
 *                        (services/placement/inboxHealth.ts), so it can never go stale.
 *   inbox_received       (CP6.1) "Everything it received": one row per message, UNIQUE on the RFC 5322 Message-ID,
 *                        so a replayed event or a re-run test adds nothing.
 */
export const PLACEMENT_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS job_search_inboxes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
     address VARCHAR(254) NOT NULL,
     mailbox VARCHAR(254) NOT NULL,
     verified_at TIMESTAMPTZ,
     last_received_at TIMESTAMPTZ,
     forwarding_confirmed_at TIMESTAMPTZ,
     forwarding_code VARCHAR(32),
     forwarding_link TEXT,
     last_test_at TIMESTAMPTZ,
     last_test_token VARCHAR(64),
     last_test_ms INTEGER CHECK (last_test_ms IS NULL OR last_test_ms >= 0),
     broken_since TIMESTAMPTZ,
     broken_alerted_at TIMESTAMPTZ,
     broken_alert_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (broken_alert_attempts >= 0),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_job_search_inboxes_mailbox ON job_search_inboxes (mailbox)',
  `CREATE TABLE IF NOT EXISTS inbox_received (
     id BIGSERIAL PRIMARY KEY,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     message_id VARCHAR(255) NOT NULL UNIQUE,
     received_at TIMESTAMPTZ NOT NULL,
     from_name VARCHAR(160),
     subject VARCHAR(300),
     category VARCHAR(40),
     confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
     outcome VARCHAR(160),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_inbox_received_enrollment ON inbox_received (enrollment_id, received_at DESC)',
];

/** Run by hand to roll the placement tables back. Never run at boot. Dependents first. */
export const PLACEMENT_SCHEMA_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS inbox_received',
  'DROP TABLE IF EXISTS job_search_inboxes',
];

/** Boot: create what is missing. A statement that fails is logged and skipped; boot continues. */
export async function ensurePlacementSchema(): Promise<void> {
  for (const sql of PLACEMENT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'placement_schema_stmt_skipped', outcome: 'partial', error_class: e.name || 'Error',
        context: { message: e.message.slice(0, 200) },
      }));
    }
  }
  console.log('[DB] placement schema ensured');
}
