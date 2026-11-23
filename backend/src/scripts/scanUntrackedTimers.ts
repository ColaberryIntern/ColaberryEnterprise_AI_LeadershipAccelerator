/**
 * Regenerate `backend/src/data/platformOperations/timerScan.ts` from the backend source.
 *
 *   npx ts-node backend/src/scripts/scanUntrackedTimers.ts
 *   npx ts-node backend/src/scripts/scanUntrackedTimers.ts --check   # exit 1 if stale
 *
 * One responsibility: write the scan. It talks to no database, sends nothing, and is safe to
 * run any number of times — the output is a pure function of the source, so a second run on
 * unchanged source rewrites the same bytes.
 *
 * `--check` is what CI and the test suite use: it compares without writing, so a pull request
 * that adds a timer and forgets to regenerate is caught instead of silently shipping a scan
 * that no longer describes the code.
 */
import fs from 'fs';
import path from 'path';
import { scanTimers } from '../services/platformOperations/scanTimers';
import { TimerScan } from '../services/platformOperations/timerScanTypes';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');            // backend/
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');                  // repo root
const SOURCE_ROOT = path.join(BACKEND_ROOT, 'src');
const OUT_FILE = path.join(SOURCE_ROOT, 'data', 'platformOperations', 'timerScan.ts');

const HEADER = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Every scheduled-timer call site in backend/src, found by a lexical scan of the source.
 * Regenerate with:  npx ts-node backend/src/scripts/scanUntrackedTimers.ts
 *
 * This is the only record of what is actually wired to a clock in this repo. \`ai_agents\`
 * says what someone wrote down; \`ai_agent_activity_logs\` says what reported itself. A site
 * below whose \`reportsAs\` is null can appear in neither, and fires unwatched.
 */
import { TimerScan } from '../../services/platformOperations/timerScanTypes';

export const TIMER_SCAN: TimerScan = `;

/** Stable, readable serialization. JSON.stringify is deterministic for this shape. */
export function render(scan: TimerScan): string {
  const lines = scan.sites.map(
    (s) => `  { file: ${JSON.stringify(s.file)}, line: ${s.line}, kind: ${JSON.stringify(s.kind)}, `
      + `schedule: ${JSON.stringify(s.schedule)}, reportsAs: ${JSON.stringify(s.reportsAs)} },`,
  );
  return `${HEADER}{\n  sites: [\n${lines.join('\n')}\n  ],\n};\n`;
}

function main(): void {
  const check = process.argv.includes('--check');
  const scan = scanTimers(SOURCE_ROOT, REPO_ROOT);
  const next = render(scan);

  const named = scan.sites.filter((s) => s.reportsAs).length;
  const anonymous = scan.sites.length - named;
  const summary = `${scan.sites.length} timer call sites: ${named} report a name, ${anonymous} do not`;

  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
  if (check) {
    if (current === next) {
      console.log(`timer scan is current — ${summary}`);
      return;
    }
    console.error(
      'timer scan is STALE. The source has timers the committed scan does not describe.\n'
      + 'Run: npx ts-node backend/src/scripts/scanUntrackedTimers.ts',
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, next);
  console.log(`${current === next ? 'unchanged' : 'rewrote'} ${path.relative(REPO_ROOT, OUT_FILE)} — ${summary}`);
}

if (require.main === module) main();
