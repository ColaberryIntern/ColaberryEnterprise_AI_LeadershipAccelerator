/**
 * Run the paid-member welcome sweep (C10.18) by hand, dry by default.
 *
 * The cron runs the same function every 15 minutes once `PAID_MEMBER_WELCOME_ENABLED=true`. This
 * exists for the step before that: naming every member who WOULD be mailed, against real
 * production data, without sending anything. A dry run here is evidence about the scheduled job
 * rather than about a second implementation of it, because it calls the same function the cron
 * calls.
 *
 * `--execute` still obeys `PAID_MEMBER_WELCOME_ENABLED`. The flag is the switch; this is not a way
 * around it, and the sweep reports `disabled` rather than pretending to run.
 *
 * Usage, inside the production container:
 *   node dist/scripts/runPaidMemberWelcomeSweep.js                 (dry run - default)
 *   node dist/scripts/runPaidMemberWelcomeSweep.js --limit 5
 *   node dist/scripts/runPaidMemberWelcomeSweep.js --execute
 *   node dist/scripts/runPaidMemberWelcomeSweep.js --since 2026-11-01T00:00:00Z   (dry run, given cutoff)
 *
 * `--execute` also needs `PAID_MEMBER_WELCOME_SINCE`: only members who first pay after it are mailed.
 */

import { runPaidMemberWelcomeSweep, PaidWelcomeRow } from '../services/welcome/paidMemberWelcomeService';

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const limitAt = process.argv.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : undefined;
  if (limitAt >= 0 && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error('--limit needs a positive number');
    process.exit(1);
  }

  // --since <ISO> asks "who would this cutoff mail"; without it the env cutoff applies.
  const sinceAt = process.argv.indexOf('--since');
  const since = sinceAt >= 0 ? process.argv[sinceAt + 1] : undefined;

  const report = await runPaidMemberWelcomeSweep({ execute, limit, since });

  console.log(`=== Paid member welcome sweep (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  for (const r of report.rows) {
    if (r.outcome === 'disabled') {
      console.log(`[disabled] ${r.error ?? 'switched off'}, so nothing was sent.`);
      console.log('           Read the copy first: node dist/scripts/previewPaidMemberWelcome.js');
      continue;
    }
    console.log(
      `[${r.outcome}] ${r.email}  batch="${r.batchLabel ?? '-'}"  `
      + `orientation="${r.orientation ?? '-'}"  room=${r.hasRoom ? 'yes' : 'no'}`
      + (r.error ? `  error=${r.error}` : '')
    );
  }

  const count = (o: PaidWelcomeRow['outcome']) => report.rows.filter((r) => r.outcome === o).length;
  console.log(
    `\n${report.rows.length} row(s): `
    + `${execute ? `${count('sent')} sent` : `${count('would-send')} would be sent`}, `
    + `${count('already-welcomed')} already welcomed, `
    + `${count('not-in-a-batch')} not in a batch, ${count('no-email')} with no address, `
    + `${count('failed')} failed.`
  );
  if (count('not-in-a-batch')) {
    console.log('"not in a batch" is correct, not a gap: a member is never mailed a link to a '
      + 'batch room before their placement has landed.');
  }
  if (!execute && count('would-send')) {
    console.log('Dry run: nothing was sent. --execute sends, and still obeys the flag.');
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Sweep failed:', err);
      process.exit(1);
    });
}
