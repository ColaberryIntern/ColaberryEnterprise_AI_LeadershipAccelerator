import type {
  CaseStudyCollectorKey,
  CaseStudyMetricPayload,
  CaseStudyMetricShape,
} from '../../../types/caseStudy';

/**
 * What a collector is, and the two rules that shape this file.
 *
 * RULE ONE: A COLLECTOR NEVER INVENTS A FIGURE. Every collector returns either a
 * computed payload or `{ ok: false, reason }`. There is no default, no zero
 * standing in for "could not tell", and no rounded guess. A repository with no
 * decision records and a repository whose tree could not be read are different
 * answers, and only the first is a number. When a collector declines, the sync
 * creates no metric at all, so an unmeasurable thing simply does not appear.
 *
 * RULE TWO: A COLLECTOR IS PURE. No network, no database, no clock, no
 * environment. Everything arrives in `CollectorInput`, which is what lets each
 * collector be tested against a fixture tree and what makes "run it twice at the
 * same sha, get the same answer" a property rather than a hope. The output hash
 * that detects drift only means something because of this.
 */

/** The repository tree at one pinned commit. Paths are repo-root relative. */
export interface CollectorTree {
  readonly paths: readonly string[];
  /**
   * GitHub truncates very large trees. A count taken from a truncated tree is a
   * FLOOR, not a count, so every collector that counts paths declines outright
   * rather than publishing a number that is quietly wrong.
   */
  readonly truncated: boolean;
}

/** One commit, reduced to what a figure can honestly be built from. */
export interface CollectorCommit {
  readonly sha: string;
  /** `YYYY-MM-DD`, UTC. A date, never a local timestamp: see `utcDate`. */
  readonly authoredDate: string;
}

export interface CollectorInput {
  /** The commit the tree was read at. Pins the figure and the evidence row. */
  readonly sha: string;
  readonly tree: CollectorTree;
  /**
   * Empty for tree-shaped collectors, which must not read it. A collector that
   * needs history says so through `needsCommits`, and the sync fetches the log
   * only for the collectors a manifest actually registered.
   */
  readonly commits: readonly CollectorCommit[];
}

/**
 * Why a collector declined. These are values rather than free text because the
 * sync logs them and an operator has to be able to tell "nothing to measure"
 * from "could not measure".
 */
export type CollectorSkipReason =
  | 'empty_tree'
  | 'tree_truncated'
  | 'no_source_files'
  | 'no_modules'
  | 'no_decision_records'
  | 'no_commits';

export interface CollectorOutput {
  readonly shape: CaseStudyMetricShape;
  readonly payload: CaseStudyMetricPayload;
  /** Exactly as it should render. The hero number, never a sentence. */
  readonly valueDisplay: string;
  readonly unit: string | null;
  readonly numericValue: number | null;
  /** How the figure was obtained, generated beside it so the two cannot drift. */
  readonly methodology: string;
  /**
   * What the figure does not show. Generated, never left to an author to
   * remember, because the caveat is the part that gets forgotten.
   */
  readonly limitations: readonly string[];
  /** A command a sceptic can run to get the same number. Must be real. */
  readonly reproduceCommand: string;
}

export type CollectorResult =
  | { readonly ok: true; readonly output: CollectorOutput }
  | { readonly ok: false; readonly reason: CollectorSkipReason; readonly detail: string };

export interface Collector {
  readonly key: CaseStudyCollectorKey;
  readonly shape: CaseStudyMetricShape;
  readonly label: string;
  /** True when the collector reads `input.commits`, so the sync fetches a log. */
  readonly needsCommits: boolean;
  collect(input: CollectorInput): CollectorResult;
}

export const skip = (reason: CollectorSkipReason, detail: string): CollectorResult =>
  ({ ok: false, reason, detail });

/* ─────────────────────────────────────────────────── shared path helpers ──── */

const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.cs', '.php', '.swift', '.scala', '.sql',
];

/** Vendored, generated and dependency trees are somebody else's work. */
const EXCLUDED_SEGMENTS = [
  'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.venv',
  'venv', '__pycache__', 'site-packages', 'migrations', 'generated',
];

export function isExcluded(path: string): boolean {
  const lower = path.toLowerCase();
  return EXCLUDED_SEGMENTS.some((seg) => lower === seg
    || lower.startsWith(`${seg}/`)
    || lower.includes(`/${seg}/`));
}

export function isSourceFile(path: string): boolean {
  const lower = path.toLowerCase();
  return !isExcluded(lower) && SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * A test file, by the conventions this repository and the ones it analyses use.
 *
 * Deliberately NAME-BASED and nothing more. Reading a file to decide whether it
 * really tests something would need the file contents, which a tree read does
 * not have, and guessing from a name is exactly the limitation every collector
 * that uses this reports back.
 */
export function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (isExcluded(lower)) return false;
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  if (lower.includes('/__tests__/') || lower.startsWith('__tests__/')) return true;
  if (lower.includes('/tests/') || lower.startsWith('tests/')) return isSourceFile(lower);
  if (lower.includes('/spec/') || lower.startsWith('spec/')) return isSourceFile(lower);
  if (base.startsWith('test_') && isSourceFile(lower)) return true;
  return ['.test.', '.spec.', '_test.'].some((marker) => base.includes(marker));
}

/** `src/a/b/thing.test.ts` becomes `thing`. Used to pair a test to a module. */
export function moduleNameOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const noExt = base.includes('.') ? base.slice(0, base.indexOf('.')) : base;
  return noExt.toLowerCase();
}
