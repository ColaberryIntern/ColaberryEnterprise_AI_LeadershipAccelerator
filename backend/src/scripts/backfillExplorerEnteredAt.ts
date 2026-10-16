/**
 * M21 - fill `explorer_entered_at` for the Explorer rows that were recovered by
 * the T207 coherence backfill and therefore never had one written.
 *
 * WHAT THE COLUMN MEANS, decided by the code that already writes it rather than
 * by this script. The live registration path sets it to the moment of
 * registration:
 *
 *   freeAccountRegistration.ts:85   explorer_entered_at: programme === 'learner' ? new Date() : null
 *   enrollmentService.ts:352        explorer_entered_at: new Date()
 *
 * So the column means "the moment this person entered the Explorer programme".
 * For a row the T207 backfill recovered, that moment is `created_at`: they
 * entered when they signed up at $0, and the backfill only RECOGNISED a
 * membership that already existed on 2026-10-13. It did not create one.
 *
 * WHY NOT THE EARLIEST LEAD DATE. It is available for all 56 rows, and it is a
 * real fact, but it is a DIFFERENT one: first touch, when we first saw them.
 * `journeyPanel` already carries that separately as `firstTouch`. Putting it
 * here would place two meanings in one column, which is the failure this whole
 * reset has been correcting.
 *
 * MEASURED BEFORE WRITING THIS (2026-10-16, production):
 *   67 coherent explorer+guest rows
 *   56 with explorer_entered_at NULL  - created 2026-07-15 to 2026-10-12, the backfilled ones
 *   11 with it set                    - registered 2026-10-13 to 2026-10-15, since the fix shipped
 * The mechanism already works for new registrations. This is strictly about the
 * 56 historical rows.
 *
 * DRY RUN IS THE DEFAULT, as in `backfillFreeAccountCoherence.ts`. This script
 * derives its own population, so the default has to be the harmless one.
 *
 * Usage:
 *   docker exec accelerator-backend node dist/scripts/backfillExplorerEnteredAt.js
 *   docker exec accelerator-backend node dist/scripts/backfillExplorerEnteredAt.js \
 *     --confirm-production --ledger /tmp/m21-ledger.json
 *   docker exec accelerator-backend node dist/scripts/backfillExplorerEnteredAt.js \
 *     --invert /tmp/m21-ledger.json --confirm-production
 */
import * as fs from 'fs';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { rowsAffected } from './backfillFreeAccountCoherence';

/** One row we intend to change, and what it will be changed from and to. */
export interface EntryLedgerEntry {
  id: string;
  from: null;
  to: string;
}

export interface EntryCounts {
  coherent: string;
  entered_null: string;
  entered_set: string;
}

/** Counted straight from the table: the before/after witness. */
const COUNT_SQL = `
  SELECT count(*) AS coherent,
         count(*) FILTER (WHERE explorer_entered_at IS NULL)     AS entered_null,
         count(*) FILTER (WHERE explorer_entered_at IS NOT NULL) AS entered_set
  FROM enrollments
  WHERE enrollment_type = 'explorer' AND tier = 'guest'
`;

/**
 * The population: coherent Explorer rows with no entry date. `created_at` is
 * NOT NULL on this table, so every candidate yields a value; a row that somehow
 * had none would be excluded here rather than written as null.
 */
const CANDIDATE_SQL = `
  SELECT id, created_at
  FROM enrollments
  WHERE enrollment_type = 'explorer'
    AND tier = 'guest'
    AND explorer_entered_at IS NULL
    AND created_at IS NOT NULL
  ORDER BY created_at ASC
`;

async function counts(): Promise<EntryCounts> {
  const [row] = await sequelize.query(COUNT_SQL, { type: QueryTypes.SELECT });
  return row as unknown as EntryCounts;
}

function printCounts(label: string, c: EntryCounts): void {
  console.log(`${label} coherent(explorer+guest)=${c.coherent}  entered_at NULL=${c.entered_null}`
    + `  entered_at set=${c.entered_set}`);
}

