/**
 * repoFactExtractors — the PURE half of the Case Study repository analyzer
 * (spec §11). Given a list of repository paths, it decides WHICH files are worth
 * reading and derives every fact a path alone can prove.
 *
 * WHY THIS FILE EXISTS SEPARATELY. Spec §11 says "do not recursively fetch every
 * file body", and the only way to keep that promise honestly is to make the
 * selection a bounded, testable, pure function rather than a loop buried inside
 * an async orchestrator where nobody can count it. `selectHighValueFiles()` takes
 * a tree of any size and returns at most `MAX_CONTENT_FETCHES` paths, so the
 * network cost of analysing a 10,000-file repository is decided here, in
 * arithmetic, before a single request is made.
 *
 * DETERMINISTIC BY CONSTRUCTION. No clock, no randomness, no I/O, no imports at
 * all — this is a leaf module. Every returned list is sorted and de-duplicated,
 * so a repository whose tree arrives in a different order produces byte-identical
 * facts. Nothing here infers: a fact is present because a path or a declared
 * dependency proves it, never because a README sounded like it.
 *
 * Siblings:
 *   · `repoDependencySignatures.ts` — imports the types below, parses manifest
 *     BODIES, and maps dependency tokens to frameworks/databases/AI SDKs.
 *   · `caseStudyRepoAnalyzer.ts`    — the async orchestrator; imports both.
 * The dependency direction is one-way (leaf → signatures → analyzer), so the
 * three files can never form a cycle.
 */

/* ──────────────────────────────────────────────────────────────── bounds ──── */

/**
 * The hard cap on content requests per repository. Every rule below carries its
 * own limit as well, and the limits deliberately sum to more than this: the
 * global cap is what bites on a repository that is rich in every category, and a
 * cap that can never bite is not a cap.
 */
export const MAX_CONTENT_FETCHES = 24;

/** Per-file byte ceiling. Larger blobs are skipped by size before being fetched. */
export const MAX_FILE_BYTES = 128 * 1024;

/** Upper bound on tree entries scanned. A tree larger than this is truncated. */
export const MAX_TREE_PATHS = 20_000;

/** Bounds on every derived list, so one absurd manifest cannot inflate a snapshot. */
export const MAX_DEPENDENCIES = 200;
export const MAX_LIST_ITEMS = 60;

/** Prose excerpts kept for the drafting step. Bounded in both count and size. */
export const MAX_DOCUMENTS = 6;
export const MAX_DOCUMENT_EXCERPT_BYTES = 8 * 1024;

/* ───────────────────────────────────────────────────────────────── types ──── */

/** The categories a declared dependency can prove. */
export type RepoFactKind =
  | 'framework'
  | 'database'
  | 'ai_sdk'
  | 'ai_provider'
  | 'test_framework'
  | 'agent_clue';

export const REPO_FACT_KINDS: readonly RepoFactKind[] = [
  'framework', 'database', 'ai_sdk', 'ai_provider', 'test_framework', 'agent_clue',
];

/** One chosen file, tagged with the rule that chose it. */
export interface SelectedRepoFile {
  readonly path: string;
  readonly rule: string;
}

/** Facts a path list proves on its own — no file body required. */
export interface RepoPathFacts {
  readonly languages: readonly string[];
  readonly ciProviders: readonly string[];
  readonly manifestFiles: readonly string[];
  readonly agentClues: readonly string[];
  readonly hasReadme: boolean;
  readonly hasClaudeMd: boolean;
  readonly hasDocker: boolean;
  readonly hasDockerCompose: boolean;
  readonly hasCi: boolean;
  readonly hasTests: boolean;
  readonly testFileCount: number;
  readonly hasArchitectureDoc: boolean;
  readonly hasRequirementsDoc: boolean;
  readonly hasTraceabilityDoc: boolean;
  readonly hasStoriesDoc: boolean;
  readonly scannedPathCount: number;
}

/** Facts manifest bodies prove. Produced by `repoDependencySignatures.ts`. */
export interface RepoContentFacts {
  readonly dependencies: readonly string[];
  readonly frameworks: readonly string[];
  readonly databases: readonly string[];
  readonly aiSdks: readonly string[];
  readonly aiProviders: readonly string[];
  readonly testFrameworks: readonly string[];
  readonly agentClues: readonly string[];
  /** Paths whose JSON could not be parsed. Classified `MalformedManifest`. */
  readonly malformedManifests: readonly string[];
}

