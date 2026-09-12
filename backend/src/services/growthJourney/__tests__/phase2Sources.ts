import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared by the Phase 2 guard tests. NOT a `.test.ts` file on purpose: jest's
 * testMatch only collects files ending in `.test.ts` under a tests dir, so importing a helper from a test
 * file re-registered that file's suites in the importer (the verifier of T223
 * counted 13 tests where 7 were written). A plain `.ts` under `__tests__` is
 * importable without being collected.
 */

const ROOT = path.join(__dirname, '..', '..', '..'); // backend/src
const SCAN_DIRS = [
  path.join(ROOT, 'services', 'growthJourney'),
  path.join(ROOT, 'services', 'routing'),
];

/** Every .ts source under the scanned dirs, excluding tests and fixtures. */
export function phase2SourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'fixtures') continue;
        walk(p);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        out.push(p);
      }
    }
  };
  for (const d of SCAN_DIRS) walk(d);
  return out;
}

/** Module specifiers a file imports or requires. */
export function importsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^[ \t]*(?:import|export)[^;]*?\sfrom[ \t]*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^[ \t]*import[ \t]+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/(?:require|import)[ \t]*\([ \t]*['"]([^'"]+)['"][ \t]*\)/g)) out.push(m[1]);
  return out;
}

