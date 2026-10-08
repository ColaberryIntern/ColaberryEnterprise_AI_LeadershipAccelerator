/**
 * Growth OS Reset Phase 2 T207 — backfill the two columns that describe a free
 * account, dry-run by default, printing every count from its own query.
 *
 * The decision lives in `lib/freeAccountCoherenceBackfill.ts`. This file only
 * loads rows, calls that predicate, prints counts, and — with an explicit flag —
 * commits. Keeping them apart is what lets the forward sweep, the inverse and
 * every exclusion test share one definition instead of three.
 *
 * THE SQL SELECTS A SUPERSET; THE PREDICATE DECIDES. The query deliberately
 * carries no `WHERE tier = ...` shape filter. Encoding the predicate once in SQL
 * and again in TypeScript is how a backfill and its inverse come to disagree,
 * and the disagreement surfaces as corrupted rows rather than a failing test.
 * 616 enrollments is nothing to scan, so the whole table goes through the same
 * pure function the tests drive.
 *
 * DRY RUN IS THE DEFAULT, which is the opposite of
 * `withdrawTestDemoRevenueAccounts.ts` (`--dry` opts IN to safety there). That
 * script targets nine pinned ids; this one derives its own population, so the
 * default has to be the harmless one. `confirm` is a parameter rather than a
 * module-level `process.argv` read so that BOTH modes are reachable from a test
 * — AC1 ("a dry run writes nothing") is otherwise only an assertion about
 * printed text.
 *
 * Usage:
 *   # read-only; writes nothing, proves it with before/after counts
 *   docker exec accelerator-backend node dist/scripts/backfillFreeAccountCoherence.js
 *
 *   # commit, and save the ledger the inverse needs
 *   docker exec accelerator-backend node dist/scripts/backfillFreeAccountCoherence.js \
 *     --confirm-production --ledger /tmp/t207-ledger.json
 *
 *   # roll back exactly what that run wrote
 *   docker exec accelerator-backend node dist/scripts/backfillFreeAccountCoherence.js \
 *     --invert /tmp/t207-ledger.json --confirm-production
 *
 * The ledger is also printed to stdout on every committing run, because a deploy
 * empties `/tmp` in this stack and a rollback file that vanished is not a
 * rollback plan.
 */
import * as fs from 'fs';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import {
  BackfillRow,
  LedgerEntry,
  planBackfill,
  planInverse,
} from './lib/freeAccountCoherenceBackfill';

export interface RunOptions {
  /** FALSE means dry run. Nothing reaches the database unless this is true. */
  confirm: boolean;
  ledgerPath?: string | null;
}

/**
 * `subscription_status` answers only the question `isPaid` asks: does ANY
 * subscription hold the row's access open? Taking the newest row instead would
 * read 'canceled' for somebody whose older subscription is still active, and
 * demote a paying member to guest.
 */
const CANDIDATE_SQL = `
  SELECT e.id, e.email, e.status, e.tier, e.enrollment_type, e.payment_status,
         e.amount_paid, e.explorer_entered_at,
         c.name  AS cohort_name,
         cm.role AS community_role,
         cm.mgmt_role AS mgmt_role,
         EXISTS (SELECT 1 FROM org_members om WHERE om.enrollment_id = e.id) AS is_org_member,
         (SELECT s.status FROM subscriptions s
            WHERE s.enrollment_id = e.id AND s.status IN ('active','past_due')
            LIMIT 1) AS subscription_status,
         (SELECT l.source FROM leads l
            WHERE lower(l.email) = lower(e.email)
            ORDER BY l.created_at ASC LIMIT 1) AS lead_source,
         (SELECT l.form_type FROM leads l
            WHERE lower(l.email) = lower(e.email)
            ORDER BY l.created_at ASC LIMIT 1) AS lead_form_type
  FROM enrollments e
  LEFT JOIN cohorts c            ON c.id = e.cohort_id
  LEFT JOIN community_members cm ON cm.enrollment_id = e.id
`;

/** The two shapes, counted straight from the table — the before/after witness. */
const SHAPE_COUNT_SQL = `
  SELECT
    count(*) FILTER (WHERE enrollment_type = 'explorer' AND tier <> 'guest') AS shape_a,
    count(*) FILTER (WHERE enrollment_type = 'standard' AND tier = 'guest')  AS shape_b,
    count(*) FILTER (WHERE enrollment_type = 'explorer' AND tier = 'guest')  AS coherent_free,
    count(*) AS total
  FROM enrollments
`;

export interface ShapeCounts {
  shape_a: string;
  shape_b: string;
  coherent_free: string;
  total: string;
}

async function shapeCounts(): Promise<ShapeCounts> {
  const [row] = await sequelize.query(SHAPE_COUNT_SQL, { type: QueryTypes.SELECT });
  return row as unknown as ShapeCounts;
}

