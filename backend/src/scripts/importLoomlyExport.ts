/**
 * Import a Loomly calendar export (CSV) into the Content OS - spec section 18 Stage B.
 *
 * Dry run by default: parses, maps, deduplicates, and writes the exception report. The dry run
 * READS the database (brand lookup, existing-key check) and writes nothing; `--execute`
 * performs the writes. Published posts land as READ-ONLY
 * history with provenance `loomly_import`; future schedules land as drafts that need
 * verification; every skipped or invalid row is in the report. Re-running the same file is a
 * no-op (every row is keyed; existing keys are reported as duplicate_existing).
 *
 * Run: `npx ts-node src/scripts/importLoomlyExport.ts <export.csv>`                 (dry run)
 * Run: `npx ts-node src/scripts/importLoomlyExport.ts <export.csv> --execute`       (apply)
 * Opts: `--calendar "Colaberry Main=colaberry"` (repeatable; maps a Loomly calendar to a brand slug)
 *       `--report <path.md>` (default: tmp/loomly-exceptions-<timestamp>.md)
 *
 * Output: the exception report path, and a summary line per kind.
 */
import * as fs from 'fs';
import * as path from 'path';
import { planImport, renderExceptionReport } from '../services/marketing/loomlyImport';
import { importLoomlyPosts, sequelizeLoomlyStore } from '../services/marketing/loomlyImportService';

interface Args { file: string; execute: boolean; report: string | null; calendars: Record<string, string> }

function parseArgs(argv: string[]): Args {
  const out: Args = { file: '', execute: false, report: null, calendars: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--execute') out.execute = true;
    else if (a === '--report') { out.report = argv[i + 1] ?? null; i += 1; }
    else if (a === '--calendar') {
      const spec = argv[i + 1] ?? ''; i += 1;
      const eq = spec.indexOf('=');
      if (eq <= 0) throw new Error(`--calendar expects "<Loomly calendar>=<brand-slug>", got "${spec}"`);
      out.calendars[spec.slice(0, eq)] = spec.slice(eq + 1);
    } else if (!a.startsWith('--')) out.file = a;
    else throw new Error(`Unknown option ${a}`);
  }
  if (!out.file) throw new Error('Usage: importLoomlyExport.ts <export.csv> [--execute] [--calendar "Name=slug"] [--report path]');
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const csv = fs.readFileSync(path.resolve(args.file), 'utf8');
  const now = new Date();

  const plan = planImport(csv, now);
  console.log(`[loomly-import] ${args.execute ? 'EXECUTE' : 'DRY RUN'} ${args.file}`);
  console.log(`[loomly-import] rows=${plan.counts.rows} mapped=${plan.counts.mapped} history=${plan.counts.history} scheduled_draft=${plan.counts.scheduledDraft} draft=${plan.counts.draft} dup_in_batch=${plan.counts.duplicatesInBatch} skipped=${plan.counts.skipped}`);

  const fileLevel = plan.exceptions.filter((e) => e.row === 0);
  for (const e of fileLevel) console.log(`[loomly-import] header: ${e.code} - ${e.detail}`);

  const exceptions = [...plan.exceptions];
  const reportPath = args.report ?? path.resolve(__dirname, '../../../tmp', `loomly-exceptions-${now.toISOString().replace(/[:.]/g, '-')}.md`);
  const writeReport = () => {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderExceptionReport(exceptions, args.file, now), 'utf8');
    console.log(`[loomly-import] exception report: ${reportPath} (${exceptions.length} exceptions)`);
  };

  if (plan.exceptions.some((e) => e.code === 'missing_column')) {
    console.error('[loomly-import] file rejected: required columns missing. Fix the header aliases (see docs/marketing/LOOMLY_IMPORT_MAPPING.md) and re-run.');
    writeReport();
    return;
  }

  // The parse-level exceptions are already in hand; the report is written whether or not the
  // store step succeeds, so a database failure never costs the operator the triage list.
  try {
    const outcome = await importLoomlyPosts(plan.posts, sequelizeLoomlyStore(), { execute: args.execute, calendarToBrandSlug: args.calendars });
    exceptions.push(...outcome.exceptions);
    console.log(`[loomly-import] ${args.execute ? 'imported' : 'would import'}: history=${outcome.imported.history} scheduled_draft=${outcome.imported.scheduledDraft} draft=${outcome.imported.draft}; skipped_existing_or_unmapped=${outcome.skipped}`);
  } finally {
    writeReport();
  }
  if (!args.execute) console.log('[loomly-import] dry run - nothing written. Re-run with --execute to apply.');
}

main().then(() => process.exit(0)).catch((err) => {
  // Sequelize connection errors carry an empty message and the cause in `parent`; the class
  // name is what says "no database", so it is printed first.
  const e = err as { name?: string; message?: string; parent?: { code?: string; message?: string } };
  const cause = e?.parent?.code ?? e?.parent?.message ?? '';
  console.error(`[loomly-import] FAILED: ${e?.name ?? 'Error'}: ${e?.message || '(no message)'}${cause ? ` [${cause}]` : ''}`);
  process.exit(1);
});
