import * as fs from 'fs';
import * as path from 'path';
import {
  EXCLUSION_REASONS,
  FREE_WORD_RULE,
  rawMatchCount,
  scanSource,
  type Occurrence,
} from '../bannedCopyScanner';
import {
  BASELINE_SCOPE,
  FRONTEND_COPY_BASELINE,
  FRONTEND_COPY_BASELINE_TOTAL,
  isInScope,
} from '../frontendCopyBaseline';

/**
 * The banned-word copy lint for the React source, as a shrink-only ratchet.
 *
 * WHY THIS IS A TEST AND NOT A SCRIPT. It has to RUN. `backend/jest.ci.config.ts` is an
 * ignore-list, so a suite written here is enforced the moment it exists; a new script would
 * need a new step in `.github/workflows/ci.yml`, which is not this component's file to edit,
 * and an unrun lint is worth less than no lint because of the tick it earns.
 *
 * WHY IT LIVES IN THE BACKEND SUITE. `backend/tsconfig.json` excludes `**\/__tests__\/**`, so
 * nothing in here is typechecked by CI - which is the reason the load-bearing logic is in
 * `bannedCopyScanner.ts` and `frontendCopyBaseline.ts`, under `src/services/content/`, where
 * `tsc --noEmit` does see it. This file is the harness: walk, compare, report.
 *
 * THE FOUR WAYS THIS FAILS, which is the whole design:
 *   1. a file not in the baseline has a violation        - a NEW violation
 *   2. a baseline file has MORE violations than recorded - a new violation in an old file
 *   3. a baseline file has FEWER                         - fix the baseline, the ratchet turns
 *   4. the scanner cannot classify an occurrence         - the scanner is wrong; never a pass
 *
 * AND THE WAY IT MUST NOT FAIL: silently reading nothing. A path that resolves to an empty
 * directory would make every assertion trivially true, so the file count is asserted against a
 * floor before any of the rest is believed. That failure is not hypothetical - the Explorer
 * copy lint's first draft scanned 1 value instead of 77 and reported clean.
 */

/** `__tests__` -> content -> services -> src -> backend -> repo root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function relative(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

/** Every file under `dir`, filtered by the one scope authority and nothing else. */
function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (isInScope(relative(full))) out.push(full);
  }
  return out;
}

/** Does this source IMPORT the scanner (any specifier ending in `bannedCopyScanner`)? */
function importsScanner(source: string): boolean {
  return /(?:from|require\s*\()\s*['"][^'"]*bannedCopyScanner(?:\.[jt]s)?['"]/.test(source);
}

interface Measured {
  files: string[];
  /** Only files with at least one copy violation. */
  violationsByFile: Map<string, Occurrence[]>;
  reasonCounts: Record<string, number>;
  totalRaw: number;
  totalClassified: number;
  unclassified: Array<{ file: string; occurrence: Occurrence }>;
  /** Files where the parser saw a different number of occurrences than the raw regex did. */
  countMismatches: string[];
}

function measure(): Measured {
  const files: string[] = [];
  for (const root of BASELINE_SCOPE.roots) {
    const abs = path.join(REPO_ROOT, root);
    // A missing root is a resolution bug, and a resolution bug must not read as "clean".
    if (!fs.existsSync(abs)) throw new Error(`Scope root does not exist: ${abs}`);
    walk(abs, files);
  }
  files.sort();

  const violationsByFile = new Map<string, Occurrence[]>();
  const reasonCounts: Record<string, number> = {};
  const unclassified: Array<{ file: string; occurrence: Occurrence }> = [];
  const countMismatches: string[] = [];
  let totalRaw = 0;
  let totalClassified = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const raw = rawMatchCount(source, FREE_WORD_RULE);
    totalRaw += raw;
    if (raw === 0) continue;

    const rel = relative(file);
    const result = scanSource(rel, source, FREE_WORD_RULE);
    totalClassified += result.occurrences.length;
    if (result.occurrences.length !== raw) countMismatches.push(`${rel}: parser ${result.occurrences.length} vs raw ${raw}`);
    for (const o of result.occurrences) {
      const key = o.excluded ?? 'copy';
      reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
    }
    for (const o of result.unclassified) unclassified.push({ file: rel, occurrence: o });
    if (result.violations.length > 0) violationsByFile.set(rel, result.violations);
  }

  return { files, violationsByFile, reasonCounts, totalRaw, totalClassified, unclassified, countMismatches };
}