/** The merged deterministic fact set carried into a snapshot. */
export interface RepoDerivedFacts {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly dependencies: readonly string[];
  readonly databases: readonly string[];
  readonly aiSdks: readonly string[];
  readonly aiProviders: readonly string[];
  readonly agentClues: readonly string[];
  readonly testFrameworks: readonly string[];
  readonly ciProviders: readonly string[];
  readonly manifestFiles: readonly string[];
  readonly hasReadme: boolean;
  readonly hasClaudeMd: boolean;
  readonly hasTests: boolean;
  readonly testFileCount: number;
  readonly hasCi: boolean;
  readonly hasDocker: boolean;
  readonly hasDockerCompose: boolean;
  readonly hasArchitectureDoc: boolean;
  readonly hasRequirementsDoc: boolean;
  readonly hasTraceabilityDoc: boolean;
  readonly hasStoriesDoc: boolean;
  /** The repository's own declared homepage. Never guessed from README prose. */
  readonly deploymentUrl: string | null;
}

/* ─────────────────────────────────────────────────────────────── helpers ──── */

export function basenameOf(lowerPath: string): string {
  const i = lowerPath.lastIndexOf('/');
  return i === -1 ? lowerPath : lowerPath.slice(i + 1);
}

function depthOf(lowerPath: string): number {
  let n = 0;
  for (let i = 0; i < lowerPath.length; i += 1) if (lowerPath[i] === '/') n += 1;
  return n;
}

/** Shallowest first, then shortest, then lexicographic. Total order, no ties. */
function comparePathPriority(a: string, b: string): number {
  const da = depthOf(a.toLowerCase());
  const db = depthOf(b.toLowerCase());
  if (da !== db) return da - db;
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort, de-duplicate and cap. Every list this module emits goes through here. */
export function sortUnique(values: Iterable<string>, cap: number = MAX_LIST_ITEMS): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const trimmed = typeof v === 'string' ? v.trim() : '';
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort().slice(0, cap);
}

/**
 * Cut a string to a byte ceiling. Slicing by characters would let a file of
 * multi-byte text exceed the cap, which is the whole thing the cap prevents.
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.byteLength <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString('utf8');
}

/**
 * Is this decoded blob binary? A NUL byte settles it; otherwise a high density
 * of replacement characters means the bytes were not text. Binary files are
 * skipped silently — a repository containing a PNG is not a failed analysis.
 */
export function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  if (sample.indexOf(String.fromCharCode(0)) !== -1) return true;
  if (!sample.length) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i += 1) if (sample.charCodeAt(i) === 0xfffd) bad += 1;
  return bad / sample.length > 0.05;
}

/* ─────────────────────────────────────────────── high-value file selection ── */

interface HighValueRule {
  readonly key: string;
  readonly limit: number;
  readonly match: (lower: string, base: string) => boolean;
}

const COMPOSE_RE = /^(docker-compose|compose)(\.[a-z0-9_.-]+)?\.ya?ml$/;
const CASE_STUDY_MANIFEST_RE = /^case-study\.(json|ya?ml|toml)$/;
const WORKFLOW_RE = /\.ya?ml$/;

/**
 * Spec §11's high-value list, in fetch priority order. Manifests come first
 * because they are the only files whose BODY yields machine facts; prose files
 * follow because they feed the drafting step; workflow bodies come last because
 * CI presence is already proven by the path.
 */
const HIGH_VALUE_RULES: readonly HighValueRule[] = [
  { key: 'package_json', limit: 3, match: (l, b) => b === 'package.json' && !l.includes('node_modules/') },
  { key: 'requirements_txt', limit: 2, match: (_l, b) => b === 'requirements.txt' },
  { key: 'pyproject_toml', limit: 1, match: (_l, b) => b === 'pyproject.toml' },
  { key: 'go_mod', limit: 1, match: (_l, b) => b === 'go.mod' },
  { key: 'cargo_toml', limit: 1, match: (_l, b) => b === 'cargo.toml' },
  { key: 'csproj', limit: 2, match: (_l, b) => b.endsWith('.csproj') },
  { key: 'dockerfile', limit: 2, match: (_l, b) => b === 'dockerfile' || b.startsWith('dockerfile.') },
  { key: 'docker_compose', limit: 2, match: (_l, b) => COMPOSE_RE.test(b) },
  { key: 'readme', limit: 1, match: (l, b) => depthOf(l) === 0 && b.startsWith('readme') },
  { key: 'claude_md', limit: 1, match: (l, b) => depthOf(l) === 0 && b === 'claude.md' },
  { key: 'case_study_manifest', limit: 1, match: (_l, b) => CASE_STUDY_MANIFEST_RE.test(b) },
  { key: 'colaberry_plan', limit: 1, match: (l) => l === '.colaberry/plan.json' },
  { key: 'colaberry_manifest', limit: 1, match: (l) => l === '.colaberry/manifest.json' },
  { key: 'docs_requirements', limit: 1, match: (l) => l === 'docs/requirements.md' },
  { key: 'docs_architecture', limit: 1, match: (l) => l === 'docs/architecture.md' },
  { key: 'docs_architecture_dir', limit: 2, match: (l) => l.startsWith('docs/architecture/') && l.endsWith('.md') },
  { key: 'docs_traceability', limit: 1, match: (l) => l === 'docs/traceability.md' },
  { key: 'docs_stories', limit: 1, match: (l) => l === 'docs/stories.md' },
  { key: 'ci_workflow', limit: 2, match: (l) => l.startsWith('.github/workflows/') && WORKFLOW_RE.test(l) },
];

