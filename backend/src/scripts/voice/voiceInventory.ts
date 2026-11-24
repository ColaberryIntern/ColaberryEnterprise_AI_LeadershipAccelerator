/**
 * voice:inventory - list every non-test file that touches AI voice calls and classify its role (VS1.1).
 *
 * Read-only. Walks `git ls-files` (so untracked scratch never counts), keeps files that match the
 * voice search set, classifies each with voiceInventoryClassifier, and writes
 * docs/voice-studio/inventory.generated.json. `--check` regenerates in memory and exits 1 if the
 * committed snapshot differs, which is how a newly added caller gets noticed before it bypasses
 * the gateway. Output is sorted, so two runs over the same tree are byte-identical.
 *
 * Run: npx ts-node src/scripts/voice/voiceInventory.ts [--check]   (from backend/)
 *   or: npm run voice:inventory -- --check
 *
 * Exit: 0 ok · 1 snapshot drift (--check) · 2 could not run (not a git tree).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { VOICE_SEARCH, classifyVoiceFile, sortInventory, summarize } from './voiceInventoryClassifier';

const SCOPE = /^(backend\/src|frontend\/src|scripts|nginx)\/|^docker-compose[^/]*\.yml$|^\.github\//;
const EXCLUDE = /__tests__\/|\.test\.|\.spec\.|\.md$|^scripts\/artifacts\/tickets\/vs/;

function repoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

export function buildInventory(root: string) {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter((f) => f && SCOPE.test(f) && !EXCLUDE.test(f));
  const rows = [];
  for (const f of files) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(root, f), 'utf8');
    } catch (err) {
      // A file listed by git but unreadable (e.g. a OneDrive placeholder) is reported, not skipped silently.
      console.error(JSON.stringify({ event: 'voice_inventory_unreadable', error_class: 'FileReadError', path: f, message: (err as Error).message }));
      continue;
    }
    if (VOICE_SEARCH.test(content)) rows.push(classifyVoiceFile(f, content));
  }
  const sorted = sortInventory(rows);
  return { generatedFrom: 'git ls-files', total: sorted.length, byRole: summarize(sorted), rows: sorted };
}

function main() {
  let root: string;
  try {
    root = repoRoot();
  } catch {
    console.error(JSON.stringify({ event: 'voice_inventory_refused', error_class: 'NotAGitTree' }));
    process.exit(2);
  }
  const out = path.join(root, 'docs', 'voice-studio', 'inventory.generated.json');
  const next = JSON.stringify(buildInventory(root), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
    if (prev !== next) {
      console.error(JSON.stringify({ event: 'voice_inventory_drift', outcome: 'failure', hint: 'run npm run voice:inventory and review the diff in INVENTORY.md' }));
      process.exit(1);
    }
    console.log(JSON.stringify({ event: 'voice_inventory_check', outcome: 'success' }));
    return;
  }
  fs.writeFileSync(out, next);
  const inv = JSON.parse(next);
  console.log(JSON.stringify({ event: 'voice_inventory_written', outcome: 'success', total: inv.total, byRole: inv.byRole, path: path.relative(root, out) }));
}

if (require.main === module) main();
