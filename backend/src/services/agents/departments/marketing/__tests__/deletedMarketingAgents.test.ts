/**
 * Dead marketing agents stay dead, and a SERVES_CAPABILITY marker may not be
 * a self-granted exemption (2026-10-06).
 *
 * Two agents were deleted here after a DO_NOT_BUILD audit:
 *
 *   contentGenerationAgent.ts    Its input is gone: `chat_messages` holds 8
 *     rows with role='visitor' in ALL of production, newest 2026-06-26, so its
 *     7-day window returns zero every run. On an empty input it still emitted,
 *     outside any conditional, a hardcoded unsourced claim ("What happens when
 *     a Fortune 500 VP dedicates 5 sessions to AI mastery?"). It also published
 *     a keyword-matched MESSAGE count labelled "conversations" while never
 *     querying chat_conversations (131 real rows).
 *
 *   audienceSegmentationAgent.ts `|| company.length > 3` made "Enterprise
 *     Buyers" a catch-all. Replayed against the real newest-500 production
 *     leads it returned 347, of which only 207 had a seniority title: 140 were
 *     classified on having a company name alone, and 52 leads with a genuine
 *     technical title were swallowed (Technical Professionals got 3). Two of
 *     its five segments returned zero. ICPInsightComputer, a live cron, already
 *     does this properly across 5 dimensions with Wilson score intervals.
 *
 * ── Why the second half of this file exists ──────────────────────────────────
 *
 * The reason contentGenerationAgent survived for months is that it exported
 * `SERVES_CAPABILITY`, and `agentOrphanService.hasDeclaredCapability()` skips
 * any file carrying that marker (agentOrphanService.ts:85-90, 136). The tool
 * built to find dead agents was therefore structurally unable to see this one.
 * The marker also wrote an ACTIVE `capability_agent_maps` row naming it the
 * sole executor of "Content Generation for Marketing" while all five rival
 * agents on that capability sit disabled.
 *
 * So the marker is an exemption, and an exemption on a module that nothing
 * imports is a false claim of execution. The ratchet below asserts that.
 *
 * HONEST LIMIT OF THE INVARIANT: "has an importer" is weaker than "has a
 * scheduled caller" — a module could be imported only by another island. It is
 * a NECESSARY condition, not a sufficient one, and it is the condition the
 * observed defect violated. It is asserted as an exact-match ratchet rather
 * than a subset check so the allowlist cannot quietly rot: fixing or deleting a
 * listed island fails this test until the entry is removed.
 */
import * as fs from 'fs';
import * as path from 'path';

/** `backend/src` — resolved from __dirname so the jest cwd cannot matter. */
const SRC_ROOT = path.resolve(__dirname, '../../../../..');

/** Paths are src-relative with forward slashes throughout this file. */
const DELETED_AGENTS = [
  'services/agents/departments/marketing/audienceSegmentationAgent.ts',
  'services/agents/departments/marketing/contentGenerationAgent.ts',
];

/**
 * Mirrors `agentOrphanService.hasDeclaredCapability` EXACTLY. If that regex
 * changes, this one must change with it — the point of this test is to assert
 * something about the files that function exempts, so a drifted copy would
 * assert something about a set nobody uses.
 */
const DECLARED_MARKER_RE =
  /^[ \t]*(?:export\s+const\s+|exports\.)SERVES_CAPABILIT(?:Y|IES)\s*(?::[^=]+)?\s*=/m;

/**
 * Modules that carry a SERVES_CAPABILITY marker and that nothing imports, as
 * measured on 2026-10-06. Both predate this change and are owned elsewhere;
 * they are recorded, not excused. Deleting one, giving it a caller, or removing
 * its marker must come with removing it from this list.
 */
const KNOWN_MARKER_ISLANDS = [
  'services/agents/departments/infrastructure/systemHealthAgent.ts',
  'services/agents/departments/intelligence/anomalyDetectionAgent.ts',
];

const BACKSLASH = String.fromCharCode(92);
const toPosix = (p: string): string => p.split(BACKSLASH).join('/');
const relFromSrc = (abs: string): string => toPosix(path.relative(SRC_ROOT, abs));
const stripExt = (p: string): string => toPosix(p).replace(/\.(tsx?|jsx?)$/i, '');
const isTestPath = (p: string): boolean =>
  /\.(test|spec)\.(t|j)sx?$/i.test(p) || /(^|\/)__tests__(\/|$)/.test(toPosix(p));

/** `from '...'`, `require('...')`, `import('...')` — covers `export … from`. */
const IMPORT_SPEC_RE = /(?:from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;

interface TreeScan {
  /** Every non-declaration source file under backend/src, src-relative. */
  readonly files: readonly string[];
  /** Non-test files carrying the orphan-sweep exemption marker. */
  readonly markerFiles: readonly string[];
  /** Extension-stripped absolute paths that some file imports. */
  readonly importedTargets: ReadonlySet<string>;
}

function scanTree(): TreeScan {
  const files: string[] = [];
  const markerFiles: string[] = [];
  const importedTargets = new Set<string>();

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(abs);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx)$/i.test(entry.name) || /\.d\.ts$/i.test(entry.name)) continue;

      const rel = relFromSrc(abs);
      files.push(rel);

      let src: string;
      try {
        src = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }

      if (!isTestPath(rel) && DECLARED_MARKER_RE.test(src)) markerFiles.push(rel);

      IMPORT_SPEC_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = IMPORT_SPEC_RE.exec(src)) !== null) {
        const spec = match[1];
        if (!spec.startsWith('.')) continue;
        importedTargets.add(stripExt(path.resolve(path.dirname(abs), spec)));
      }
    }
  };

  walk(SRC_ROOT);
  files.sort();
  markerFiles.sort();
  return { files, markerFiles, importedTargets };
}