export function planEntries(
  rows: Array<{ id: string; created_at: Date | string }>,
): EntryLedgerEntry[] {
  return rows.map((r) => ({
    id: r.id,
    from: null,
    to: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export function parseEntryLedger(raw: string): EntryLedgerEntry[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('ledger must be a JSON array');
  return parsed.map((candidate, i) => {
    const e = candidate as Partial<EntryLedgerEntry>;
    if (typeof e?.id !== 'string' || !e.id) throw new Error(`ledger[${i}]: id must be a non-empty string`);
    if (typeof e.to !== 'string' || !e.to) throw new Error(`ledger[${i}]: to must be a non-empty string`);
    return { id: e.id, from: null, to: e.to };
  });
}

/**
 * Pinned to `explorer_entered_at IS NULL`, so a row that gained a date between
 * the plan and the commit is left alone rather than overwritten with a value
 * decided about a different state.
 */
async function commit(ledger: EntryLedgerEntry[]): Promise<{ applied: number; unverified: number }> {
  let applied = 0;
  let unverified = 0;
  for (const e of ledger) {
    const [, meta] = await sequelize.query(
      'UPDATE enrollments SET explorer_entered_at = :to WHERE id = :id AND explorer_entered_at IS NULL',
      { replacements: { to: e.to, id: e.id } },
    );
    const n = rowsAffected(meta);
    if (n === null) unverified += 1;
    else applied += n;
  }
  return { applied, unverified };
}

/** Undo: set back to NULL exactly the rows this ledger wrote. */
async function revert(ledger: EntryLedgerEntry[]): Promise<{ applied: number; unverified: number }> {
  let applied = 0;
  let unverified = 0;
  for (const e of ledger) {
    const [, meta] = await sequelize.query(
      'UPDATE enrollments SET explorer_entered_at = NULL WHERE id = :id AND explorer_entered_at = :to',
      { replacements: { to: e.to, id: e.id } },
    );
    const n = rowsAffected(meta);
    if (n === null) unverified += 1;
    else applied += n;
  }
  return { applied, unverified };
}

function report(o: { applied: number; unverified: number }, planned: number, verb: string): void {
  console.log(`\n${verb} ${o.applied} of ${planned}`);
  if (o.unverified > 0) {
    console.log(`WARNING: ${o.unverified} statement(s) returned no readable row count, so the number`
      + ' above UNDERSTATES what was written. Trust the before/after counts, which are queried'
      + ' from the table rather than reported by this script.');
  }
}

export async function runForward(confirm: boolean, ledgerPath?: string | null): Promise<EntryLedgerEntry[]> {
  const rows = (await sequelize.query(CANDIDATE_SQL, {
    type: QueryTypes.SELECT,
  })) as unknown as Array<{ id: string; created_at: Date | string }>;

  printCounts('before:', await counts());
  const ledger = planEntries(rows);
  console.log(`\n== ${ledger.length} write(s) planned: explorer_entered_at = created_at ==`);
  if (ledger.length) {
    console.log(`  earliest ${ledger[0].to}`);
    console.log(`  latest   ${ledger[ledger.length - 1].to}`);
  }
  console.log(JSON.stringify(ledger));
  if (ledgerPath) {
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`ledger written to ${ledgerPath}`);
  }

  if (!confirm) {
    console.log('\nDRY RUN - nothing written. Re-run with --confirm-production to commit.');
    printCounts('after: ', await counts());
    return ledger;
  }

  report(await commit(ledger), ledger.length, 'committed');
  printCounts('after: ', await counts());
  return ledger;
}

export async function runInverse(path: string, confirm: boolean): Promise<EntryLedgerEntry[]> {
  const ledger = parseEntryLedger(fs.readFileSync(path, 'utf8'));
  console.log(`\n== INVERSE of ${ledger.length} write(s) ==`);
  printCounts('before:', await counts());
  if (!confirm) {
    console.log('\nDRY RUN - nothing written. Re-run with --confirm-production to revert.');
    printCounts('after: ', await counts());
    return ledger;
  }
  report(await revert(ledger), ledger.length, 'reverted');
  printCounts('after: ', await counts());
  return ledger;
}

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const confirm = argv.includes('--confirm-production');
  const invert = flagValue(argv, '--invert');
  if (invert) await runInverse(invert, confirm);
  else await runForward(confirm, flagValue(argv, '--ledger'));
  await sequelize.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[backfillExplorerEnteredAt] failed', {
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
