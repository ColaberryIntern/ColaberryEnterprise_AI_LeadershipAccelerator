/**
 * Mail every student whose membership period is about to end: here is what ends,
 * when, what the next term costs, and the link that pays for it.
 *
 * This platform has no recurring billing. When `current_period_end` passes,
 * nothing charges the student and nobody is told. See
 * docs/RECURRING_BILLING_EXPOSURE.md. This is the stopgap: the student renews
 * themselves by clicking a checkout link, which also means they authorize their
 * own charge rather than us converting a one-time authorization into a standing
 * schedule.
 *
 * DRY RUN BY DEFAULT. Nothing leaves the building without --send. A dry run
 * prints exactly who would be mailed and the full rendered body, mints no
 * PaySimple link, and writes nothing at all, not even the ledger table.
 *
 * Run:  node dist/scripts/sendRenewalReminders.js
 *       node dist/scripts/sendRenewalReminders.js --send            # actually sends
 *       npx ts-node src/scripts/sendRenewalReminders.ts             # from source
 *
 * Flags:
 *   --send           required to send. Without it this is a dry run.
 *   --only <email>   restrict to one recipient, for a careful first send
 *   --now <iso>      evaluate the window as at this instant, for checking a
 *                    future day's selection without waiting for it
 *   --json           emit the run summary as JSON instead of the readable report
 *
 * Output: dry-run report or send log to stdout. With --send, writes rows to
 * subscription_renewal_reminders and creates one pending subscription row per
 * (subscription, period) via the existing startCheckout path.
 */

import { runRenewalReminders, type RenewalRunSummary } from '../services/renewal/renewalReminderService';
import { ADVANCE_LEAD_DAYS, FINAL_LEAD_DAYS, type SkipReason } from '../services/renewal/renewalReminderSelection';

function flag(name: string, argv: string[]): boolean {
  return argv.includes(`--${name}`);
}

function value(name: string, argv: string[], fallback: string | null = null): string | null {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}

const money = (cents: number): string => `$${(Math.round(cents) / 100).toFixed(2)}`;

/** Skip reasons worth putting in front of a human, and how to label them. The
 *  rest (not_yet_due, comped) are the normal state of most of the book and
 *  would bury the signal. */
const NOTABLE_SKIPS: Partial<Record<SkipReason, string>> = {
  already_lapsed: 'ALREADY LAPSED (never mailed, never charged retroactively)',
  superseded: 'SUPERSEDED (a later active subscription exists, so this one renewed)',
  unusable_email: 'UNUSABLE EMAIL',
  no_period_end: 'NO PERIOD END ON THE ROW',
  zero_amount: 'ZERO AMOUNT',
};

function report(summary: RenewalRunSummary): void {
  const counts = new Map<string, number>();
  for (const s of summary.selection.skipped) counts.set(s.reason, (counts.get(s.reason) || 0) + 1);

  console.log('');
  console.log(`sendRenewalReminders  ${new Date().toISOString()}`);
  console.log(`Mode:      ${summary.dry_run ? 'DRY RUN (no mail, no PaySimple call, no writes)' : 'SEND (live)'}`);
  console.log(`Evaluated: ${summary.now}`);
  console.log(`Windows:   advance at T-${ADVANCE_LEAD_DAYS}d, final at T-${FINAL_LEAD_DAYS}d`);
  console.log(`Book:      ${summary.considered} active subscription(s) considered`);
  console.log('');

  const skipLines: string[] = [];
  for (const [reason, label] of Object.entries(NOTABLE_SKIPS) as Array<[SkipReason, string]>) {
    const rows = summary.selection.skipped.filter((s) => s.reason === reason);
    if (!rows.length) continue;
    skipLines.push(`${label}: ${rows.length}`);
    for (const r of rows) skipLines.push(`    ${r.email || '(no email)'}  ${r.subscription_id}  ${r.detail || ''}`);
  }
  if (skipLines.length) {
    console.log(skipLines.join('\n'));
    console.log('');
  }

  const routine = (['not_yet_due', 'comped', 'not_active'] as SkipReason[])
    .map((r) => `${r}=${counts.get(r) || 0}`).join('  ');
  console.log(`Excluded as routine: ${routine}`);
  console.log('');

  if (summary.skipped_already_sent) {
    console.log(`ALREADY SENT this period, skipped: ${summary.skipped_already_sent}`);
    console.log('');
  }

  if (!summary.planned.length) {
    console.log(summary.dry_run ? 'Nobody is inside a reminder window. Nothing to send.' : 'Nothing to send.');
  } else {
    console.log(`${summary.dry_run ? 'WOULD MAIL' : 'MAILED'} ${summary.planned.length} student(s):`);
    console.log('');
    for (const p of summary.planned) {
      const r = p.reminder;
      const charge = r.amount_cents - p.applied_credit_cents;
      console.log(`  ${r.email}  (${r.full_name || 'no name'})`);
      console.log(`    kind      : ${r.kind}   period ends ${r.period_end}  (${r.days_until}d out, ${r.day_delta} calendar day(s))`);
      console.log(`    plan      : ${r.plan}   list ${money(r.amount_cents)}${p.applied_credit_cents ? `  credit ${money(p.applied_credit_cents)}  charge ${money(charge)}` : ''}`);
      console.log(`    subject   : ${p.subject}`);
      console.log(`    link      : ${p.payment_link}${p.reused_link ? '  (reused from the earlier reminder)' : ''}`);
      console.log('');
    }

    const sample = summary.planned[0];
    console.log('-'.repeat(78));
    console.log(`RENDERED BODY (as ${sample.reminder.email} would receive it)`);
    console.log('-'.repeat(78));
    console.log('From:    "Ali Muwwakkil" <ali@colaberry.com>');
    console.log(`To:      ${sample.reminder.email}`);
    console.log(`Subject: ${sample.subject}`);
    console.log('');
    console.log(sample.text);
    console.log('-'.repeat(78));
    console.log('');
  }

  if (summary.failed.length) {
    console.log(`FAILED ${summary.failed.length}:`);
    for (const f of summary.failed) console.log(`  ${f.email}  ${f.error_class}: ${f.message}`);
    console.log('');
  }

  if (summary.dry_run) {
    console.log('Dry run. No mail was sent, no PaySimple link was minted, and nothing was written.');
    console.log('The link above is a placeholder: a real hosted link is created only under --send.');
    console.log('Re-run with --send to mail these.');
  } else {
    console.log(`Sent ${summary.sent} of ${summary.planned.length}. Outcome: ${summary.outcome}.`);
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<RenewalRunSummary> {
  const nowRaw = value('now', argv);
  const nowMs = nowRaw ? Date.parse(nowRaw) : Date.now();
  if (nowRaw && !Number.isFinite(nowMs)) {
    throw Object.assign(new Error(`--now "${nowRaw}" is not a parseable date`), { error_class: 'ValidationError' });
  }

  const summary = await runRenewalReminders({
    send: flag('send', argv),
    onlyEmail: value('only', argv),
    nowMs,
  });

  if (flag('json', argv)) console.log(JSON.stringify(summary, null, 2));
  else report(summary);

  return summary;
}

if (require.main === module) {
  main()
    .then((s) => process.exit(s.outcome === 'failure' ? 1 : 0))
    .catch((e: any) => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'renewal-reminders',
        event: 'run_aborted', error_class: e?.error_class || e?.name || 'UnknownError',
        message: String(e?.message || e), outcome: 'failure',
      }));
      process.exit(1);
    });
}
