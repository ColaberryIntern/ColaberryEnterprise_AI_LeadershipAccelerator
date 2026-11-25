/**
 * voice:migration:report (VS5.1). Read only: it reads the matrix document and, with --live, asks the vendor
 * API what assistants exist (GET only). It changes nothing and dials nothing.
 *
 *   npm run voice:migration:report                          check the matrix, one line per row
 *   npm run voice:migration:report -- --live                also compare it with Synthflow (needs SYNTHFLOW_API_KEY)
 *   npm run voice:migration:report -- --matrix <file>       another copy of the document
 *   ... --live --inventory <file>                           also write the short inventory (no prompts)
 *   ... --live --capture <file>                             also write the full private capture (prompts and settings, credentials redacted)
 *
 * The two files are private: they are created 0600 and refused inside the repository.
 *
 * Exit: 0 clean, 1 a row lacks something or the matrix and the vendor disagree, 2 refused or unreadable.
 */
import fs from 'fs';
import path from 'path';
import { checkMatrix, compareLive, parseMatrix, type MatrixRow } from '../../services/voice/migration/matrix';

export const DEFAULT_MATRIX = path.resolve(__dirname, '../../../../docs/voice-studio/MIGRATION_MATRIX.md');

const REPO = path.resolve(__dirname, '../../../..');
/** In a checkout, true for any path in it. (In the deployed container there is no checkout: only its own directory counts.) */
export function insideRepo(file: string, root: string = REPO): boolean {
  if (!fs.existsSync(path.join(root, '.git'))) return false;
  const rel = path.relative(root, path.resolve(file));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export type ReportArgs = { ok: true; live: boolean; matrix: string; inventory?: string; capture?: string } | { ok: false; reason: string };

export function parseReportArgs(argv: string[]): ReportArgs {
  const known = ['--live', '--matrix', '--inventory', '--capture'];
  for (let i = 0; i < argv.length; i++) {
    if (!known.includes(argv[i])) return { ok: false, reason: `unknown argument ${argv[i]}` };
    if (argv[i] !== '--live' && (!argv[++i] || argv[i].startsWith('--'))) return { ok: false, reason: 'a file path is missing' };
  }
  const val = (n: string) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv[i + 1]; };
  for (const f of ['--inventory', '--capture']) {
    const out = val(f);
    if (out && !argv.includes('--live')) return { ok: false, reason: `${f} needs --live` };
    if (out && insideRepo(out)) return { ok: false, reason: `${f} must be outside the repository (it is public)` };
  }
  return { ok: true, live: argv.includes('--live'), matrix: val('--matrix') ?? DEFAULT_MATRIX, inventory: val('--inventory'), capture: val('--capture') };
}

export const lineFor = (r: MatrixRow, problems: number): string => `${r.Key}  ${r.Assistant} | ${r.Direction} | owner ${r.Owner} | stage ${r.Stage} | ${r.Status} | evidence ${r.Evidence || 'none'}${problems ? ` | ${problems} problem(s)` : ''}`;

export async function run(argv: string[], env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<number> {
  const a = parseReportArgs(argv);
  if (!a.ok) { console.error(a.reason); return 2; }
  if (!fs.existsSync(a.matrix)) { console.error('matrix document not found; pass --matrix <file>'); return 2; }
  const m = parseMatrix(fs.readFileSync(a.matrix, 'utf8'));
  if (!m.ok) { console.error(m.reason); return 2; }
  const problems = checkMatrix(m.rows);
  for (const r of m.rows) console.log(lineFor(r, problems.filter((p) => p.key === r.Key).length));
  for (const p of problems) console.log(`PROBLEM ${p.key}: ${p.problem}`);
  let bad = problems.length > 0;
  if (a.live) {
    const key = env.SYNTHFLOW_API_KEY;
    if (!key) { console.error('SYNTHFLOW_API_KEY is not set'); return 2; }
    const { fetchAssistants, toRow } = await import('../../services/voice/migration/assistantInventory');
    const rows = (await fetchAssistants(key, fetchImpl)).map((x) => toRow(x, env));
    const d = compareLive(m.rows, rows);
    for (const k of d.missing) console.log(`LIVE ${k}: exists at the vendor and has no row`);
    for (const k of d.gone) console.log(`LIVE ${k}: has a row and no longer exists at the vendor`);
    for (const k of d.renamed) console.log(`LIVE ${k}: renamed at the vendor`);
    console.log(`LIVE: ${rows.length} assistants at the vendor, ${m.rows.length} rows`);
    if (a.inventory) fs.writeFileSync(a.inventory, JSON.stringify(rows, null, 2), { mode: 0o600 });
    if (a.capture) {
      const { captureAll } = await import('../../services/voice/migration/privateCapture');
      const c = await captureAll(key, fetchImpl);
      fs.writeFileSync(a.capture, JSON.stringify(c, null, 2), { mode: 0o600 });
      console.log(`CAPTURE: ${JSON.stringify(c.counts)}`); // counts only
      const short = c.counts.actionsDeclared - c.counts.actions;
      if (short) { console.log(`CAPTURE GAP: the vendor declares ${c.counts.actionsDeclared} actions and lists ${c.counts.actions}; find the other ${short} by hand (checklist step 3)`); bad = true; }
    }
    bad = bad || !d.ok;
  }
  console.log(bad ? 'MIGRATION MATRIX: PROBLEMS' : 'MIGRATION MATRIX: OK');
  return bad ? 1 : 0;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_migration_report_failed', error_class: e.name || 'Error' })); process.exit(2); });
}
