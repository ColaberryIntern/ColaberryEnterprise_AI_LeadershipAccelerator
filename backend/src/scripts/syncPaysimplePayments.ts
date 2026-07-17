/**
 * syncPaysimplePayments — CLI wrapper around the PaySimple payment reconciliation.
 *
 * Reconciles ONLY the payments we recorded through our own checkout (the
 * paysimple_payment_ids on subscriptions + enrollments) by reading each one's
 * current status from PaySimple: settled -> paid + amount, failed/reversed ->
 * failed (subtracted). It never matches by email/customer, so old bootcamp /
 * tuition charges can't leak into revenue. The in-process job runs every 30 min
 * via schedulerService (PaySimplePaymentSync, gated by PAYSIMPLE_SYNC_ENABLED).
 * Idempotent — safe to run repeatedly.
 *
 * Usage:
 *   npx ts-node src/scripts/syncPaysimplePayments.ts             # reconcile now
 *   npx ts-node src/scripts/syncPaysimplePayments.ts --dry-run   # report, write nothing
 *
 * Requires PAYSIMPLE_API_USER / PAYSIMPLE_API_KEY (live READ access) + PAYSIMPLE_ENV=live.
 */
import { sequelize } from '../config/database';
import { syncPaySimplePayments } from '../services/paymentSyncService';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  await sequelize.authenticate();
  const s = await syncPaySimplePayments({ dryRun });

  console.log('\n=== PaySimple payment sync complete ===');
  console.log(`  mode:              ${dryRun ? 'DRY-RUN (no writes)' : 'COMMIT'}`);
  if (s.skipped) {
    console.log(`  SKIPPED:           ${s.reason}`);
  } else {
    console.log(`  recorded payments: ${s.knownPayments}`);
    console.log(`  fetched:           ${s.fetched}`);
    console.log(`  marked paid:       ${s.markedPaid}`);
    console.log(`  reversed (failed): ${s.markedFailed}`);
    console.log(`  unchanged:         ${s.unchanged}`);
    console.log(`  fetch errors:      ${s.fetchErrors}`);
  }

  await sequelize.close();
  process.exit(s.skipped ? 2 : 0);
}

main().catch((err) => {
  console.error('[syncPaysimplePayments] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