// One walk for the whole suite: the scan is the slow part and nothing here mutates it.
const measured = measure();

describe('frontend copy lint: the word "free" (40 TAC 807.172(d))', () => {
  jest.setTimeout(120_000);

  it('actually reads the React source', () => {
    // The floor, not the exact count: files are added and removed constantly, and a lint that
    // fails because somebody wrote a new page is a lint that gets deleted. What is being
    // guarded is the difference between "scanned a thousand files" and "scanned nothing".
    expect(measured.files.length).toBeGreaterThan(800);
    expect(measured.totalRaw).toBeGreaterThan(100);
    // And the roots are both real, not just the first one.
    for (const root of BASELINE_SCOPE.roots) {
      expect(measured.files.some((f) => relative(f).startsWith(root))).toBe(true);
    }
  });

  it('every scope rule excludes something, including the one the tree does not exercise', () => {
    // Each assertion here is reachable by exactly ONE rule, so breaking any rule fails this
    // test by name. Checking scope against the tree instead would have missed the directory
    // rule entirely: no frontend `__tests__` file today lacks a `.test.` suffix, so emptying
    // `excludeDirectories` changed nothing and the suite stayed green.
    expect(isInScope('frontend/src/pages/HomePage.tsx')).toBe(true);
    expect(isInScope('frontend/src/components/publicV2/HeroV8.tsx')).toBe(true);
    expect(isInScope('frontend/src/pages/portal/points/levelJourneyIndex.ts')).toBe(true);
    // Directory rule, and only the directory rule.
    expect(isInScope('frontend/src/pages/__tests__/helpers.ts')).toBe(false);
    expect(isInScope('frontend/src/components/__tests__/testEnv/render.tsx')).toBe(false);
    // File-name rule, and only that.
    expect(isInScope('frontend/src/pages/HomePage.test.tsx')).toBe(false);
    expect(isInScope('frontend/src/pages/HomePage.spec.ts')).toBe(false);
    expect(isInScope('frontend/src/pages/types.d.ts')).toBe(false);
    // Extension rule.
    expect(isInScope('frontend/src/pages/PricingPage.css')).toBe(false);
    expect(isInScope('frontend/src/pages/portal/projects/salonData.json')).toBe(false);
    // Root rule. These are real directories that are NOT claimed by the baseline.
    expect(isInScope('frontend/src/services/api.ts')).toBe(false);
    expect(isInScope('frontend/src/contexts/AuthContext.tsx')).toBe(false);
    expect(isInScope('backend/src/services/content/brandGovernanceSeed.ts')).toBe(false);
    // A root is a prefix of a path segment, not of a string: `pagesExtra` is not `pages`.
    expect(isInScope('frontend/src/pagesExtra/Thing.tsx')).toBe(false);
  });

  it('classifies every occurrence it finds, with nothing left over', () => {
    // The completeness invariant. A parser hole shows up HERE, by file and line, instead of
    // showing up as a clean pass over copy nobody read.
    const listed = measured.unclassified
      .map((u) => `${u.file}:${u.occurrence.line} [${u.occurrence.tokenKind}] ${u.occurrence.snippet}`)
      .join('\n');
    expect(listed).toBe('');
    expect(measured.countMismatches).toEqual([]);
    expect(measured.totalClassified).toBe(measured.totalRaw);
    expect(Object.values(measured.reasonCounts).reduce((a, b) => a + b, 0)).toBe(measured.totalRaw);
    for (const key of Object.keys(measured.reasonCounts)) {
      expect(key === 'copy' || (EXCLUSION_REASONS as readonly string[]).includes(key)).toBe(true);
    }
  });

  it('finds no NEW violating file', () => {
    const unexpected = [...measured.violationsByFile.entries()]
      .filter(([file]) => !(file in FRONTEND_COPY_BASELINE))
      .map(([file, occ]) => `${file} (${occ.length}): ${occ.map((o) => `L${o.line} ${o.snippet}`).join(' | ')}`);
    expect(unexpected).toEqual([]);
  });

  it('matches the frozen baseline exactly, file by file', () => {
    const drift: string[] = [];
    for (const [file, expected] of Object.entries(FRONTEND_COPY_BASELINE)) {
      const actual = measured.violationsByFile.get(file)?.length ?? 0;
      if (actual === expected) continue;
      if (actual === 0) {
        drift.push(`${file}: now clean - DELETE this entry from FRONTEND_COPY_BASELINE`);
      } else if (actual < expected) {
        drift.push(`${file}: improved, ${expected} -> ${actual} - lower this entry to ${actual}`);
      } else {
        const lines = (measured.violationsByFile.get(file) ?? []).map((o) => `L${o.line} ${o.snippet}`).join(' | ');
        drift.push(`${file}: regressed, ${expected} -> ${actual}. Say "$0 to start" or "No card needed". ${lines}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('holds the recorded total', () => {
    const total = [...measured.violationsByFile.values()].reduce((n, v) => n + v.length, 0);
    expect(total).toBe(FRONTEND_COPY_BASELINE_TOTAL);
    expect(Object.values(FRONTEND_COPY_BASELINE).reduce((a, b) => a + b, 0)).toBe(FRONTEND_COPY_BASELINE_TOTAL);
  });

  it('keeps the lint module out of every runtime path', () => {
    // `typescript` is a devDependency. The scanner lives under `src/services/` so that
    // `tsc --noEmit` typechecks it, which means nothing stops a future service from importing
    // it - and that service would then need a compiler in the production container. This is
    // the guard that says so out loud.
    //
    // It looks for an IMPORT, not for the name. The looser version - "the file mentions
    // bannedCopyScanner" - failed on this suite's first run against a prose mention in
    // `frontendCopyBaseline.ts`'s own header, which is the weakness `lint-route-auth.js`
    // documents in itself. Narrowing to an import is not a loosening: a name in a comment
    // cannot pull a compiler into the runtime graph, and an import is the only thing that can.
    expect(importsScanner("import { scanSource } from '../bannedCopyScanner';")).toBe(true);
    expect(importsScanner("import type { Occurrence } from './content/bannedCopyScanner';")).toBe(true);
    expect(importsScanner("const s = require('../bannedCopyScanner');")).toBe(true);
    expect(importsScanner('export * from "./bannedCopyScanner";')).toBe(true);
    expect(importsScanner('// the classification is bannedCopyScanner’s')).toBe(false);

    const backendSrc = path.join(REPO_ROOT, 'backend', 'src');
    expect(fs.existsSync(backendSrc)).toBe(true);
    const offenders: string[] = [];
    let seen = 0;
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') scan(full); continue; }
        if (!/\.(ts|js)$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) continue;
        seen++;
        const rel = relative(full);
        if (rel.includes('/__tests__/')) continue;
        if (importsScanner(fs.readFileSync(full, 'utf8'))) offenders.push(rel);
      }
    };
    scan(backendSrc);
    expect(seen).toBeGreaterThan(500); // the walk read real files
    expect(offenders).toEqual([]);
  });
});

describe('the matcher itself', () => {
  const scan = (src: string, name = 'Sample.tsx'): Occurrence[] => scanSource(name, src, FREE_WORD_RULE).violations;

  it('POSITIVE CONTROL: fires on the shapes that are really in the tree', () => {
    // Every one of these is a real pattern from frontend/src, reduced to one line. If the
    // matcher ever stops matching, these fail and the baseline assertions above do not get to
    // report "clean" on copy nobody read.
    expect(scan('const a = <h5>Start free</h5>;')).toHaveLength(1);
    expect(scan('const a = <p>Try the whole platform yourself, free. No credit card.</p>;')).toHaveLength(1);
    expect(scan('const t = "Free to start, licenses when you are ready";')).toHaveLength(1);
    expect(scan("const p = { label: 'Open my free company workspace', to: '/try' };")).toHaveLength(1);
    expect(scan('const a = <Hero title="Start free" />;')).toHaveLength(1);
    expect(scan('const a = <input placeholder="Free preview" />;')).toHaveLength(1);
    expect(scan('const a = <img alt="A free workspace" src="/x.png" />;')).toHaveLength(1);
    expect(scan('const s = `Start free with ${n} seats`;')).toHaveLength(1);
    // A lone capitalised badge. It is the figure on the /try page, so it must count.
    expect(scan('const a = <span className="badge">Free</span>;')).toHaveLength(1);
    // Two in one expression are two, not one.
    expect(scan("const l = cond ? 'Free Access' : 'Grant Free Access';")).toHaveLength(2);
    // Prose containing a slash is still prose. The looser "the token contains a slash" test
    // for a path would swallow this one, which is why the path test checks for a path.
    expect(scan("const s = 'free/low-cost training for your team';")).toHaveLength(1);
  });

  it('NEGATIVE CONTROL: does not fire on words that merely contain it', () => {
    for (const src of [
      'const a = <p>Academic freedom matters.</p>;',
      'const a = <p>Speak freely.</p>;',
      'const a = <p>A freelance engineer.</p>;',
      'const a = <p>We will freeze the plan.</p>;',
      'const a = <p>Carefree and unafraid.</p>;',
      'const freeTier = 1; const freeform = 2;',
      "const k = 'free_tier_label';",
    ]) {
      expect(scan(src)).toEqual([]);
    }
  });

  it('NEGATIVE CONTROL: does not fire on machinery', () => {
    expect(scan('// start a free account\nconst a = 1;')).toEqual([]);
    expect(scan('/** The free workspace. */\nconst a = 1;')).toEqual([]);
    expect(scan('const a = <div>{/* the free workspace */}</div>;')).toEqual([]);
    expect(scan('const a = <div className="am-free" id="cbv2-free-title" />;')).toEqual([]);
    expect(scan('const a = <Claim claimKey="surface.free.workspace" />;')).toEqual([]);
    expect(scan("if (canShow('pricing.free', R)) { /* x */ }")).toEqual([]);
    expect(scan("api.post('/api/create-free-account');")).toEqual([]);
    expect(scan('api.post(`/api/enrollments/${id}/free-access`);')).toEqual([]);
    expect(scan("import x from './free-thing';")).toEqual([]);
    expect(scan("type Tier = 'free' | 'paid';", 'Sample.ts')).toEqual([]);
    expect(scan('const styles = `.tag.free{color:red}`;')).toEqual([]);
    expect(scan('const free = 1; use(free);')).toEqual([]);
    expect(scan('const re = /free/i; re.test(x);')).toEqual([]);
  });

  it('BOUNDARY: a full stop after the word is punctuation, not a key', () => {
    // The first draft of `classifyTextToken` excluded anything followed by a dot and so lost
    // "The Open House is free." and "...invite your team free. Activate licenses" - two real
    // violations. A sentence-ending dot is followed by a space, a quote or an end of line; a
    // key's dot is followed by a letter.
    expect(scan("const s = 'Membership starts at $149/month. The Open House is free.';")).toHaveLength(1);
    expect(scan("const s = 'Start free with the platform and invite your team free. Activate licenses.';")).toHaveLength(2);
    expect(scan("const k = 'surface.free.workspace';")).toEqual([]);
    expect(scan("const k = 'pricing.free';")).toEqual([]);
  });

  it('BOUNDARY: empty, wordless and unparseable input', () => {
    expect(scanSource('Empty.tsx', '', FREE_WORD_RULE).occurrences).toEqual([]);
    expect(scanSource('None.tsx', 'const a = 1;', FREE_WORD_RULE).occurrences).toEqual([]);
    // A file the parser cannot make sense of must not come back clean AND unclassified-free by
    // accident: whatever it does, every occurrence is still accounted for.
    const broken = scanSource('Broken.tsx', 'const a = <p>free', FREE_WORD_RULE);
    expect(broken.occurrences).toHaveLength(rawMatchCount('const a = <p>free', FREE_WORD_RULE));
    expect(broken.unclassified).toEqual([]);
  });

  it('IDEMPOTENCY: the same source scans the same way twice, and the regex carries no state', () => {
    const src = 'const a = <p>Start free, stay free.</p>;';
    const first = scanSource('A.tsx', src, FREE_WORD_RULE);
    const second = scanSource('A.tsx', src, FREE_WORD_RULE);
    expect(second).toEqual(first);
    expect(first.violations).toHaveLength(2);
    // A module-level /g regex would carry lastIndex between calls and silently miscount the
    // second body it was handed, which is a real bug `mandrillPreflight` documents having hit.
    expect(rawMatchCount(src, FREE_WORD_RULE)).toBe(rawMatchCount(src, FREE_WORD_RULE));
  });

  it('is a rule, not a hardcode: another word can be banned with no code change', () => {
    const rule = { id: 'x', word: 'guaranteed', reason: 'no guarantees', approvedAlternatives: [] };
    const src = 'const a = <p>Results guaranteed, and free.</p>;';
    expect(scanSource('A.tsx', src, rule).violations).toHaveLength(1);
    expect(scanSource('A.tsx', src, FREE_WORD_RULE).violations).toHaveLength(1);
    expect(scanSource('A.tsx', 'const a = <p>No guarantee here.</p>;', rule).violations).toEqual([]);
  });
});
