/**
 * Sync Cora knowledge base Q&A from Google Sheets.
 *
 * Reads rows from the KB spreadsheet, filters by Sub Category, and writes
 * backend/src/services/inbox/coraKnowledgeBaseQA.ts so the generative
 * Cora agent always uses the latest approved answers without a code deploy.
 *
 * Usage:
 *   npx ts-node src/scripts/syncCoraKbFromSheets.ts               # sync + write
 *   npx ts-node src/scripts/syncCoraKbFromSheets.ts --dry         # preview, no write
 *   npx ts-node src/scripts/syncCoraKbFromSheets.ts --list-cats   # list all sub-categories in the Sheet
 *
 * Required env vars:
 *   GOOGLE_APPLICATION_CREDENTIALS   Path to the service-account JSON key file.
 *                                    Example: ./credentials/micro-environs-434113-p8-57a426b26077.json
 *
 * Optional env vars:
 *   CORA_KB_SPREADSHEET_ID     defaults to the live KB sheet
 *   CORA_KB_SHEET_NAME         tab name, defaults to Sheet1
 *   CORA_KB_SUB_CATEGORIES     comma-separated allowlist of Sub Category values to include.
 *                               If unset, ALL rows with non-empty Q and A are included.
 *                               Example: "AI Build Accelerator,Accelerator Admissions"
 */

import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const SPREADSHEET_ID =
  process.env.CORA_KB_SPREADSHEET_ID ||
  '1C69lDig4CoCnqqlAe_8_75eEg8PiPOaBAgjUWp9Yz_A';

const SHEET_NAME = process.env.CORA_KB_SHEET_NAME || 'Rubric';

// Column indices (0-based) matching the Sheet layout:
// A=0 Main Category | B=1 Main Category Qualifier | C=2 Sub Category | D=3 Full Category
// E=4 Question      | F=5 Answer
const COL_SUB_CATEGORY = 2;
const COL_QUESTION     = 4;
const COL_ANSWER       = 5;

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../services/inbox/coraKnowledgeBaseQA.ts'
);

const DRY_RUN    = process.argv.includes('--dry');
const LIST_CATS  = process.argv.includes('--list-cats');

// Parse the allowlist. Trim whitespace, lower-case for comparison.
const RAW_ALLOWLIST = process.env.CORA_KB_SUB_CATEGORIES ?? '';
const ALLOWED_CATS: Set<string> = RAW_ALLOWLIST
  ? new Set(RAW_ALLOWLIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  : new Set();

interface QAPair { q: string; a: string; }

function escapeBacktick(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function buildFileContent(pairs: QAPair[], syncedAt: string, filteredBy: string): string {
  const filterNote = filteredBy
    ? `// Sub-category filter applied: ${filteredBy}`
    : '// No sub-category filter — all rows with Q+A included';

  const entries = pairs
    .map(({ q, a }) => `  {\n    q: \`${escapeBacktick(q)}\`,\n    a: \`${escapeBacktick(a)}\`,\n  }`)
    .join(',\n');

  return `/**
 * AUTO-GENERATED — do not edit manually.
 *
 * Source: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}
 * Regenerate: npx ts-node src/scripts/syncCoraKbFromSheets.ts
 * Last synced: ${syncedAt}
 ${filterNote}
 */

export const CORA_QA: Array<{ q: string; a: string }> = [
${entries},
];
`;
}

async function main(): Promise<void> {
  const rawKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!rawKeyFile) {
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.');
    console.error('  Set it to the path of your service-account JSON key file, e.g.:');
    console.error('  GOOGLE_APPLICATION_CREDENTIALS=./credentials/micro-environs-434113-p8-57a426b26077.json');
    process.exit(1);
  }

  // Resolve relative paths from the repo root (3 dirs up from backend/src/scripts/)
  // so the script works regardless of which directory it is run from.
  const keyFile = path.isAbsolute(rawKeyFile)
    ? rawKeyFile
    : path.resolve(__dirname, '../../../', rawKeyFile);

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`Fetching "${SHEET_NAME}" from spreadsheet ${SPREADSHEET_ID}...`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:F`,
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) {
    console.error('ERROR: Sheet returned fewer than 2 rows (empty or header-only).');
    process.exit(1);
  }

  // --list-cats: print every unique Sub Category value and exit
  if (LIST_CATS) {
    const cats = new Map<string, number>();
    for (let i = 1; i < rows.length; i++) {
      const cat = (rows[i][COL_SUB_CATEGORY] ?? '').toString().trim();
      if (cat) cats.set(cat, (cats.get(cat) ?? 0) + 1);
    }
    const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\nSub categories found in "${SHEET_NAME}" (${sorted.length} unique):\n`);
    for (const [cat, count] of sorted) {
      console.log(`  ${count.toString().padStart(3)}  ${cat}`);
    }
    console.log('\nSet CORA_KB_SUB_CATEGORIES in .env to filter, e.g.:');
    console.log('  CORA_KB_SUB_CATEGORIES="Category One,Category Two"');
    return;
  }

  // Filter rows
  const pairs: QAPair[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const subCat = (row[COL_SUB_CATEGORY] ?? '').toString().trim();
    const q      = (row[COL_QUESTION]     ?? '').toString().trim();
    const a      = (row[COL_ANSWER]       ?? '').toString().trim();

    if (!q || !a) continue; // skip rows with missing Q or A

    if (ALLOWED_CATS.size > 0 && !ALLOWED_CATS.has(subCat.toLowerCase())) {
      skipped++;
      continue;
    }

    pairs.push({ q, a });
  }

  if (ALLOWED_CATS.size > 0) {
    console.log(`Sub-category filter: ${[...ALLOWED_CATS].join(', ')}`);
    console.log(`Matched: ${pairs.length} rows | Skipped (other categories): ${skipped}`);
  } else {
    console.log(`No filter — including all rows with Q+A: ${pairs.length} rows`);
  }

  if (pairs.length === 0) {
    console.error(
      'ERROR: 0 rows matched. Run with --list-cats to see available sub-categories, ' +
      'then set CORA_KB_SUB_CATEGORIES in .env.'
    );
    process.exit(1);
  }

  const syncedAt     = new Date().toISOString();
  const filteredBy   = RAW_ALLOWLIST.trim();
  const content      = buildFileContent(pairs, syncedAt, filteredBy);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would write ${pairs.length} Q&A pairs to:\n  ${OUTPUT_PATH}\n`);
    console.log('─'.repeat(72));
    console.log(content);
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, content, 'utf8');
  console.log(`\n✓ Wrote ${pairs.length} Q&A pairs to:`);
  console.log(`  ${OUTPUT_PATH}`);
  console.log(`  Synced at: ${syncedAt}`);
  console.log('\nNext steps:');
  console.log('  1. npx tsc --noEmit   (confirm no type errors)');
  console.log('  2. Review the diff in coraKnowledgeBaseQA.ts');
  console.log('  3. git add + commit + deploy');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
