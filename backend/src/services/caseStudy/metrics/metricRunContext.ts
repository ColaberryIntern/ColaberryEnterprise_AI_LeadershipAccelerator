import { opaqueRepoRef } from '../caseStudyRepoReader';
import type { CaseStudyRepoFacts } from '../caseStudyRepoAnalyzer';
import type { MetricRepoInput, MetricRunContext } from './metricDefinition';

/**
 * Turning a set of repository analyses plus an approved snapshot's pinned shas
 * into the context a metric definition computes over.
 *
 * PURE. No database, no network. The orchestrator does the fetching; this decides
 * WHAT needs fetching and assembles the result, which is the part worth testing
 * on its own.
 *
 * THE PROBLEM THIS SOLVES. A snapshot records one sha per repository
 * (`source_commit_map`), and a metric anchored to that snapshot must measure to
 * those commits — not to whatever the branches point at today. But the analysis
 * that just ran already returned each repository's head sha AND its date, so
 * whenever the head still IS the pin, the date is already in hand. Only a
 * snapshot that has fallen behind its repositories costs extra requests, and a
 * freshly built one costs none at all.
 */

/** One pinned commit, and whether its date is already known from the analysis. */
export interface PinnedCommitNeed {
  readonly ref: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly sha: string;
  /** Non-null when the analysed head IS the pinned sha, so no request is needed. */
  readonly knownDate: string | null;
}

/**
 * Which pinned commits this run needs dates for.
 *
 * A repository absent from the commit map is skipped rather than defaulted to
 * its head: the snapshot did not pin it, so measuring to its head would quietly
 * substitute today's state for what was approved.
 */
export function pinnedCommitNeeds(
  analysed: readonly CaseStudyRepoFacts[],
  sourceCommitMap: Readonly<Record<string, string>>
): PinnedCommitNeed[] {
  const needs: PinnedCommitNeed[] = [];
  for (const facts of analysed) {
    const key = `${facts.repoOwner.toLowerCase()}/${facts.repoName.toLowerCase()}`;
    const pinned = sourceCommitMap[key] ?? sourceCommitMap[`${facts.repoOwner}/${facts.repoName}`];
    if (!pinned) continue;
    const headIsPin = facts.metadata.latestCommitSha === pinned;
    needs.push({
      ref: opaqueRepoRef(facts.repoOwner, facts.repoName),
      repoOwner: facts.repoOwner,
      repoName: facts.repoName,
      sha: pinned,
      knownDate: headIsPin ? facts.metadata.latestCommitAt : null,
    });
  }
  return needs;
}

export interface AssembleInput {
  readonly caseStudyId: string;
  readonly correlationId: string;
  readonly analysed: readonly CaseStudyRepoFacts[];
  /** Repositories attached to the case study that could not be analysed. */
  readonly unreadableRepoCount: number;
  readonly needs: readonly PinnedCommitNeed[];
  /** sha ⇒ committer date, for the needs whose `knownDate` was null. */
  readonly fetchedDates: Readonly<Record<string, string | null>>;
}

/**
 * Assemble the context, choosing the LATEST pinned commit as the measurement's end.
 *
 * WHY THE LATEST RATHER THAN A CHOSEN REPOSITORY. A case study is usually several
 * repositories, and "when did the work this snapshot describes conclude" is
 * answered by the last commit it pins — not by whichever repository happens to
 * sort first, and not by the one tagged `primary`, which would silently ignore
 * work done in every other repository. The existing snapshot builder picks its
 * evidence repository with `repos.find(...)`, which is fine for attribution and
 * would be arbitrary as the end of a measurement.
 *
 * A pin whose date could not be read is EXCLUDED rather than treated as absent:
 * it does not become the end, and it does not stop a readable one from being it.
 */
export function assembleMetricRunContext(input: AssembleInput): MetricRunContext {
  const repositories: MetricRepoInput[] = input.analysed.map((facts) => ({
    ref: opaqueRepoRef(facts.repoOwner, facts.repoName),
    facts,
  }));

  let latest: { sha: string; at: string } | null = null;
  for (const need of input.needs) {
    const at = need.knownDate ?? input.fetchedDates[need.sha] ?? null;
    if (!at) continue;
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) continue;
    if (latest === null || parsed > Date.parse(latest.at)) latest = { sha: need.sha, at };
  }

  return {
    caseStudyId: input.caseStudyId,
    correlationId: input.correlationId,
    repositories,
    unreadableRepoCount: input.unreadableRepoCount,
    pinnedCommitSha: latest?.sha ?? null,
    pinnedCommitAt: latest?.at ?? null,
  };
}