function printCounts(label: string, c: ShapeCounts): void {
  console.log(
    `${label}  shape_a(explorer+non-guest)=${c.shape_a}  shape_b(standard+guest)=${c.shape_b}`
    + `  coherent(explorer+guest)=${c.coherent_free}  total=${c.total}`,
  );
}

async function commitLedger(ledger: LedgerEntry[]): Promise<number> {
  let applied = 0;
  for (const entry of ledger) {
    // One statement per row, each pinned to the value we read, so a row somebody
    // changed between the plan and the commit is left alone instead of being
    // overwritten with a decision made about a different value.
    const [, affected] = await sequelize.query(
      `UPDATE enrollments SET ${entry.column} = :to WHERE id = :id AND ${entry.column} = :from`,
      { replacements: { to: entry.to, from: entry.from, id: entry.id } },
    );
    applied += Number(affected ?? 0);
  }
  return applied;
}

export async function runInverse(path: string, opts: RunOptions): Promise<LedgerEntry[]> {
  const forward = JSON.parse(fs.readFileSync(path, 'utf8')) as LedgerEntry[];
  const inverse = planInverse(forward);
  console.log(`\n== INVERSE of ${forward.length} forward write(s) ==`);
  for (const e of inverse) {
    console.log(`  ${e.id}  ${e.column}: ${e.from} -> ${e.to}`);
  }

  printCounts('before:', await shapeCounts());

  if (!opts.confirm) {
    console.log('\nDRY RUN — nothing written. Re-run with --confirm-production to revert.');
    printCounts('after: ', await shapeCounts());
    return inverse;
  }

  const applied = await commitLedger(inverse);
  console.log(`\nreverted ${applied} of ${inverse.length} row(s)`);
  printCounts('after: ', await shapeCounts());
  return inverse;
}

export async function runForward(opts: RunOptions): Promise<LedgerEntry[]> {
  const rows = (await sequelize.query(CANDIDATE_SQL, {
    type: QueryTypes.SELECT,
  })) as unknown as BackfillRow[];

  printCounts('before:', await shapeCounts());

  const plan = planBackfill(rows);

  console.log(`\n== ${rows.length} row(s) scanned ==`);
  for (const [bucket, n] of Object.entries(plan.buckets).sort()) {
    console.log(`  ${bucket.padEnd(34)} ${n}`);
  }
  console.log('\n== exclusion terms that fired (a row can match several) ==');
  for (const [reason, n] of Object.entries(plan.exclusionCounts).sort()) {
    console.log(`  ${reason.padEnd(34)} ${n}`);
  }

  // Reported, never written: these two buckets are the whole reason this script
  // does not simply flip every row of the right shape.
  for (const bucket of ['paid_and_guest', 'ambiguous_no_learner_provenance'] as const) {
    const ids = plan.decisions.filter((d) => d.bucket === bucket).map((d) => d.id);
    if (!ids.length) continue;
    console.log(`\n== REPORTED FOR HUMAN DECISION — ${bucket} (${ids.length}) ==`);
    for (const id of ids) console.log(`  ${id}`);
  }

  if (plan.programmeWritesWithoutEntryTimestamp > 0) {
    console.log(
      `\nDISCLOSURE: ${plan.programmeWritesWithoutEntryTimestamp} row(s) would join the Explorer`
      + ' programme with explorer_entered_at still NULL. This script writes exactly two columns'
      + ' by design; T209 owns the entry timestamp.',
    );
  }

  console.log(`\n== ${plan.ledger.length} write(s) planned ==`);
  console.log(JSON.stringify(plan.ledger));
  if (opts.ledgerPath) {
    fs.writeFileSync(opts.ledgerPath, JSON.stringify(plan.ledger, null, 2));
    console.log(`ledger written to ${opts.ledgerPath}`);
  }

  if (!opts.confirm) {
    console.log('\nDRY RUN — nothing written. Re-run with --confirm-production to commit.');
    printCounts('after: ', await shapeCounts());
    return plan.ledger;
  }

  const applied = await commitLedger(plan.ledger);
  console.log(`\ncommitted ${applied} of ${plan.ledger.length} planned write(s)`);
  printCounts('after: ', await shapeCounts());
  return plan.ledger;
}

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const opts: RunOptions = {
    confirm: argv.includes('--confirm-production'),
    ledgerPath: flagValue(argv, '--ledger'),
  };
  const invert = flagValue(argv, '--invert');

  if (invert) await runInverse(invert, opts);
  else await runForward(opts);

  await sequelize.close();
}

// Guarded so importing this module for a test does not run the sweep.
if (require.main === module) {
  main().catch((err) => {
    console.error('[backfillFreeAccountCoherence] failed', {
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
