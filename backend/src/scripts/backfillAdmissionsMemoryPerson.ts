/**
 * R4 - attach a PERSON to the admissions memory rows that only know a browser.
 *
 * WHAT THE COLUMN MEANS, decided by the code that writes it rather than by this script.
 * `admissions_memory.lead_id` is the person whose memory this is. The live paths that set it
 * are mayaToolsService.captureLeadDetails:161 (behind a bare `.catch(() => {})`, so its
 * failures are invisible), admissionsMemoryService.saveConversationToMemory, and the CEO
 * recognition agent. Nothing set it from `/api/t/identify`, which is where a visitor actually
 * becomes a person - and that asymmetry is the mechanism behind one linked row out of 114.
 *
 * THE EVIDENCE THIS SCRIPT ACTS ON, and the only evidence it will act on: the visitor row
 * that the memory already points at has a `lead_id`. That is a link the product itself drew,
 * at identify time, between this exact browser and this exact person. The script copies it
 * across and invents nothing. A memory row whose visitor has no lead is LEFT ALONE and
 * reported, because there is no evidence to support a guess - the ticket's words are "attached
 * where the evidence supports it".
 *
 * MEASURED BEFORE WRITING THIS (2026-11-09, production, read-only):
 *   114  admissions_memory rows
 *     1  with a lead_id
 *   113  without one
 *    30  of those 113 CAN be linked, because their visitor carries a lead_id
 *    83  cannot: no person is known for that browser, and they stay as they are
 *    73  leads carry two or more visitor identities (63 with two, 7 with three, 3 with four)
 *     2  of those leads have more than one memory row today
 *
 * The ticket says 111 rows, 110 unlinked and 49 multi-identity leads; all three have moved,
 * and 30 rather than 110 is the number this script can honestly act on.
 *
 * A NOTE ON WHAT THIS DOES NOT FIX. Every one of the 114 rows has conversation_count = 0,
 * because all 144 chat conversations are still `status = 'active'` with no `ended_at`:
 * nothing in the frontend calls `/api/chat/close`, so `saveConversationToMemory` has never
 * run in production. Linking a person to an empty memory makes the identity correct; it does
 * not by itself make Maya remember a conversation, and no run of this script should be read
 * as having done so.
 *
 * DRY RUN IS THE DEFAULT, as in backfillExplorerEnteredAt.ts and
 * backfillFreeAccountCoherence.ts. This script derives its own population, so the default has
 * to be the harmless one.
 *
 * Usage:
 *   docker exec accelerator-backend node dist/scripts/backfillAdmissionsMemoryPerson.js
 *   docker exec accelerator-backend node dist/scripts/backfillAdmissionsMemoryPerson.js \
 *     --confirm-production --ledger /tmp/r4-ledger.json
 *   docker exec accelerator-backend node dist/scripts/backfillAdmissionsMemoryPerson.js \
 *     --invert /tmp/r4-ledger.json --confirm-production
 */
import * as fs from 'fs';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/** One row we intend to change, and what it will be changed from and to. */
export interface MemoryPersonLedgerEntry {
  id: string;
  visitor_id: string;
  from: null;
  to: number;
}

export interface MemoryPersonCounts {
  rows: string;
  linked: string;
  unlinked: string;
  linkable: string;
}

/**
 * The before/after witness, counted straight from the table.
 *
 * `linkable` is recomputed rather than remembered, so running the count after a write shows
 * the population draining to zero rather than a number this script asserts about itself.
 */
const COUNT_SQL = `
  SELECT count(*)::text AS rows,
         count(*) FILTER (WHERE m.lead_id IS NOT NULL)::text AS linked,
         count(*) FILTER (WHERE m.lead_id IS NULL)::text AS unlinked,
         count(*) FILTER (WHERE m.lead_id IS NULL AND v.lead_id IS NOT NULL)::text AS linkable
    FROM admissions_memory m
    LEFT JOIN visitors v ON v.id = m.visitor_id
`;

/**
 * The population, with the evidence attached to each row.
 *
 * The join is the evidence. There is no heuristic here on purpose: no email matching, no
 * timing correlation, no "probably the same person". Either the product already linked this
 * browser to this person, or this script does nothing with the row.
 */
const SELECT_SQL = `
  SELECT m.id::text AS id, m.visitor_id::text AS visitor_id, v.lead_id AS to_lead
    FROM admissions_memory m
    JOIN visitors v ON v.id = m.visitor_id
   WHERE m.lead_id IS NULL
     AND v.lead_id IS NOT NULL
   ORDER BY m.created_at ASC
`;

/**
 * Leads that would hold more than one memory row once the links are written.
 *
 * Reported, not merged. Merging two histories is a destructive, judgement-laden operation and
 * this script is reversible by construction; the resolver in admissionsMemoryService picks the
 * OLDEST row deterministically, so a person with two rows still gets one answer rather than an
 * arbitrary one. Measured at 2 leads, so this is a report, not a migration.
 */
