import { sequelize } from '../config/database';

async function run(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS anthropic_change_events (
      id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      registry_id      UUID          NOT NULL,
      url              TEXT          NOT NULL,
      content_type     VARCHAR(50)   NOT NULL,
      detected_at      TIMESTAMPTZ   NOT NULL,
      detection_method VARCHAR(50)   NOT NULL,
      previous_value   TEXT,
      current_value    TEXT          NOT NULL,
      severity         VARCHAR(20)   NOT NULL DEFAULT 'unknown',
      processed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_change_event UNIQUE (registry_id, detected_at)
    );
  `);
  console.log('[Migration] anthropic_change_events: table ready.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Migration] anthropic_change_events failed:', err);
    process.exit(1);
  });
