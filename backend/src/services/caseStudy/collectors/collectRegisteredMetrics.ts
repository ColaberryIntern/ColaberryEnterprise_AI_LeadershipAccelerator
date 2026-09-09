import { opaqueRepoRef, readCommitHistory } from '../caseStudyRepoReader';
import type { RepoAnalysisIssue } from '../caseStudyRepoReader';
import { ensureTraceId } from '../../../utils/requestContext';
import { needsCommitLog, runRegisteredCollectors } from './collectorSync';
import type { CollectorRepoInput, CollectorSyncReport } from './collectorSync';
import type { CaseStudyRepoFacts } from '../caseStudyRepoAnalyzer';
import type { CaseStudyManifest } from '../caseStudyManifestReader';
import { CASE_STUDY_COLLECTOR_KEYS } from '../../../types/caseStudy';
import type { CaseStudyCollectorKey } from '../../../types/caseStudy';

/**
 * The bridge between a sync and the collectors: work out what each repository
 * registered, fetch only the history that is actually needed, and run them.
 *
 * THE ONE EXPENSIVE THING HERE IS THE COMMIT LOG, and it is bought lazily. Two
 * of the five collectors need history; the other three read a tree the analyzer
 * already has. A repository that registered `test_files` and nothing else makes
 * zero additional requests, and a repository that registered nothing is skipped
 * before any of this runs.
 *
 * A REPOSITORY WITH NO PINNED COMMIT IS SKIPPED, not measured at its default
 * branch. Every collected figure is pinned to a sha so a third party can
 * re-derive it; a figure with no sha is not reproducible and therefore is not
 * one of these figures.
 */

export interface CollectRegisteredMetricsInput {
  readonly caseStudyId: string;
  readonly correlationId?: string;
  readonly repos: readonly {
    readonly facts: CaseStudyRepoFacts;
    readonly manifest?: CaseStudyManifest | null;
  }[];
  /** Injected in tests. Production omits it and the client uses global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly collectedAt: Date;
}

export async function collectRegisteredMetrics(
  input: CollectRegisteredMetricsInput,
): Promise<CollectorSyncReport> {
  const correlationId = ensureTraceId(input.correlationId);
  const prepared: CollectorRepoInput[] = [];

  for (const repo of input.repos) {
    const registered = registeredKeys(repo.manifest);
    if (registered.length === 0) continue;

    const sha = repo.facts.metadata.latestCommitSha;
    if (!sha) continue;

    // Issues raised by a history read are deliberately dropped rather than
    // pushed onto the sync run. A partial log still yields a true span over the
    // commits that were read, and the collector's own limitations already say
    // that commits made elsewhere are invisible. Reporting a page-three
    // rate limit as a repository issue would be noise on a figure that is fine.
    const issues: RepoAnalysisIssue[] = [];
    const commits = needsCommitLog(registered)
      ? await readCommitHistory(
        repo.facts.repoOwner,
        repo.facts.repoName,
        { fetchImpl: input.fetchImpl, correlationId },
        issues,
      )
      : [];

    prepared.push({
      repoRef: opaqueRepoRef(repo.facts.repoOwner, repo.facts.repoName),
      sha,
      tree: { paths: repo.facts.treePaths ?? [], truncated: repo.facts.treeTruncated === true },
      registered,
      commits: commits.map((c) => ({ sha: c.sha, authoredDate: c.authoredDate })),
    });
  }

  if (prepared.length === 0) {
    return { entries: [], created: 0, updated: 0, drift: 0 };
  }
  return runRegisteredCollectors({
    caseStudyId: input.caseStudyId,
    repos: prepared,
    collectedAt: input.collectedAt,
  });
}

/**
 * The collectors this repository's manifest asked for, deduplicated.
 *
 * Re-checked against the frozen key list rather than trusted from the manifest
 * type. The schema already enforces it, and this is cheap: these routines read
 * somebody else's repository, so the list of what may run is worth confirming
 * at the point of running rather than only at the point of parsing.
 */
function registeredKeys(manifest?: CaseStudyManifest | null): CaseStudyCollectorKey[] {
  const keys = new Set<CaseStudyCollectorKey>();
  for (const outcome of manifest?.outcomes ?? []) {
    const key = outcome.collector;
    if (key && (CASE_STUDY_COLLECTOR_KEYS as readonly string[]).includes(key)) keys.add(key);
  }
  return [...keys];
}
