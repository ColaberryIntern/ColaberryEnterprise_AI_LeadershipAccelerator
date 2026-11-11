/**
 * R4 follow-up - remove the memories of conversations that never happened.
 *
 * WHAT IT REMOVES, and nothing else: entries inside
 * `admissions_memory.conversation_summaries` whose `summary` is exactly
 * "0 messages exchanged". That string is not a summary. It is the fallback
 * `saveConversationToMemory` wrote when a conversation had no `role='visitor'` message rows
 * and no generated summary, and `buildMemoryContext()` injects those entries verbatim into
 * Maya's system prompt. She was being told about conversations in which nobody said anything.
 *
 * HOW THEY GOT THERE. The idle sweep began closing conversations on 2026-11-11, and closing is
 * what calls `saveConversationToMemory`. Of the 17 conversations it closed, 9 had no visitor
 * message rows and 8 of those wrote this entry. The guard added to
 * `admissionsMemoryService.saveConversationToMemory` in the same change stops any more being
 * written; this script cleans up the ones already there.
 *
 * MEASURED BEFORE WRITING THIS (2026-11-11, production, read-only):
 *     116  admissions_memory rows
 *       9  with conversation_count > 0
 *       7  holding at least one "0 messages exchanged" entry
 *       5  holding NOTHING ELSE
 *       8  junk entries in total
 *
 * WHAT IT DOES TO THE COUNT. `conversation_count` is incremented once per
 * `saveConversationToMemory` call, so each junk entry inflated it by one. The count is reduced
 * by the number of entries removed from that row, floored at zero. A row left with no entries
 * keeps its identity and its lead link; only the false history goes.
 *
 * WHAT IT WILL NOT DO. It never deletes a memory row, never touches `lead_id`,
 * `questions_asked` or `interests`, and never removes an entry whose summary is anything other
 * than that exact string. A real summary that happens to mention the phrase is not matched,
 * because the comparison is equality on the `summary` field, not a LIKE over the row.
 *
 * DRY RUN IS THE DEFAULT, as in backfillAdmissionsMemoryPerson.ts. `--confirm-production`
 * requires `--ledger <path>` so the write can always be undone.
 *
 * Usage:
 *   docker exec accelerator-backend node dist/scripts/stripEmptyConversationMemories.js
 *   docker exec accelerator-backend node dist/scripts/stripEmptyConversationMemories.js \
 *     --confirm-production --ledger /tmp/r4-strip-ledger.json
 *   docker exec accelerator-backend node dist/scripts/stripEmptyConversationMemories.js \
 *     --invert /tmp/r4-strip-ledger.json --confirm-production
 */
import * as fs from 'fs';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/** The exact string that marks a memory of nothing. Equality, never LIKE. */
export const EMPTY_SUMMARY = '0 messages exchanged';

/** One row we intend to change, with enough of its old self to put it back. */
export interface StripLedgerEntry {
  id: string;
  removed: number;
  before_count: number;
  after_count: number;
  before_summaries: unknown[];
  after_summaries: unknown[];
}

export interface StripCounts {
  rows: string;
  with_junk: string;
  wholly_junk: string;
  junk_entries: string;
}

const COUNT_SQL = `
  SELECT
    (SELECT COUNT(*) FROM admissions_memory)::text AS rows,
    (SELECT COUNT(*) FROM admissions_memory m
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(m.conversation_summaries) e
                     WHERE e->>'summary' = :empty))::text AS with_junk,
    (SELECT COUNT(*) FROM admissions_memory m
      WHERE jsonb_array_length(m.conversation_summaries) > 0
        AND jsonb_array_length(m.conversation_summaries) =
            (SELECT COUNT(*) FROM jsonb_array_elements(m.conversation_summaries) e
              WHERE e->>'summary' = :empty))::text AS wholly_junk,
    (SELECT COALESCE(SUM(n), 0) FROM (
       SELECT (SELECT COUNT(*) FROM jsonb_array_elements(m.conversation_summaries) e
                WHERE e->>'summary' = :empty) AS n
         FROM admissions_memory m) s)::text AS junk_entries
`;

const SELECT_SQL = `
  SELECT m.id::text AS id,
         m.conversation_count AS before_count,
         m.conversation_summaries AS before_summaries,
         COALESCE(
           (SELECT jsonb_agg(e) FROM jsonb_array_elements(m.conversation_summaries) e
             WHERE e->>'summary' IS DISTINCT FROM :empty),
           '[]'::jsonb
         ) AS after_summaries,
         (SELECT COUNT(*) FROM jsonb_array_elements(m.conversation_summaries) e
           WHERE e->>'summary' = :empty) AS removed
    FROM admissions_memory m
   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(m.conversation_summaries) e
                  WHERE e->>'summary' = :empty)
   ORDER BY m.id
`;

export function parseArgs(argv: string[]) {
  const confirm = argv.includes('--confirm-production');
  const ledgerAt = argv.indexOf('--ledger');
  const invertAt = argv.indexOf('--invert');
  return {
    confirm,
    ledger: ledgerAt >= 0 ? argv[ledgerAt + 1] : null,
    invert: invertAt >= 0 ? argv[invertAt + 1] : null,
  };
}

async function counts(): Promise<StripCounts> {
  const [row] = await sequelize.query<StripCounts>(COUNT_SQL, {
    type: QueryTypes.SELECT,
    replacements: { empty: EMPTY_SUMMARY },
  });
  return row;
}

