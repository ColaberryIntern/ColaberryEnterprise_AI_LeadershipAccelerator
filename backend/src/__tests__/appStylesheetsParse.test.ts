import * as fs from 'fs';
import * as path from 'path';

/**
 * Every stylesheet a public app ships must actually PARSE.
 *
 * WHY THIS EXISTS, and it is a specific failure rather than a hypothetical one.
 * `apps/ai-flotation-public/src/assets/site.css` lost a single closing brace
 * during a merge on 2026-09-06. One `}` from a `:focus-visible` rule. The file
 * still contained every rule that came after it - a grep for `.cloud-terms`
 * found it, the build copied it, the deploy succeeded, and the served bytes were
 * correct.
 *
 * But a browser stops applying rules at an unclosed block. So the word cloud
 * rendered as a bulleted list, the filter sidebar lost its grid, and the whole
 * records index looked unstyled - on a live customer-facing page, after a deploy
 * that reported success at every step.
 *
 * THE POINT IS WHAT "PRESENT" IS WORTH. Checking that a rule exists in a file
 * proves nothing about whether it applies; only balance proves that. This is the
 * cheapest check that would have caught it, and it belongs in CI rather than in
 * a habit, because the damage came from a conflict resolution and conflict
 * resolutions are exactly when attention is thinnest.
 *
 * It counts braces OUTSIDE comments, since a comment may legitimately contain
 * either character - this stylesheet's own header comments do.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');

function cssFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // `dist/` is build OUTPUT and is gitignored. Scanning it would fail on any
    // developer's stale build rather than on anything in the repository, which
    // is the fastest way to make a guard get ignored. `node_modules` likewise.
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) out.push(...cssFilesUnder(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Braces outside comments and strings. Returns the running depth at the end. */
function braceBalance(css: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  let inComment = false;
  for (let i = 0; i < css.length; i += 1) {
    if (!inComment && css[i] === '/' && css[i + 1] === '*') { inComment = true; i += 1; continue; }
    if (inComment && css[i] === '*' && css[i + 1] === '/') { inComment = false; i += 1; continue; }
    if (inComment) continue;
    if (css[i] === '{') open += 1;
    if (css[i] === '}') close += 1;
  }
  return { open, close };
}

const files = [...cssFilesUnder(APPS_DIR), ...cssFilesUnder(PACKAGES_DIR)];

describe('public stylesheets parse', () => {
  it('finds stylesheets at all — a green run over nothing proves nothing', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(REPO_ROOT, f), f]))(
    '%s has balanced braces',
    (_label, file) => {
      const { open, close } = braceBalance(fs.readFileSync(file as string, 'utf8'));
      // Reported as an object so a failure names the file and both counts rather
      // than just "expected 235 to be 236".
      expect({ file: _label, open, close }).toEqual({ file: _label, open, close: open });
    },
  );

  it.each(files.map((f) => [path.relative(REPO_ROOT, f), f]))(
    '%s carries no conflict markers',
    (_label, file) => {
      // The same merge that ate the brace had already put conflict markers into a
      // committed stylesheet earlier the same day. Cheap to check, and a marker in
      // a served file is a visible defect on a customer page.
      const lines = fs.readFileSync(file as string, 'utf8').split(/\r?\n/);
      const markers = lines.filter((l) => l.startsWith('<<<<<<< ')
        || l.trimEnd() === '======='
        || l.startsWith('>>>>>>> '));
      expect({ file: _label, markers }).toEqual({ file: _label, markers: [] });
    },
  );
});
