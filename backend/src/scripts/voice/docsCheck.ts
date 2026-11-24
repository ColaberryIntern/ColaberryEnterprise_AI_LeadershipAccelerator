/**
 * voice:docs-check - every vendor price or fact row in the Voice Studio docs must cite an official
 * https URL and a YYYY-MM-DD read date (VS1.2).
 *
 * The directive requires that no price, model ID or protocol fact is used without a dated official
 * source. This turns that rule into a check: it reads the markdown tables in COST_MODEL.md (section
 * "Vendor prices") and DECISIONS.md (section "Vendor facts") and fails on any row missing either.
 *
 * Run: npm run voice:docs-check     Exit: 0 every row cited · 1 a row is missing a URL or date · 2 file missing
 */
import * as fs from 'fs';
import * as path from 'path';

export interface DocsCheckProblem { file: string; line: number; reason: string; row: string }

const URL_RE = /https:\/\/[^\s|)]+/;
const DATE_RE = /\b20\d{2}-\d{2}-\d{2}\b/;

/** Pure: check the table rows that sit under `## <heading>` until the next `## `. */
export function checkVendorTable(file: string, markdown: string, heading: string): DocsCheckProblem[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return [{ file, line: 0, reason: `section "## ${heading}" not found`, row: '' }];
  const problems: DocsCheckProblem[] = [];
  let rows = 0;
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const l = lines[i].trim();
    if (!l.startsWith('|') || /^\|\s*-/.test(l)) continue; // not a row, or the separator
    rows += 1;
    if (rows === 1) continue; // header row
    if (!URL_RE.test(l)) problems.push({ file, line: i + 1, reason: 'no https URL', row: l.slice(0, 80) });
    if (!DATE_RE.test(l)) problems.push({ file, line: i + 1, reason: 'no YYYY-MM-DD read date', row: l.slice(0, 80) });
  }
  if (rows < 2) problems.push({ file, line: start + 1, reason: 'section has no data rows', row: '' });
  return problems;
}

const TARGETS: Array<[string, string]> = [['COST_MODEL.md', 'Vendor prices'], ['DECISIONS.md', 'Vendor facts']];

function main() {
  const dir = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'voice-studio');
  const problems: DocsCheckProblem[] = [];
  for (const [f, h] of TARGETS) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      console.error(JSON.stringify({ event: 'voice_docs_check', outcome: 'failure', error_class: 'FileMissing', file: f }));
      process.exit(2);
    }
    problems.push(...checkVendorTable(f, fs.readFileSync(p, 'utf8'), h));
  }
  if (problems.length) {
    console.error(JSON.stringify({ event: 'voice_docs_check', outcome: 'failure', error_class: 'UncitedVendorFact', problems }));
    process.exit(1);
  }
  console.log(JSON.stringify({ event: 'voice_docs_check', outcome: 'success', files: TARGETS.map((t) => t[0]) }));
}

if (require.main === module) main();
