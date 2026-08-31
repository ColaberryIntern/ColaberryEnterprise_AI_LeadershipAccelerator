import { analyzeRepositories } from '../caseStudyRepoAnalyzer';
import { readCommitDate } from '../caseStudyRepoReader';
import type { RepoAnalysisIssue } from '../caseStudyRepoReader';
import { listRepositories } from '../caseStudyRepoCollection';
import { resolveApprovedSnapshot } from '../caseStudyPublicationStore';
import { ensureTraceId } from '../../../utils/requestContext';
import { findMetricDefinition } from './metricDefinitions';
import { assembleMetricRunContext, pinnedCommitNeeds } from './metricRunContext';
import { writeMetricRun } from './metricRunStore';
import type { MetricWriteOutcome } from './metricRunStore';

/**
 * One metric run, end to end: resolve → analyse → fetch the pins that need it →
 * compute → write.
 *
 * ADMIN-TRIGGERED, AND A SEPARATE ACTION FROM SYNC. `METRIC_PROVENANCE_PIPELINE.md`
 * §5.2. A sync answers "what is in these repositories"; a metric run answers
 * "what does that measure to, against the snapshot a human approved". Folding the
 * second into the first would mean every sync silently recomputes figures that
 * someone may already have published.
 *
 * NOT SCHEDULED. §10 is explicit that this should not be put on a cron, and
 * nothing here registers one. The runner is a function an operator invokes.
 */

export type MetricRunOutcome =
  | { readonly status: 'written'; readonly write: MetricWriteOutcome; readonly repoStats: RepoStats }
  | { readonly status: 'refused'; readonly write: MetricWriteOutcome; readonly repoStats: RepoStats }
  | { readonly status: 'blocked'; readonly reason: BlockedReason; readonly message: string };

export type BlockedReason = 'unknown_definition' | 'no_approved_snapshot' | 'no_repositories';

export interface RepoStats {
  readonly attempted: number;
  readonly analysed: number;
  readonly unreadable: number;
  /** Pinned commits whose dates had to be fetched because the head had moved on. */
  readonly pinnedDatesFetched: number;
  readonly issues: readonly RepoAnalysisIssue[];
}

export interface RunMetricInput {
  readonly caseStudyId: string;
  readonly definitionKey: string;
  readonly correlationId?: string;
  /** Pins the run to a specific approved snapshot instead of the highest version. */
  readonly snapshotId?: string;
  /** ISO-8601. Injected so a run is reproducible and a test is not racing a clock. */
  readonly computedAt: string;
  /** Test seam. Production omits it and the GitHub client uses global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export async function runMetric(input: RunMetricInput): Promise<MetricRunOutcome> {
  const correlationId = ensureTraceId(input.correlationId);

  const definition = findMetricDefinition(input.definitionKey);
  if (!definition) {
    return {
      status: 'blocked',
      reason: 'unknown_definition',
      message: `No metric definition is registered for '${input.definitionKey}'.`,
    };
  }

  // FAIL BEFORE SPENDING QUOTA. Without an approved snapshot there is no pinned
  // commit, so there is nothing to measure to and every repository read would be
  // bought for a result that can only be a refusal. The GitHub calls below are
  // the expensive part of this operation; not making them is the point of
  // checking this first.
  const snapshot = await resolveApprovedSnapshot(input.caseStudyId, input.snapshotId);
  if (!snapshot) {
    return {
      status: 'blocked',
      reason: 'no_approved_snapshot',
      message:
        'This Case Study has no approved snapshot, so there is no pinned commit to measure to. ' +
        'Approve a snapshot first.',
    };
  }

  const attached = await listRepositories({ caseStudyId: input.caseStudyId, correlationId });
  if (attached.length === 0) {
    return {
      status: 'blocked',
      reason: 'no_repositories',
      message: 'No repositories are attached to this Case Study, so there is nothing to measure.',
    };
  }

  const analysis = await analyzeRepositories(
    attached.map((repo) => ({
      owner: repo.repoOwner,
      repo: repo.repoName,
      correlationId,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    })),
    { correlationId }
  );

  const sourceCommitMap = ((snapshot as unknown as { source_commit_map?: Record<string, string> })
    .source_commit_map ?? {});
  const needs = pinnedCommitNeeds(analysis.analyzed, sourceCommitMap);

  // Only the pins whose repository head has moved past them cost a request. A
  // freshly built snapshot resolves entirely from what the analysis already
  // returned.
  const issues: RepoAnalysisIssue[] = [];
  const fetchedDates: Record<string, string | null> = {};
  for (const need of needs) {
    if (need.knownDate !== null) continue;
    fetchedDates[need.sha] = await readCommitDate(
      need.repoOwner,
      need.repoName,
      need.sha,
      { correlationId, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) },
      issues
    );
  }

  const context = assembleMetricRunContext({
    caseStudyId: input.caseStudyId,
    correlationId,
    analysed: analysis.analyzed,
    unreadableRepoCount: analysis.failures.length,
    needs,
    fetchedDates,
  });

  const computation = definition.compute(context);

  const write = await writeMetricRun({
    caseStudyId: input.caseStudyId,
    definition,
    computation,
    pinnedCommitSha: context.pinnedCommitSha,
    correlationId,
    computedAt: input.computedAt,
  });

  const repoStats: RepoStats = {
    attempted: attached.length,
    analysed: analysis.analyzed.length,
    unreadable: analysis.failures.length,
    pinnedDatesFetched: Object.keys(fetchedDates).length,
    issues,
  };

  // A refusal is reported as a refusal rather than folded into success. The
  // caller has to be able to tell "the figure was written" from "the figure was
  // left alone because a human had published it".
  return write.status === 'refused'
    ? { status: 'refused', write, repoStats }
    : { status: 'written', write, repoStats };
}
