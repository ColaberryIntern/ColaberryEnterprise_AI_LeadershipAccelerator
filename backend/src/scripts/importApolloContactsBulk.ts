/**
 * importApolloContactsBulk — walk the Apollo saved-contact list and bring it
 * into the lead queue, one bounded page at a time.
 *
 * The HTTP layer caps a single call at 500 contacts (MAX_CONTACTS_PER_RUN) so a
 * rep-triggered pull from the UI can never run away. The initial load is ~29,700
 * contacts, which is ~60 of those calls — that is what this script is for. It
 * drives the same service the endpoint uses, so there is no second code path
 * and no second set of safety rules.
 *
 * Cannot spend Apollo credits: it goes through apolloAccountClient, whose
 * allowlist covers only account-scoped reads over contacts we already own.
 *
 * Dry run by default. Idempotent, so re-running after an interruption resumes
 * safely and imports nothing twice.
 *
 *   # what would land, from every saved contact
 *   node dist/scripts/importApolloContactsBulk.js
 *
 *   # the sales team's own named lists only, for real
 *   node dist/scripts/importApolloContactsBulk.js --commit --labels=abc123,def456
 *
 *   # cap the run, or resume from where a previous run stopped
 *   node dist/scripts/importApolloContactsBulk.js --commit --max=2000 --start-page=13
 *
 * Options:
 *   --commit           actually write (default: report only)
 *   --labels=a,b,c     restrict to these Apollo list ids (default: all contacts)
 *   --max=N            stop after examining N contacts (default: no limit)
 *   --start-page=N     resume from this Apollo page (default: 1)
 *   --list-labels      print the available Apollo lists and exit
 */
import {
  importApolloContacts,
  listApolloLists,
  MAX_CONTACTS_PER_RUN,
} from '../services/leads/apolloContactImportService';

interface Totals {
  scanned: number;
  imported: number;
  skippedExisting: number;
  skippedNoEmail: number;
  failed: number;
}

function flag(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
}

function intFlag(name: string): number | undefined {
  const raw = flag(name);
  if (raw === undefined || raw === '') return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    console.error(`FATAL --${name} must be a positive integer, got "${raw}"`);
    process.exit(1);
  }
  return n;
}

async function printLabels(): Promise<void> {
  const lists = await listApolloLists();
  console.log(`${lists.length} Apollo lists:\n`);
  for (const l of lists.sort((a, b) => b.count - a.count)) {
    console.log(`  ${String(l.count).padStart(6)}  ${l.id}  ${l.name}`);
  }
  console.log('\nPass --labels=<id>,<id> to import only these.');
}

(async () => {
  if (flag('list-labels') !== undefined) {
    await printLabels();
    return;
  }

  const commit = flag('commit') !== undefined;
  const max = intFlag('max');
  const labelsRaw = flag('labels');
  const labelIds = labelsRaw ? labelsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  let page = intFlag('start-page') ?? 1;

  console.log(`mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`lists: ${labelIds?.length ? labelIds.join(', ') : 'ALL saved contacts'}`);
  console.log(`cap:   ${max ? `${max} contacts` : 'none'}`);
  console.log(`start: page ${page}\n`);

  const totals: Totals = { scanned: 0, imported: 0, skippedExisting: 0, skippedNoEmail: 0, failed: 0 };
  const errors: string[] = [];
  let batch = 0;

  // Each iteration is one bounded call through the same service the UI uses.
  for (;;) {
    const remaining = max === undefined ? MAX_CONTACTS_PER_RUN : Math.min(MAX_CONTACTS_PER_RUN, max - totals.scanned);
    if (remaining <= 0) {
      console.log('\nreached --max, stopping.');
      break;
    }

    const result = await importApolloContacts({ labelIds, limit: remaining, startPage: page, commit });
    batch++;

    totals.scanned += result.scanned;
    totals.imported += result.imported;
    totals.skippedExisting += result.skippedExisting;
    totals.skippedNoEmail += result.skippedNoEmail;
    totals.failed += result.failed;
    errors.push(...result.errors);

    const available = result.totalAvailable !== null ? ` of ~${result.totalAvailable}` : '';
    console.log(
      `batch ${String(batch).padStart(3)}  page ${String(page).padStart(3)}  ` +
      `scanned ${String(totals.scanned).padStart(6)}${available}  ` +
      `${commit ? 'imported' : 'would import'} ${String(totals.imported).padStart(6)}  ` +
      `already here ${String(totals.skippedExisting).padStart(6)}  ` +
      `no email ${String(totals.skippedNoEmail).padStart(5)}  ` +
      `failed ${totals.failed}`
    );

    if (result.nextPage === null) {
      console.log('\nreached the end of the list.');
      break;
    }
    if (result.scanned === 0) {
      // Defensive: a page that returns nothing but still advertises a next page
      // would otherwise spin forever.
      console.log('\nempty page with a next-page cursor, stopping to avoid a loop.');
      break;
    }
    page = result.nextPage;
  }

  console.log('\n=== TOTALS ===');
  console.log(`  scanned:       ${totals.scanned}`);
  console.log(`  ${commit ? 'imported:      ' : 'would import:  '}${totals.imported}`);
  console.log(`  already here:  ${totals.skippedExisting}`);
  console.log(`  no email:      ${totals.skippedNoEmail}`);
  console.log(`  failed:        ${totals.failed}`);
  console.log(`  next page:     ${page}`);

  if (errors.length) {
    console.log(`\nfirst ${Math.min(errors.length, 20)} row errors:`);
    errors.slice(0, 20).forEach((e) => console.log(`  ${e}`));
  }

  if (!commit) {
    console.log('\nDRY RUN: nothing was written. Re-run with --commit.');
  }

  console.log('\nRESULT_JSON:' + JSON.stringify({ ...totals, nextPage: page, committed: commit }));
})().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  if (e?.errorClass) console.error('error_class:', e.errorClass);
  process.exit(1);
});
