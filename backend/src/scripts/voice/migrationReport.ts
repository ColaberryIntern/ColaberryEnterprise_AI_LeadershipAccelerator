/**
 * voice:migration:report (VS5.1). Read only: it reads the matrix document and, with --live, asks the vendor
 * API what assistants exist (GET only). It changes nothing and dials nothing.
 *
 *   npm run voice:migration:report                          check the matrix, one line per row
 *   npm run voice:migration:report -- --live                also compare it with Synthflow (needs SYNTHFLOW_API_KEY)
 *   npm run voice:migration:report -- --matrix <file>       another copy of the document
 *   ... --live --inventory <file>                           also write the redacted inventory (keep it private)
 *
 * Exit: 0 clean, 1 a row lacks something or the matrix and the vendor disagree, 2 refused or unreadable.
 */
import fs from 'fs';
import path from 'path';
import { checkMatrix, compareLive, parseMatrix, type MatrixRow } from '../../services/voice/migration/matrix';

export const DEFAULT_MATRIX = path.resolve(__dirname, '../../../../docs/voice-studio/MIGRATION_MATRIX.md');

export type ReportArgs = { ok: true; live: boolean; matrix: string; inventory?: string } | { ok: false; reason: string };

export function parseReportArgs(argv: string[]): ReportArgs {
  const known = ['--live', '--matrix', '--inventory'];
  for (let i = 0; i < argv.length; i++) {
    if (!known.includes(argv[i])) return { ok: false, reason: `unknown argument ${argv[i]}` };
    if (argv[i] !== '--live' && (!argv[++i] || argv[i].startsWith('--'))) return { ok: false, reason: 'a file path is missing' };
  }
  const val = (n: string) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv[i + 1]; };
  if (val('--inventory') && !argv.includes('--live')) return { ok: false, reason: '--inventory needs --live' };
  return { ok: true, live: argv.includes('--live'), matrix: val('--matrix') ?? DEFAULT_MATRIX, inventory: val('--inventory') };
}

export const lineFor = (r: MatrixRow, problems: number): string => `${r.Key}  ${r.Assistant} | ${r.Direction} | owner ${r.Owner} | stage ${r.Stage} | ${r.Status} | evidence ${r.Evidence || 'none'}${problems ? ` | ${problems} problem(s)` : ''}`;

async function main(): Promise<number> {
  const a = parseReportArgs(process.argv.slice(2));
  if (!a.ok) { console.error(a.reason); return 2; }
  if (!fs.existsSync(a.matrix)) { console.error('matrix document not found; pass --matrix <file>'); return 2; }
  const m = parseMatrix(fs.readFileSync(a.matrix, 'utf8'));
  if (!m.ok) { console.error(m.reason); return 2; }
  const problems = checkMatrix(m.rows);
  for (const r of m.rows) console.log(lineFor(r, problems.filter((p) => p.key === r.Key).length));
  for (const p of problems) console.log(`PROBLEM ${p.key}: ${p.problem}`);
  let bad = problems.length > 0;
  if (a.live) {
    const key = process.env.SYNTHFLOW_API_KEY;
    if (!key) { console.error('SYNTHFLOW_API_KEY is not set'); return 2; }
    const { fetchAssistants, toRow } = await import('../../services/voice/migration/assistantInventory');
    const rows = (await fetchAssistants(key)).map((x) => toRow(x, process.env));
    const d = compareLive(m.rows, rows);
    for (const k of d.missing) console.log(`LIVE ${k}: exists at the vendor and has no row`);
    for (const k of d.gone) console.log(`LIVE ${k}: has a row and no longer exists at the vendor`);
    for (const k of d.renamed) console.log(`LIVE ${k}: renamed at the vendor`);
    console.log(`LIVE: ${rows.length} assistants at the vendor, ${m.rows.length} rows`);
    if (a.inventory) fs.writeFileSync(a.inventory, JSON.stringify(rows, null, 2), { mode: 0o600 });
    bad = bad || !d.ok;
  }
  console.log(bad ? 'MIGRATION MATRIX: PROBLEMS' : 'MIGRATION MATRIX: OK');
  return bad ? 1 : 0;
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_migration_report_failed', error_class: e.name || 'Error' })); process.exit(2); });
}
