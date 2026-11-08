/**
 * Write the explicit `settings_json.batch_month` onto any batch row that only has it
 * implicitly, in its name.
 *
 * WHY THIS IS HYGIENE AND NOT A PREREQUISITE. `batchMonthOf` reads
 * `settings_json.batch_month` first and falls back to the documented name convention
 * ("Cohort - <Month> <Year>"), so placement and rollover already work on every batch row
 * in production - including November 2026, the batch open right now, which carries no
 * settings_json block at all while December 2026 through March 2027 carry the full one.
 * This script closes that gap so the field a reader looks at is the field that decides,
 * rather than leaving the live batch resolved by fallback indefinitely.
 *
 * What it will NOT do:
 *   - touch `start_date`. The November row still reads 2026-11-12 where the convention
 *     wants its orientation date (7 December). That is a date members were told, feeding
 *     the Synthflow welcome script and the EnrollSuccessPage calendar invite, and the
 *     directive makes it Ali's call, not an implementation detail.
 *   - overwrite an existing `batch_month`, even a malformed one. A row that disagrees with
 *     its own name is reported as a CONFLICT for a human to settle; silently rewriting it
 *     would destroy the evidence of which one was wrong.
 *   - invent a month for a row whose name has none. No month, no write.
 *
 * Idempotent: a second run finds every row already carrying the key and writes nothing.
 * Merges into `settings_json` rather than replacing it, so the orientation and
 * monthly_class blocks on the December-to-March rows survive.
 *
 * Usage, inside the production container:
 *   node dist/scripts/backfillBatchMonths.js              (dry run - default, no writes)
 *   node dist/scripts/backfillBatchMonths.js --execute    (writes the missing keys)
 */

import { Op } from 'sequelize';
import { Cohort } from '../models';
import { BATCH_COHORT_TYPE, batchMonthFromName } from '../services/batch/batchCohort';

export interface BackfillMonthRow {
  cohort: string;
  cohortId: string;
  /** What `settings_json.batch_month` holds today, raw, if anything. */
  declared: string | null;
  /** What the row's NAME says, independently of the stored key. */
  fromName: string | null;
  action: 'written' | 'would-write' | 'already-declared' | 'no-month-in-name' | 'conflict';
}

/** The declared key, exactly as stored, with no fallback and no validation — so a
 *  malformed value is visible as a conflict instead of being read as absent. */
function declaredMonth(cohort: Cohort): string | null {
  const raw = (cohort as any).settings_json?.batch_month;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export async function run(execute: boolean): Promise<BackfillMonthRow[]> {
  const batches = await Cohort.findAll({
    where: {
      [Op.and]: [
        { [Op.or]: [{ cohort_type: BATCH_COHORT_TYPE }, { cohort_type: null }] },
        { status: { [Op.ne]: 'completed' } },
      ],
    } as any,
    order: [['start_date', 'ASC']],
  });

  const rows: BackfillMonthRow[] = [];
  for (const cohort of batches) {
    const declared = declaredMonth(cohort);
    const fromName = batchMonthFromName(cohort.name);
    const base = { cohort: cohort.name, cohortId: cohort.id, declared, fromName };

    if (declared) {
      // A stored key that matches the name needs nothing. One that does not - malformed,
      // or naming a different month - is a human's call, in either direction.
      rows.push({ ...base, action: declared === fromName ? 'already-declared' : 'conflict' });
      continue;
    }
    if (!fromName) {
      rows.push({ ...base, action: 'no-month-in-name' });
      continue;
    }
    if (!execute) {
      rows.push({ ...base, action: 'would-write' });
      continue;
    }
    await cohort.update({
      settings_json: { ...((cohort as any).settings_json ?? {}), batch_month: fromName },
    });
    rows.push({ ...base, action: 'written' });
  }
  return rows;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const rows = await run(execute);

  console.log(`=== Batch months (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  for (const r of rows) {
    console.log(`[${r.action}] ${r.cohort}: stored=${r.declared ?? '-'} name=${r.fromName ?? '-'}`);
  }
  const conflicts = rows.filter((r) => r.action === 'conflict');
  const wrote = rows.filter((r) => r.action === 'written').length;
  const pending = rows.filter((r) => r.action === 'would-write').length;
  console.log(
    `\n${rows.length} batch row(s): ${execute ? `${wrote} written` : `${pending} would be written`}, ` +
    `${rows.filter((r) => r.action === 'already-declared').length} already declared, ${conflicts.length} conflict(s).`
  );
  if (conflicts.length) {
    console.log('CONFLICTS need a human — the stored key disagrees with the row name:');
    for (const c of conflicts) console.log(`  ${c.cohort}: stored ${c.declared}, name says ${c.fromName ?? 'nothing'}`);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
