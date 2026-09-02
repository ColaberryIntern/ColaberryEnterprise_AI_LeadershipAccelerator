import type { CaseStudyMetricType } from '../../../types/caseStudy';
import type { CaseStudyRepoFacts } from '../caseStudyRepoAnalyzer';
import type { MetricLearnerSystem } from './learnerSystemsSource';

/**
 * A metric definition is CODE, not a row an operator types.
 *
 * `METRIC_PROVENANCE_PIPELINE.md` §3.1-§3.2. The point of the interface is that
 * `sample`, `methodology`, `baseline` and `limitations` are OUTPUTS of the
 * computation rather than fields a human fills in afterwards. A number and the
 * sentence explaining how it was obtained are then produced by the same code at
 * the same moment, so they cannot drift apart — which is the failure this whole
 * pipeline exists to prevent.
 *
 * `compute` is PURE. No database, no network, no clock, no environment. Every
 * input arrives in the context, which is what makes a definition testable
 * without a fixture database and what makes "run it twice, get the same answer"
 * a property rather than a hope. The runner (a later stage) owns fetching,
 * persistence, and the evidence row.
 */
export interface MetricDefinition {
  /** Stable forever; equals `case_study_metrics.metric_key`. Charts resolve on it. */
  readonly key: string;
  /**
   * Bump ONLY when the MEANING changes, never for a refactor.
   *
   * `key` stays stable so charts and snapshots keep resolving, and the version
   * travels in the run record instead. A version bump against a metric whose
   * current row is already publishable must refuse to write and report the
   * divergence, rather than silently recomputing a published number under new
   * rules. That rule belongs to the runner; this field is what makes it possible.
   */
  readonly version: number;
  readonly label: string;
  readonly metricType: CaseStudyMetricType;
  /**
   * `repo` or `platform` only.
   *
   * The publish gate refuses `verified` + `self` outright, and the claim scanner
   * excludes `self` figures from the set prose may state. `repo` is the honest
   * answer for anything derived from a repository at a pinned sha, because a
   * third party can re-read that sha and get the same number — it is the only
   * method in the union that makes a platform-computed figure checkable from
   * outside the platform.
   */
  readonly verificationMethod: 'repo' | 'platform';
  compute(ctx: MetricRunContext): MetricComputation;
}

/**
 * One repository, as a metric sees it.
 *
 * Carries the full analyzer facts because a definition should be a definition
 * rather than a new plumbing exercise — Stage 3 adds two more metrics with zero
 * new mechanism, and that only holds if the context already contains what they
 * need.
 *
 * `ref` is the OPAQUE reference, and it is the only identifier a computation may
 * put into generated prose. `methodology` and `limitations` are stored on the
 * metric row and can reach a published page, and publish gate rule 11 refuses a
 * snapshot whose prose carries the identity of a repository the record withholds.
 * A metric that names `acme/secret-thing` in its own methodology would be a leak
 * the gate then has to catch; not writing it is better than catching it.
 */
export interface MetricRepoInput {
  /** `opaqueRepoRef(owner, name)`. Never the owner, name or URL. */
  readonly ref: string;
  readonly facts: CaseStudyRepoFacts;
}

export interface MetricRunContext {
  /**
   * Learner-built systems, for PLATFORM-derived definitions.
   *
   * Empty for a repository-derived metric, which must not read it. Carries an
   * opaque ref and a file count per system and nothing else — no owner, no
   * repository name, no learner — so a definition can count systems and cannot
   * become a claim about a person by a later edit.
   */
  readonly learnerSystems: readonly MetricLearnerSystem[];
  readonly caseStudyId: string;
  readonly correlationId: string;
  /** Successfully analysed repositories only. */
  readonly repositories: readonly MetricRepoInput[];
  /**
   * Repositories attached to this case study that could NOT be analysed.
   *
   * A count, not a list, and it is not decoration: it is the difference between
   * "three repositories" and "three of the four repositories", and a definition
   * that omits it publishes a denominator that quietly excludes what it could
   * not read.
   */
  readonly unreadableRepoCount: number;
  /**
   * The commit pinned by the approved snapshot, and its committer date.
   *
   * Anchoring to the pinned sha rather than to "now" or to `pushedAt` is what
   * makes a re-run return the same number. `pushedAt` moves on every push, and
   * this codebase already refuses to hash it for that reason.
   */
  readonly pinnedCommitSha: string | null;
  readonly pinnedCommitAt: string | null;
}

export type { MetricLearnerSystem } from './learnerSystemsSource';

export interface MetricComputation {
  /**
   * Null when the metric cannot be computed from what is present.
   *
   * A null is a real outcome and must stay distinguishable from a zero: "no
   * analysable repository carries a creation date" and "the work took zero days"
   * are different statements, and collapsing them into 0 publishes a false
   * figure rather than an absent one.
   */
  readonly numericValue: number | null;
  readonly valueDisplay: string;
  readonly unit?: string;
  /** GENERATED. What was measured over. */
  readonly sample: string;
  /** GENERATED. How the number was obtained, in a sentence a reader can check. */
  readonly methodology: string;
  /** GENERATED. Null is correct for a level metric with nothing to compare to. */
  readonly baseline: string | null;
  /** Static ones belong to the definition; run-derived ones to the run. */
  readonly limitations: readonly string[];
  /** Exactly what was read, for the run record. */
  readonly inputs: Record<string, unknown>;
}

/**
 * Whole days between two ISO-8601 instants, or null if either is unusable.
 *
 * Floor, not round: a metric that says "11 days" must not be answering 10.6.
 * Returns null rather than a negative number when the end precedes the start —
 * that ordering means the inputs are wrong (a repository created after the
 * commit that is supposed to conclude it), and a negative elapsed time is not a
 * measurement worth publishing under any label.
 */
export function elapsedDays(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  if (to < from) return null;
  return Math.floor((to - from) / 86_400_000);
}