const MULTI_SQL = `
  SELECT person::text AS person, n::text AS n FROM (
    SELECT COALESCE(m.lead_id, v.lead_id) AS person, count(*) AS n
      FROM admissions_memory m
      LEFT JOIN visitors v ON v.id = m.visitor_id
     WHERE COALESCE(m.lead_id, v.lead_id) IS NOT NULL
     GROUP BY 1
    HAVING count(*) > 1
  ) t ORDER BY n DESC
`;

export function parseArgs(argv: string[]) {
  const confirm = argv.includes('--confirm-production');
  const ledgerAt = argv.indexOf('--ledger');
  const invertAt = argv.indexOf('--invert');
  const ledger = ledgerAt >= 0 ? argv[ledgerAt + 1] : null;
  const invert = invertAt >= 0 ? argv[invertAt + 1] : null;
  if (ledgerAt >= 0 && !ledger) throw new Error('--ledger requires a path');
  if (invertAt >= 0 && !invert) throw new Error('--invert requires a ledger path');
  return { confirm, ledger, invert };
}

async function counts(): Promise<MemoryPersonCounts> {
  const [row] = await sequelize.query<MemoryPersonCounts>(COUNT_SQL, { type: QueryTypes.SELECT });
  return row;
}

function printCounts(label: string, c: MemoryPersonCounts): void {
  console.log(`${label}: rows ${c.rows} | linked ${c.linked} | unlinked ${c.unlinked} | linkable now ${c.linkable}`);
}

/**
 * Undo. Sets back to NULL only the rows this ledger says WE set, and only where the value is
 * still the one we wrote - so an inversion cannot clobber a link a human or the live product
 * made after the backfill ran.
 */
async function invert(path: string, confirm: boolean): Promise<void> {
  const entries = JSON.parse(fs.readFileSync(path, 'utf8')) as MemoryPersonLedgerEntry[];
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
      `UPDATE admissions_memory SET lead_id = NULL
        WHERE id = CAST(:id AS uuid) AND lead_id = :to`,
      { replacements: { id: e.id, to: e.to } },
    );
    const n = (meta as any)?.rowCount ?? 0;
    if (n > 0) reverted += 1; else skipped += 1;
  }
  console.log(`reverted ${reverted}, skipped ${skipped} (already changed by something else)`);
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

  const rows = await sequelize.query<{ id: string; visitor_id: string; to_lead: number }>(
    SELECT_SQL, { type: QueryTypes.SELECT },
  );
  console.log(`\npopulation: ${rows.length} memory row(s) whose visitor already names a person`);

  const multi = await sequelize.query<{ person: string; n: string }>(MULTI_SQL, { type: QueryTypes.SELECT });
  if (multi.length) {
    console.log(`\nREPORTED, NOT MERGED: ${multi.length} lead(s) would hold more than one memory row.`);
    console.log('The resolver takes the OLDEST row deterministically, so each person still gets one');
    console.log('answer. Merging two histories is destructive and is deliberately not done here.');
    for (const m of multi) console.log(`  lead ${m.person}: ${m.n} rows`);
  }

  const entries: MemoryPersonLedgerEntry[] = rows.map((r) => ({
    id: r.id, visitor_id: r.visitor_id, from: null, to: r.to_lead,
  }));

  if (!confirm) {
    console.log('\nDRY RUN, nothing written. Pass --confirm-production to apply.');
    console.log(`would link ${entries.length} row(s). Sample:`);
    for (const e of entries.slice(0, 5)) {
      console.log(`  memory ${e.id.slice(0, 8)} (visitor ${e.visitor_id.slice(0, 8)}) -> lead ${e.to}`);
    }
    if (ledger) {
      fs.writeFileSync(ledger, JSON.stringify(entries, null, 2));
      console.log(`plan written to ${ledger}`);
    }
    printCounts('after (unchanged)', await counts());
    await sequelize.close();
    return;
  }

  if (!ledger) throw new Error('--confirm-production requires --ledger <path>, so the write can be undone');

  let written = 0;
  let skipped = 0;
  for (const e of entries) {
    // RE-CHECKED LIVE rather than trusted from the plan: the guard `lead_id IS NULL` means a
    // row linked by the product between the SELECT and this UPDATE is left alone, which makes
    // the script idempotent and safe to re-run rather than merely safe to run once.
    const [, meta] = await sequelize.query(
      `UPDATE admissions_memory SET lead_id = :to, last_updated = NOW()
        WHERE id = CAST(:id AS uuid) AND lead_id IS NULL`,
      { replacements: { id: e.id, to: e.to } },
    );
    const n = (meta as any)?.rowCount ?? 0;
    if (n > 0) written += 1; else skipped += 1;
  }

  fs.writeFileSync(ledger, JSON.stringify(entries.slice(0, written), null, 2));
  console.log(`\nlinked ${written}, skipped ${skipped} (already linked when reached)`);
  console.log(`ledger written to ${ledger}; undo with --invert ${ledger} --confirm-production`);
  printCounts('after', await counts());
  await sequelize.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(`[backfillAdmissionsMemoryPerson] ${err?.message}`);
    try { await sequelize.close(); } catch { /* already closed */ }
    process.exit(1);
  });
}
