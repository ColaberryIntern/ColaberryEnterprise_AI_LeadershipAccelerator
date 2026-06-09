/**
 * Idempotent migration: creates the anthropic_content_registry table.
 *
 * Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS
 * so re-running against an existing schema is a no-op.
 *
 * Run: `npx ts-node backend/src/seeds/createAnthropicContentRegistry.ts`
 */

import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../../../.env.dev') });

import { sequelize } from '../config/database';

async function run(): Promise<void> {
  console.log('[createAnthropicContentRegistry] start');

  await sequelize.authenticate();

  // Create ENUM type idempotently (Postgres requires explicit type creation)
  await sequelize.query(`
    DO $$ BEGIN
      CREATE TYPE anthropic_content_type AS ENUM ('course', 'document', 'news', 'partner-portal');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS anthropic_content_registry (
      id             UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
      content_type   anthropic_content_type    NOT NULL,
      title          VARCHAR(500)              NOT NULL,
      url            VARCHAR(1000)             NOT NULL UNIQUE,
      last_checked   TIMESTAMPTZ               DEFAULT NULL,
      last_modified  TIMESTAMPTZ               DEFAULT NULL,
      change_detected BOOLEAN                  NOT NULL DEFAULT FALSE,
      change_summary JSONB                     DEFAULT NULL,
      etag           TEXT                      DEFAULT NULL,
      content_hash   VARCHAR(64)               DEFAULT NULL,
      created_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW()
    );
  `);

  // Add any columns that may be missing in older deployments (safe no-op if already present)
  const safeAdds = [
    `ALTER TABLE anthropic_content_registry ADD COLUMN IF NOT EXISTS etag TEXT DEFAULT NULL`,
    `ALTER TABLE anthropic_content_registry ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64) DEFAULT NULL`,
  ];
  for (const stmt of safeAdds) {
    await sequelize.query(stmt);
  }

  console.log('[createAnthropicContentRegistry] table ready');
  await sequelize.close();
}

run().catch((err) => {
  console.error('[createAnthropicContentRegistry] FATAL:', err.message);
  process.exit(1);
});
