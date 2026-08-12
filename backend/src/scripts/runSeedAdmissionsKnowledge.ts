/**
 * One-off: force-run seedAdmissionsKnowledge() outside its normal trigger.
 *
 * seedAdmissionsKnowledge() only runs automatically via aiOpsScheduler's
 * startAIOpsScheduler(), which is gated behind ENABLE_FOLLOWUP_SCHEDULER — off
 * in local/dev containers by default. That means editing admissionsKnowledgeSeed.ts's
 * SEED_ENTRIES doesn't actually reach the database until either that flag is
 * enabled (which also arms unrelated cron jobs) or this script is run directly.
 * Same root cause hit in session CC-20260803-n4k9; this makes the workaround
 * reusable instead of a one-off inline eval each time.
 *
 * Idempotent — seedAdmissionsKnowledge() itself is an upsert keyed on title.
 *
 * Usage:
 *   npx ts-node src/scripts/runSeedAdmissionsKnowledge.ts
 */

import { sequelize } from '../config/database';
import { seedAdmissionsKnowledge } from '../services/admissionsKnowledgeSeed';

async function run() {
  await sequelize.authenticate();
  console.log('[run-seed-admissions] DB connected, seeding...');
  await seedAdmissionsKnowledge();
  console.log('[run-seed-admissions] done');
  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[run-seed-admissions] Failed:', err?.message || err);
  process.exit(1);
});
