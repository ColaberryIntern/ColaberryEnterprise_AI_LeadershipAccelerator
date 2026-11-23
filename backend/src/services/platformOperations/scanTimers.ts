/**
 * Find every scheduled-timer call site in the backend source.
 *
 * Pure and deterministic: given the same files it returns the same array, in the same order,
 * with no timestamps and no commit ids. That is deliberate — the result is committed, and a
 * test re-runs this against the working tree and compares. A scan that embedded "generated
 * at" would churn on every run and the drift guard would be worthless.
 *
 * This parses with the TypeScript compiler rather than matching text, and the reason is
 * worth keeping. The first version was a regex scan, and it reported two timers that did not
 * exist: the prose in this very file, which names the calls it looks for while explaining
 * itself. Blanking comments fixed those two and introduced a third failure — a regex literal
 * holding a quote character put the string tracker into a false state and hid a real line.
 * A scanner that miscounts its own source cannot be trusted to count the server's. The
 * compiler already knows what is code, what is a comment, and what is a string, so it does
 * the reading.
 *
 * `typescript` is a devDependency, so nothing in the running server may import this file.
 * Production reads the generated `data/platformOperations/timerScan.ts` instead.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { TimerKind, TimerScan, TimerSite } from './timerScanTypes';

/** Directories we never scan: generated output, dependencies, and the tests themselves. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '__mocks__', '.git']);

/** A test file schedules nothing in production, and scanning them creates false findings. */
function isScannable(file: string): boolean {
  if (!file.endsWith('.ts') && !file.endsWith('.js')) return false;
  if (file.endsWith('.d.ts')) return false;
  return !/\.(test|spec)\.[jt]s$/.test(file);
}

function walk(dir: string, out: string[]): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // an unreadable directory is not a timer; skip it rather than fail the scan
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, out);
    } else if (e.isFile() && isScannable(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** `cron.schedule(...)` — any member call named `schedule` on something called `cron`. */
function cronScheduleKind(call: ts.CallExpression): TimerKind | null {
  const fn = call.expression;
  if (ts.isIdentifier(fn) && fn.text === 'setInterval') return 'interval';
  if (ts.isPropertyAccessExpression(fn)) {
    if (fn.name.text === 'setInterval') return 'interval';
    if (fn.name.text === 'schedule' && ts.isIdentifier(fn.expression) && fn.expression.text === 'cron') {
      return 'cron';
    }
  }
  return null;
}

/** The literal value of an argument, or null when it is any expression we refuse to guess at. */
function literalArg(arg: ts.Expression | undefined): string | null {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return null;
}

/** The name this call body reports under, from an `instrumentCronJob('Name', …)` inside it. */
function reportedName(call: ts.CallExpression): string | null {
  let found: string | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const fn = node.expression;
      const isInstrument = (ts.isIdentifier(fn) && fn.text === 'instrumentCronJob')
        || (ts.isPropertyAccessExpression(fn) && fn.name.text === 'instrumentCronJob');
      if (isInstrument) {
        const name = literalArg(node.arguments[0]);
        if (name) { found = name; return; }
      }
    }
    ts.forEachChild(node, visit);
  };
  call.arguments.forEach((a) => visit(a));
  return found;
}

/** Scan one file's text. Exported so a test can exercise it without touching the disk. */
export function scanSource(repoRelativeFile: string, source: string): TimerSite[] {
  const sf = ts.createSourceFile(repoRelativeFile, source, ts.ScriptTarget.Latest, true);
  const sites: TimerSite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const kind = cronScheduleKind(node);
      if (kind) {
        let schedule = literalArg(node.arguments[0]);
        if (schedule === null && kind === 'interval') {
          // setInterval(fn, 60000) puts the delay second. A computed delay stays null.
          const delay = node.arguments[1];
          if (delay && ts.isNumericLiteral(delay)) schedule = `${delay.text} ms`;
        }
        sites.push({
          file: repoRelativeFile,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          kind,
          schedule,
          reportsAs: reportedName(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  sites.sort((a, b) => a.line - b.line);
  return sites;
}

/**
 * Scan a source root. `repoRoot` is the directory the reported paths are relative to, so the
 * committed scan reads `backend/src/server.ts` rather than someone's absolute path.
 */
export function scanTimers(sourceRoot: string, repoRoot: string): TimerScan {
  const files = walk(sourceRoot, []).sort();
  const sites: TimerSite[] = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    sites.push(...scanSource(rel, fs.readFileSync(file, 'utf8')));
  }
  sites.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return { sites };
}
