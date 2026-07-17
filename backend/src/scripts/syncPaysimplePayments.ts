/**
 * syncPaysimplePayments — CLI wrapper around the PaySimple payment reconciliation.
 *
 * Pulls payments from the PaySimple API and reconciles each enrollment's payment
 * state so the dashboard Revenue (SUM amount_paid where paid) reflects reality:
 * payments that went through become revenue; failed/reversed ones are subtracted.
 * Use for the initial backfill and manual re-runs; the in-process job runs every
 * 30 min via schedulerService (PaySimplePaymentSync, gated by PAYSIMPLE_SYNC_ENABLED).
 * Idempotent — safe to run repeatedly (only writes on an actual state change).
 *
 * Usage:
 *   npx ts-node src/scripts/syncPaysimplePayments.ts                  # last 120 days
 *   npx ts-node src/scripts/syncPaysimplePayments.ts --since-days=365 # backfill a year
 *   npx ts-node src/scripts/syncPaysimplePayments.ts --dry-run        # report, write nothing
 *
 * Requires PAYSIMPLE_API_USER / PAYSIMPLE_API_KEY (live READ access) + PAYSIMPLE_ENV=live.
 */
import { sequelize } from '../config/database';
import { syncPaySimplePayments } from '../services/paymentSyncService';

function argInt(flag: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!hit) return fallback;
  const n = parseInt(hit.split('=')[1], 10);
  return Number.isFinite(n) ? n : fallback;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const sinceDays = argInt('--since-days', 120);

  await sequelize.authenticate();
  const s = await syncPaySimplePayments({ sinceDays, dryRun });

  console.log('\n=== PaySimple payment sync complete ===');
  console.log(`  mode:              ${dryRun ? 'DRY-RUN (no writes)' : 'COMMIT'}`);
  console.log(`  window:            last ${sinceDays} days`);
  if (s.skipped) {
    console.log(`  SKIPPED:           ${s.reason}`);
  } else {
    console.log(`  payments pulled:   ${s.pulled}`);
    console.log(`  enrollments matched:${s.matchedEnrollments}`);
    console.log(`  marked paid:       ${s.markedPaid}`);
    console.log(`  reversed (failed): ${s.markedFailed}`);
    console.log(`  unchanged:         ${s.unchanged}`);
    console.log(`  unmatched payments:${s.unmatchedPayments}`);
  }

  await sequelize.close();
  process.exit(s.skipped ? 2 : 0);
}

main().catch((err) => {
  console.error('[syncPaysimplePayments] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
