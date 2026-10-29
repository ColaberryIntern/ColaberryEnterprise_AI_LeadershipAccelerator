import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * Proves the published `kb.json` still agrees with the six source files it is built from.
 *
 * WHY THIS IS NEEDED NOW. `build-kb.js` is run by hand - its own header says "Run from
 * the hub root: node build-kb.js" - and nothing in CI invokes it. Its comment claims it
 * "keeps the machine-readable export in sync with its sources so it never silently
 * drifts", but that is a statement of intent, not a guarantee, because a source edit
 * followed by a forgotten rebuild leaves the export stale and everything still green.
 *
 * That now matters more than it used to: the backend reads `confidence` out of the
 * export, and `explorerKnowledgeSource.test.ts` pins the distribution. Those pins read
 * the EXPORT, so a stale export keeps them passing while the real library has moved.
 * This test is the thing that would notice.
 *
 * It compares the source `confidence` values and question text rather than re-running
 * the whole build, because reimplementing `build-kb.js` inside its own test would just
 * create a second thing to keep in sync.
 *
 * The sources are browser globals (`window.KB_DATA` and friends), so they are read by a
 * SEPARATE node process rather than `require`d here - that keeps the test independent of
 * how jest is configured to transform stray `.js` files outside `src/`.
 */

const HUB = path.resolve(__dirname, '../../../../../frontend/public/knowledge');
const KB_JSON = path.join(HUB, 'kb.json');

/** `[domain, globalName, file]`, in the exact order `build-kb.js` concatenates them. */
const SOURCES: ReadonlyArray<readonly [string, string, string]> = [
  ['sales', 'KB_DATA', 'sales/kb-data.js'],
  ['marketing', 'HUB_DATA', 'marketing/hub-data.js'],
  ['design', 'DESIGN_DATA', 'data/design-kb.js'],
  ['curriculum', 'CURRICULUM_DATA', 'data/curriculum-kb.js'],
  ['product', 'PRODUCT_DATA', 'data/product-kb.js'],
  ['compliance', 'COMPLIANCE_DATA', 'data/compliance-kb.js'],
];

interface SourceEntry {
  domain: string;
  question: string;
  confidence: string;
}

/** Runs the six source files in a plain node process and returns their flattened qa list. */
function readSourceEntries(): SourceEntry[] {
  const script = `
    const path = require('path');
    global.window = {};
    const SOURCES = ${JSON.stringify(SOURCES)};
    const out = [];
    for (const [domain, globalName, file] of SOURCES) {
      require(path.resolve(process.argv[1], file));
      const data = global.window[globalName];
      for (const x of (data && data.qa) || []) {
        out.push({ domain, question: x.q, confidence: x.confidence || 'unstated' });
      }
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const raw = execFileSync(process.execPath, ['-e', script, HUB], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(raw) as SourceEntry[];
}

describe('kb.json is still in step with the sources it is generated from', () => {
  const exported = JSON.parse(fs.readFileSync(KB_JSON, 'utf8')) as {
    count: number;
    entries: Array<{ id: string; domain: string; question: string; confidence: string }>;
  };

  it('reads a non-empty source set — otherwise every check below is vacuous', () => {
    const source = readSourceEntries();
    expect(source.length).toBeGreaterThan(200);
    expect(new Set(source.map((e) => e.domain)).size).toBe(SOURCES.length);
  });

  it('carries exactly as many entries as the sources do', () => {
    const source = readSourceEntries();
    expect(exported.entries).toHaveLength(source.length);
    expect(exported.count).toBe(source.length);
  });

  it('agrees with the sources entry by entry, on question text and confidence', () => {
    const source = readSourceEntries();

    // Reported as one diff rather than failing on the first mismatch: a stale export is
    // usually stale in several places, and seeing one of them sends you round again.
    const mismatches: string[] = [];
    source.forEach((src, i) => {
      const got = exported.entries[i];
      if (!got) {
        mismatches.push(`[${i}] missing from kb.json (source: ${src.domain} "${src.question}")`);
        return;
      }
      if (got.domain !== src.domain) {
        mismatches.push(`[${i}] domain ${got.domain} != ${src.domain}`);
      }
      if (got.question !== src.question) {
        mismatches.push(`[${i}] ${got.id} question differs from source`);
      }
      if (got.confidence !== src.confidence) {
        mismatches.push(
          `[${i}] ${got.id} confidence "${got.confidence}" != source "${src.confidence}"`,
        );
      }
    });

    expect({
      mismatches,
      hint:
        mismatches.length > 0
          ? 'kb.json is stale. Run `node build-kb.js` from frontend/public/knowledge and commit the result.'
          : 'in step',
    }).toEqual({ mismatches: [], hint: 'in step' });
  });

  it('assigns ids positionally, which is why nothing downstream cites them', () => {
    // Documents the fragility rather than relying on it: ids are domain + 1-based index,
    // so inserting one entry renumbers every later entry in that domain.
    const perDomain = new Map<string, number>();
    for (const e of exported.entries) {
      const n = (perDomain.get(e.domain) ?? 0) + 1;
      perDomain.set(e.domain, n);
      expect(e.id).toBe(`${e.domain}-${n}`);
    }
    expect(perDomain.size).toBe(SOURCES.length);
  });
});