const hasImporter = (scan: TreeScan, srcRelPath: string): boolean =>
  scan.importedTargets.has(stripExt(path.resolve(SRC_ROOT, srcRelPath)));

/** The island set, derived from one scan. Sorted, so the result is stable. */
const islandsOf = (scan: TreeScan): string[] =>
  scan.markerFiles.filter((f) => !hasImporter(scan, f)).sort();

const SCAN = scanTree();

describe('the scan is actually looking at the backend source tree', () => {
  // Without these, every assertion below would pass vacuously on a wrong root:
  // an empty walk finds no deleted file, no island and no importer.
  it('resolves SRC_ROOT to backend/src', () => {
    expect(path.basename(SRC_ROOT)).toBe('src');
    expect(fs.existsSync(path.join(SRC_ROOT, 'services'))).toBe(true);
  });

  it('finds a substantial number of source files', () => {
    expect(SCAN.files.length).toBeGreaterThan(500);
  });

  it('finds the marker on files that are known to carry it', () => {
    // contentOptimizationAgent is a real, imported marker-carrier: if the
    // marker scan silently matched nothing, this fails.
    expect(SCAN.markerFiles).toContain('services/agents/contentOptimizationAgent.ts');
    expect(SCAN.markerFiles.length).toBeGreaterThanOrEqual(KNOWN_MARKER_ISLANDS.length + 1);
  });

  it('resolves importers for a module that is known to be imported', () => {
    expect(hasImporter(SCAN, 'services/icpInsightService.ts')).toBe(true);
  });

  it('derives the same island set every time it is asked', () => {
    // Idempotency of the DERIVATION, not of the filesystem. An earlier version
    // of this test walked the tree twice and compared, which asserted that no
    // other process wrote a file during those six seconds — it failed once for
    // exactly that reason while a concurrent session edited this worktree. That
    // is not a property of this code, so it is not what is asserted.
    expect(islandsOf(SCAN)).toEqual(islandsOf(SCAN));
    expect(islandsOf(SCAN)).toEqual([...islandsOf(SCAN)].sort());
  });

  it('reports files and marker files in a stable, sorted order', () => {
    expect(SCAN.files).toEqual([...SCAN.files].sort());
    expect(SCAN.markerFiles).toEqual([...SCAN.markerFiles].sort());
  });
});

describe('deleted marketing agents stay deleted', () => {
  it.each(DELETED_AGENTS)('%s does not exist', (rel) => {
    expect(fs.existsSync(path.join(SRC_ROOT, rel))).toBe(false);
  });

  it('neither module appears anywhere in the source tree', () => {
    const resurrected = SCAN.files.filter((f) => DELETED_AGENTS.includes(f));
    expect(resurrected).toEqual([]);
  });

  it('nothing imports either deleted module', () => {
    // A dangling import is a broken build, so this failure is worth its own
    // message rather than being discovered as a tsc error.
    const dangling = DELETED_AGENTS.filter((rel) => hasImporter(SCAN, rel));
    expect(dangling).toEqual([]);
  });
});

describe('SERVES_CAPABILITY marker detector', () => {
  // A detector that has never been seen to fire is not a detector. These are
  // the exact forms agentOrphanService and ingestDeclaredAgents must agree on.
  const FIRES = [
    'export const SERVES_CAPABILITY = "Content Generation for Marketing";',
    "export const SERVES_CAPABILITY = 'Lead Scoring';",
    'export const SERVES_CAPABILITY: AgentCapabilityRef = "Lead Scoring";',
    'exports.SERVES_CAPABILITY = "Lead Scoring";',
    'export const SERVES_CAPABILITIES = ["A", "B"];',
    '  export const SERVES_CAPABILITY = "indented is still code";',
    'const x = 1;\nexport const SERVES_CAPABILITY = "not on line one";',
  ];
  const SILENT = [
    ' *   export const SERVES_CAPABILITY = "a JSDoc example";',
    '// export const SERVES_CAPABILITY = "commented out";',
    'const SERVES_CAPABILITY = "local, not exported";',
    'if (SERVES_CAPABILITY === "x") {}',
    '',
  ];

  it.each(FIRES)('fires on %j', (sample) => {
    expect(DECLARED_MARKER_RE.test(sample)).toBe(true);
  });

  it.each(SILENT)('stays silent on %j', (sample) => {
    expect(DECLARED_MARKER_RE.test(sample)).toBe(false);
  });
});

describe('a SERVES_CAPABILITY marker may not exempt a module nothing imports', () => {
  it('the set of marker-carrying import islands matches the recorded list exactly', () => {
    const islands = islandsOf(SCAN);

    // Exact match, both directions:
    //  - a NEW island means a module just claimed a capability (and an
    //    orphan-sweep exemption) while nothing can ever call it;
    //  - a MISSING island means listed debt was fixed and the entry is now
    //    stale, which would quietly widen the exemption for everyone else.
    expect(islands).toEqual([...KNOWN_MARKER_ISLANDS].sort());
  });

  it('every recorded island still exists and still carries the marker', () => {
    for (const rel of KNOWN_MARKER_ISLANDS) {
      expect(fs.existsSync(path.join(SRC_ROOT, rel))).toBe(true);
      expect(SCAN.markerFiles).toContain(rel);
    }
  });
});