/** Rules whose content is prose worth excerpting for the drafting step. */
export const DOCUMENT_RULES: readonly string[] = [
  'readme', 'claude_md', 'docs_requirements', 'docs_architecture', 'docs_architecture_dir',
  'docs_traceability', 'docs_stories',
];

/**
 * Choose the files worth reading. Never more than `MAX_CONTENT_FETCHES`, never a
 * blob already known to exceed `MAX_FILE_BYTES`, and identical for identical
 * input regardless of the order the tree arrived in.
 */
export function selectHighValueFiles(
  paths: readonly string[],
  sizes?: ReadonlyMap<string, number>,
): SelectedRepoFile[] {
  const scanned = paths.slice(0, MAX_TREE_PATHS);
  const chosen: SelectedRepoFile[] = [];
  const taken = new Set<string>();

  for (const rule of HIGH_VALUE_RULES) {
    if (chosen.length >= MAX_CONTENT_FETCHES) break;
    const candidates = scanned
      .filter((p) => {
        const lower = p.toLowerCase();
        return rule.match(lower, basenameOf(lower));
      })
      .sort(comparePathPriority);

    let used = 0;
    for (const path of candidates) {
      if (used >= rule.limit || chosen.length >= MAX_CONTENT_FETCHES) break;
      if (taken.has(path)) continue;
      const size = sizes?.get(path);
      if (typeof size === 'number' && size > MAX_FILE_BYTES) continue;
      taken.add(path);
      chosen.push({ path, rule: rule.key });
      used += 1;
    }
  }
  return chosen;
}

/* ───────────────────────────────────────────────────── path-derived facts ── */

const EXTENSION_LANGUAGES: Readonly<Record<string, string>> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript',
  cjs: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  rb: 'Ruby', cs: 'C#', php: 'PHP', swift: 'Swift', scala: 'Scala', sql: 'SQL',
  sh: 'Shell', bash: 'Shell', ps1: 'PowerShell', dart: 'Dart', ex: 'Elixir', clj: 'Clojure',
};

const CI_DIR_PREFIXES: readonly (readonly [string, string])[] = [
  ['.github/workflows/', 'github_actions'], ['.circleci/', 'circleci'],
];

const CI_FILE_BASENAMES: Readonly<Record<string, string>> = {
  '.gitlab-ci.yml': 'gitlab_ci', 'azure-pipelines.yml': 'azure_pipelines',
  jenkinsfile: 'jenkins', '.travis.yml': 'travis', 'bitbucket-pipelines.yml': 'bitbucket_pipelines',
};

const MANIFEST_BASENAMES: ReadonlySet<string> = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'cargo.toml',
  'gemfile', 'pom.xml', 'build.gradle', 'composer.json', 'pipfile',
]);

/** Directory segments that are evidence of an agent/RAG/MCP surface. */
const PATH_CLUE_SEGMENTS: readonly (readonly [string, string])[] = [
  ['agents', 'agent_directory'], ['mcp', 'mcp_surface'], ['prompts', 'prompt_library'],
  ['evals', 'evaluation_suite'], ['.claude', 'claude_code_config'], ['rag', 'rag_surface'],
  ['embeddings', 'rag_surface'],
];

const TEST_SEGMENTS: ReadonlySet<string> = new Set(['test', 'tests', '__tests__', 'spec', 'e2e']);

function isTestPath(base: string, segments: readonly string[]): boolean {
  for (const seg of segments.slice(0, -1)) if (TEST_SEGMENTS.has(seg)) return true;
  return base.includes('.test.') || base.includes('.spec.')
    || (base.startsWith('test_') && base.endsWith('.py')) || base.endsWith('_test.go');
}