function printCounts(label: string, c: StripCounts): void {
  console.log(
    `${label}: rows ${c.rows} | holding junk ${c.with_junk} | wholly junk ${c.wholly_junk} | junk entries ${c.junk_entries}`
  );
}

/**
 * Undo. Restores only rows this ledger says WE changed, and only where the value is still the
 * one we wrote, so an inversion cannot clobber a memory written after the strip ran.
 */
async function invert(path: string, confirm: boolean): Promise<void> {
  const entries = JSON.parse(fs.readFileSync(path, 'utf8')) as StripLedgerEntry[];
  console.log(`inverting ${entries.length} entries from ${path}`);
  printCounts('before', await counts());

  if (!confirm) {
    console.log('DRY RUN, nothing written. Pass --confirm-production to apply.');
    return;
  }

  let reverted = 0;
  let skipped = 0;
  for (const e of entries) {
    const [, meta] = await sequelize.query(
      `UPDATE admissions_memory
          SET conversation_summaries = CAST(:before AS jsonb),
              conversation_count = :beforeCount
        WHERE id = CAST(:id AS uuid)
          AND conversation_summaries = CAST(:after AS jsonb)
          AND conversation_count = :afterCount`,
      {
        replacements: {
          id: e.id,
          before: JSON.stringify(e.before_summaries),
          after: JSON.stringify(e.after_summaries),
          beforeCount: e.before_count,
          afterCount: e.after_count,
        },
      }
    );
    const n = (meta as { rowCount?: number })?.rowCount ?? 0;
    if (n > 0) reverted += 1;
    else skipped += 1;
  }
  console.log(`reverted ${reverted}, skipped ${skipped} (changed by something else since)`);
  printCounts('after', await counts());
}

async function main(): Promise<void> {
  const { confirm, ledger, invert: invertPath } = parseArgs(process.argv.slice(2));

  if (invertPath) {
    await invert(invertPath, confirm);
    await sequelize.close();
    return;
  }

  printCounts('before', await counts());

  const rows = await sequelize.query<StripLedgerEntry>(SELECT_SQL, {
    type: QueryTypes.SELECT,
    replacements: { empty: EMPTY_SUMMARY },
  });

  const entries: StripLedgerEntry[] = rows.map((r) => {
    const removed = Number(r.removed);
    const beforeCount = Number(r.before_count);
    return {
      id: r.id,
      removed,
      before_count: beforeCount,
      // Each junk entry inflated the count by one. Floored at zero rather than trusted to be
      // consistent, because a negative count would be a worse lie than the one being removed.
      after_count: Math.max(0, beforeCount - removed),
      before_summaries: r.before_summaries as unknown[],
      after_summaries: r.after_summaries as unknown[],
    };
  });

  const totalRemoved = entries.reduce((a, e) => a + e.removed, 0);
  console.log(`\npopulation: ${entries.length} memory row(s), ${totalRemoved} junk entr(ies)`);

  if (!confirm) {
    console.log('\nDRY RUN, nothing written. Pass --confirm-production to apply.');
    for (const e of entries.slice(0, 10)) {
      console.log(
        `  memory ${e.id.slice(0, 8)}: remove ${e.removed}, ` +
          `entries ${e.before_summaries.length} -> ${e.after_summaries.length}, ` +
          `count ${e.before_count} -> ${e.after_count}`
      );
    }
    if (ledger) {
      fs.writeFileSync(ledger, JSON.stringify(entries, null, 2));
      console.log(`plan written to ${ledger}`);
    }
    printCounts('after (unchanged)', await counts());
    await sequelize.close();
    return;
  }

  if (!ledger) {
    throw new Error('--confirm-production requires --ledger <path>, so the write can be undone');
  }

  // The ledger is written BEFORE the updates, so an undo exists even if the run dies partway.
  fs.writeFileSync(ledger, JSON.stringify(entries, null, 2));
  console.log(`ledger written to ${ledger} before any write`);

  let written = 0;
  let skipped = 0;
  for (const e of entries) {
    // RE-CHECKED LIVE rather than trusted from the plan: the guard on the old value means a
    // row the product changed between the SELECT and this UPDATE is left alone, which makes
    // the script idempotent and safe to re-run rather than merely safe to run once.
    const [, meta] = await sequelize.query(
      `UPDATE admissions_memory
          SET conversation_summaries = CAST(:after AS jsonb),
              conversation_count = :afterCount,
              last_updated = NOW()
        WHERE id = CAST(:id AS uuid)
          AND conversation_summaries = CAST(:before AS jsonb)`,
      {
        replacements: {
          id: e.id,
          before: JSON.stringify(e.before_summaries),
          after: JSON.stringify(e.after_summaries),
          afterCount: e.after_count,
        },
      }
    );
    const n = (meta as { rowCount?: number })?.rowCount ?? 0;
    if (n > 0) written += 1;
    else skipped += 1;
  }

  console.log(`\nstripped ${written} row(s), skipped ${skipped} (already changed when reached)`);
  console.log(`undo with --invert ${ledger} --confirm-production`);
  printCounts('after', await counts());
  await sequelize.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(`[stripEmptyConversationMemories] ${(err as Error)?.message}`);
    try {
      await sequelize.close();
    } catch {
      /* already closed */
    }
    process.exit(1);
  });
}

