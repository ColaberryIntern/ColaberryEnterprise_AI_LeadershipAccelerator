// Idempotent: creates inbox_alert_log table used by inbox COS dedupe
// (URGENT keyword classifier + auth-expired notifications). Survives
// container restarts so the same alert does not re-fire when the
// in-process Map gets wiped.
//
// Run via: ts-node backend/src/seeds/seedInboxAlertLog.ts. Safe to rerun.

import { sequelize } from '../config/database';

export async function seedInboxAlertLog(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS inbox_alert_log (
      id BIGSERIAL PRIMARY KEY,
      alert_kind VARCHAR(64) NOT NULL,
      dedup_key TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_inbox_alert_log_lookup
     ON inbox_alert_log(alert_kind, dedup_key, sent_at DESC);`
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_inbox_alert_log_sent_at
     ON inbox_alert_log(sent_at DESC);`
  );
}

if (require.main === module) {
  seedInboxAlertLog()
    .then(() => { console.log('inbox_alert_log ready'); process.exit(0); })
    .catch((err) => { console.error('seed failed:', err); process.exit(1); });
}