/** Everything a tree of paths proves without reading a single body. */
export function derivePathFacts(paths: readonly string[]): RepoPathFacts {
  const scanned = paths.slice(0, MAX_TREE_PATHS);
  const languages = new Set<string>();
  const ci = new Set<string>();
  const clues = new Set<string>();
  const manifests: string[] = [];
  let testFileCount = 0;
  let hasReadme = false; let hasClaudeMd = false;
  let hasDocker = false; let hasDockerCompose = false;
  let hasArchitectureDoc = false; let hasRequirementsDoc = false;
  let hasTraceabilityDoc = false; let hasStoriesDoc = false;

  for (const raw of scanned) {
    if (typeof raw !== 'string' || !raw) continue;
    const lower = raw.toLowerCase();
    const base = basenameOf(lower);
    const segments = lower.split('/');
    const dot = base.lastIndexOf('.');
    const language = dot > 0 ? EXTENSION_LANGUAGES[base.slice(dot + 1)] : undefined;
    if (language) languages.add(language);

    if (segments.length === 1 && base.startsWith('readme')) hasReadme = true;
    if (segments.length === 1 && base === 'claude.md') hasClaudeMd = true;
    if (base === 'dockerfile' || base.startsWith('dockerfile.')) hasDocker = true;
    if (COMPOSE_RE.test(base)) { hasDockerCompose = true; hasDocker = true; }

    for (const [prefix, provider] of CI_DIR_PREFIXES) if (lower.startsWith(prefix)) ci.add(provider);
    const ciFile = CI_FILE_BASENAMES[base];
    if (ciFile) ci.add(ciFile);

    if (isTestPath(base, segments)) testFileCount += 1;
    if (lower === 'docs/architecture.md' || lower.startsWith('docs/architecture/')) hasArchitectureDoc = true;
    if (lower === 'docs/requirements.md') hasRequirementsDoc = true;
    if (lower === 'docs/traceability.md') hasTraceabilityDoc = true;
    if (lower === 'docs/stories.md') hasStoriesDoc = true;

    if (MANIFEST_BASENAMES.has(base) || base.endsWith('.csproj')) manifests.push(raw);
    for (const [segment, clue] of PATH_CLUE_SEGMENTS) {
      if (segments.slice(0, -1).includes(segment)) clues.add(clue);
    }
    if (base.includes('mcp-server') || base.includes('mcp_server')) clues.add('mcp_surface');
  }

  return {
    languages: sortUnique(languages),
    ciProviders: sortUnique(ci),
    manifestFiles: sortUnique(manifests),
    agentClues: sortUnique(clues),
    hasReadme, hasClaudeMd, hasDocker, hasDockerCompose,
    hasCi: ci.size > 0,
    hasTests: testFileCount > 0,
    testFileCount,
    hasArchitectureDoc, hasRequirementsDoc, hasTraceabilityDoc, hasStoriesDoc,
    scannedPathCount: scanned.length,
  };
}

/* ──────────────────────────────────────────────────────────────── merging ─── */

export interface MergeFactsOptions {
  /** Language names GitHub itself reports. Authoritative, unioned with extensions. */
  readonly apiLanguages?: readonly string[];
  /** `repository.homepage`, the only deployment URL that is a fact rather than a guess. */
  readonly homepage?: string | null;
}

/** Union the two halves into one sorted, bounded, deterministic fact set. */
export function mergeRepoFacts(
  pathFacts: RepoPathFacts,
  contentFacts: RepoContentFacts,
  options: MergeFactsOptions = {},
): RepoDerivedFacts {
  const homepage = typeof options.homepage === 'string' ? options.homepage.trim() : '';
  return {
    languages: sortUnique([...pathFacts.languages, ...(options.apiLanguages ?? [])]),
    frameworks: sortUnique(contentFacts.frameworks),
    dependencies: sortUnique(contentFacts.dependencies, MAX_DEPENDENCIES),
    databases: sortUnique(contentFacts.databases),
    aiSdks: sortUnique(contentFacts.aiSdks),
    aiProviders: sortUnique(contentFacts.aiProviders),
    agentClues: sortUnique([...pathFacts.agentClues, ...contentFacts.agentClues]),
    testFrameworks: sortUnique(contentFacts.testFrameworks),
    ciProviders: sortUnique(pathFacts.ciProviders),
    manifestFiles: sortUnique(pathFacts.manifestFiles),
    hasReadme: pathFacts.hasReadme,
    hasClaudeMd: pathFacts.hasClaudeMd,
    hasTests: pathFacts.hasTests || contentFacts.testFrameworks.length > 0,
    testFileCount: pathFacts.testFileCount,
    hasCi: pathFacts.hasCi,
    hasDocker: pathFacts.hasDocker,
    hasDockerCompose: pathFacts.hasDockerCompose,
    hasArchitectureDoc: pathFacts.hasArchitectureDoc,
    hasRequirementsDoc: pathFacts.hasRequirementsDoc,
    hasTraceabilityDoc: pathFacts.hasTraceabilityDoc,
    hasStoriesDoc: pathFacts.hasStoriesDoc,
    deploymentUrl: homepage ? homepage : null,
  };
}

/** The empty fact set, for a repository whose tree could not be read at all. */
export function emptyContentFacts(): RepoContentFacts {
  return {
    dependencies: [], frameworks: [], databases: [], aiSdks: [], aiProviders: [],
    testFrameworks: [], agentClues: [], malformedManifests: [],
  };
}
