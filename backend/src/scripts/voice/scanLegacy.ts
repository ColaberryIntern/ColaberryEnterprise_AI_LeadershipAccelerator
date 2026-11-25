/**
 * voice:scan-legacy (VS5.4): does anything in this repository still depend on Synthflow? Read only.
 *
 *   npm run voice:scan-legacy [-- --json]
 *
 * Exit: 0 nothing operational is left, 1 something is (listed by file), 2 refused or not a repository.
 * Until the sunset release this exits 1 by design: it measures the distance. Rules: services/voice/migration/legacyScan.ts.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isScanned, scanAll, type Hit } from '../../services/voice/migration/legacyScan';

const ROOT = path.resolve(__dirname, '../../../..');

export function byFile(hits: readonly Hit[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const h of hits) m.set(h.file, (m.get(h.file) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.some((a) => a !== '--json')) { console.error('usage: voice:scan-legacy [-- --json]'); return 2; }
  let listed: string[];
  try {
    listed = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
  } catch (e) {
    console.error(`not a git repository: ${(e as Error).name}`);
    return 2;
  }
  const files = listed.filter((p) => isScanned(p) && fs.existsSync(path.join(ROOT, p))).map((p) => ({ path: p, text: fs.readFileSync(path.join(ROOT, p), 'utf8') }));
  const r = scanAll(files);
  if (argv.includes('--json')) console.log(JSON.stringify(r));
  else {
    for (const [f, n] of byFile(r.operational)) console.log(`${String(n).padStart(4)}  ${f}`);
    for (const [f, n] of byFile(r.tooling)) console.log(`${String(n).padStart(4)}  ${f} (migration tool)`);
    for (const [f, n] of byFile(r.archival)) console.log(`${String(n).padStart(4)}  ${f} (archival)`);
    for (const h of r.badMarks) console.log(`BAD MARK ${h.file}:${h.line} (no reason given, or it cannot be excused)`);
    console.log(`scanned ${r.filesScanned} files: ${r.operational.length} operational (${Object.entries(r.byKind).map(([k, n]) => `${k} ${n}`).join(', ')}), ${r.tooling.length} in migration tools, ${r.archival.length} archival`);
    console.log(r.clean ? 'SYNTHFLOW: no operational reference' : 'SYNTHFLOW: still referenced');
  }
  return r.clean ? 0 : 1;
}

if (require.main === module) process.exit(main());
