/**
 * Run the monthly batch rollover by hand — the operator's copy of the scheduled job.
 *
 * The cron (`BatchRollover`, daily 00:10 Central) is what makes the rollover happen
 * without anyone remembering it. This script exists for the three cases a timer does not
 * cover: proving what the rollover WOULD do before trusting it, running it immediately
 * after a deploy instead of waiting for the next tick, and running it at all while
 * BATCH_ROLLOVER_ENABLED is false.
 *
 * It calls exactly the same function the cron calls, so a dry run here is evidence about
 * the scheduled job and not about a second implementation of it.
 *
 * Usage, inside the production container:
 *   node dist/scripts/rollBatchMonth.js                  (dry run - default, no writes)
 *   node dist/scripts/rollBatchMonth.js --execute        (closes and opens the rows)
 *   node dist/scripts/rollBatchMonth.js --at 2026-12-01  (resolve as if it were that date)
 *
 * `--at` takes a date key and reads it at NOON so the instant lands on that calendar day
 * in Central whatever the container's offset - the same reason `centralWeekdayName` reads
 * its key at noon rather than midnight.
 */

import { rollBatches } from '../services/batch/batchRolloverService';

function parseAt(argv: string[]): Date | undefined {
  const i = argv.indexOf('--at');
  if (i < 0) return undefined;
  const key = argv[i + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key ?? ''))) {
    throw new Error(`--at needs a YYYY-MM-DD date, got ${JSON.stringify(key)}`);
  }
  return new Date(`${key}T12:00:00Z`);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const now = parseAt(process.argv);
  const report = await rollBatches({ now, execute });

  console.log(`=== Batch rollover for ${report.month} (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  if (report.skipped) {
    console.log(`SKIPPED: ${report.skipped}`);
    return;
  }
  for (const c of report.closed) {
    console.log(`[${execute ? 'closed' : 'would close'}] ${c.name} (${c.month}): ${c.from} -> ${c.to}`);
  }
  if (report.opened) {
    console.log(`[${execute ? 'opened' : 'would open'}] ${report.opened.name}: ${report.opened.from} -> ${report.opened.to}`);
  } else {
    console.log(`[no change] the ${report.month} batch was already open`);
  }
  if (report.roomSlug) console.log(`[room] ${report.roomSlug} confirmed`);
  console.log(`\n${report.closed.length} closed, ${report.opened ? 1 : 0} opened.`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
