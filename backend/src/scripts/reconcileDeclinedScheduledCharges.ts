/**
 * Mark members whose automatic payment declined as past_due, by asking PaySimple.
 * Dry by default: every row it would change is named before anything moves.
 *
 * The daily billing watch runs the same function with a 45-day look-back. This
 * script exists for the one-time catch-up of declines from before the webhook fix
 * (2026-10-31), and for suspending an orphan schedule by hand.
 *
 * Usage, inside the production container:
 *   node dist/scripts/reconcileDeclinedScheduledCharges.js                                  (dry run, 45 days)
 *   node dist/scripts/reconcileDeclinedScheduledCharges.js --since 2026-09-01T00:00:00Z     (dry run, catch-up window)
 *   node dist/scripts/reconcileDeclinedScheduledCharges.js --since 2026-09-01T00:00:00Z --execute
 *   node dist/scripts/reconcileDeclinedScheduledCharges.js --suspend-orphan 4511909          (dry run)
 *   node dist/scripts/reconcileDeclinedScheduledCharges.js --suspend-orphan 4511909 --execute
 */

import { reconcileDeclinedScheduledCharges, suspendOrphanSchedule } from '../services/billing/declinedChargeReconcile';

function argAfter(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const mode = execute ? 'EXECUTE' : 'DRY RUN';

  const orphan = argAfter('--suspend-orphan');
  if (process.argv.includes('--suspend-orphan')) {
    const r = await suspendOrphanSchedule(orphan ?? '', { execute });
    console.log(`=== Suspend orphan schedule (${mode}) ===`);
    console.log(`[${r.outcome}] schedule ${r.scheduleId}${r.subscriptionId ? ` row ${r.subscriptionId}` : ''}${r.reason ? `: ${r.reason}` : ''}`);
    if (r.outcome === 'refused' || r.outcome === 'failed') process.exitCode = 1;
    return;
  }

  const sinceRaw = argAfter('--since');
  let since: Date | undefined;
  if (sinceRaw !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(sinceRaw) || Number.isNaN(Date.parse(sinceRaw))) {
      console.error('--since needs an ISO timestamp with a zone, e.g. 2026-09-01T00:00:00Z');
      process.exit(1);
    }
    since = new Date(sinceRaw);
  }

  const report = await reconcileDeclinedScheduledCharges({ execute, since });
  console.log(`=== Declined scheduled charge reconcile (${mode}), charges since ${report.since} ===`);
  for (const r of report.rows) {
    console.log(
      `[${r.action}] ${r.name ?? '?'} <${r.email ?? '?'}> row ${r.subscriptionId} schedule ${r.scheduleId} `
      + `period ended ${r.periodEnd}`
      + (r.paymentId ? ` latest charge ${r.paymentId} ${r.paymentDate ?? ''}` : '')
      + (r.reason ? `\n      reason: ${r.reason}` : '')
      + (r.marked !== undefined ? `\n      marked: ${r.marked}` : '')
      + (r.error ? `\n      ERROR: ${r.error}` : ''),
    );
  }
  const toMark = report.rows.filter((r) => r.action === 'mark_past_due');
  console.log(`\n${report.rows.length} lapsed scheduled row(s); ${toMark.length} ${execute ? 'processed for' : 'would be marked'} past_due`
    + (execute ? `, ${toMark.filter((r) => r.marked).length} actually moved.` : '. Dry run: nothing changed.'));
  if (report.rows.some((r) => r.error)) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error('Reconcile failed:', err?.message ?? err);
      process.exit(1);
    });
}
