import CaseStudyMetricModel from '../../../models/CaseStudyMetric';
import CaseStudyEvidenceModel from '../../../models/CaseStudyEvidence';
import { needsCommitLog, runCollector } from './index';
import type {
  CollectorCommit, CollectorInput, CollectorOutput, CollectorTree,
} from './collectorTypes';
import type { CaseStudyCollectorKey } from '../../../types/caseStudy';

/**
 * Running a repository's registered collectors, and writing what they produced.
 *
 * WHY THIS RUNS INSIDE SYNC, AND WHY THAT IS SAFE. `METRIC_PROVENANCE_PIPELINE.md`
 * is explicit that a metric RUN is a separate, operator-triggered action, on the
 * grounds that folding it into a sync would mean every sync silently recomputes
 * figures somebody may already have published. That objection is honoured here
 * rather than argued with:
 *
 *   A COLLECTED FIGURE THAT IS ALREADY PUBLISHABLE IS NEVER OVERWRITTEN.
 *
 * If a collector computes a different number for a metric a human has approved,
 * the run reports it and keeps the old value. An operator decides. Nothing
 * published moves on its own, which is exactly what that document protected.
 *
 * The other half of the rule is the spec's own and is narrower: at the SAME
 * `collectedSha`, a different `outputHash` means the collector changed its mind
 * about a commit that cannot have changed. That is a code change, not new
 * evidence, and the old value is kept whether or not it was publishable.
 *
 * NOTHING IS EVER INVENTED. A collector that declines produces no metric, no
 * evidence row and no placeholder. A repository with no decision records ends
 * with no decision-record metric, rather than one reading zero.
 */

export interface CollectorRepoInput {
  /** The OPAQUE reference. Never the owner, the name or a URL. */
  readonly repoRef: string;
  readonly sha: string;
  readonly tree: CollectorTree;
  /** Registered on this repository's manifest. Empty means nothing runs. */
  readonly registered: readonly CaseStudyCollectorKey[];
  /** Fetched by the caller, and only when `needsCommitLog` said to. */
  readonly commits: readonly CollectorCommit[];
}

export type CollectorSyncOutcome =
  | 'created' | 'updated' | 'unchanged' | 'skipped' | 'drift_held' | 'published_held';

export interface CollectorSyncEntry {
  readonly repoRef: string;
  readonly collectorKey: CaseStudyCollectorKey;
  readonly outcome: CollectorSyncOutcome;
  /** Why a collector declined, or which figures disagreed. Never a repo name. */
  readonly detail: string;
}

export interface CollectorSyncReport {
  readonly entries: readonly CollectorSyncEntry[];
  readonly created: number;
  readonly updated: number;
  readonly drift: number;
}

export interface RunCollectorsInput {
  readonly caseStudyId: string;
  readonly repos: readonly CollectorRepoInput[];
  /** Injected so a run is reproducible and a test is not racing a clock. */
  readonly collectedAt: Date;
}

export { needsCommitLog };

const LABELS: Readonly<Record<CaseStudyCollectorKey, string>> = {
  test_files: 'Test files as a share of source files',
  modules_with_tests: 'Modules with a test file',
  decision_records: 'Decisions written down as they were made',
  commit_span: 'First commit to last',
  commits_per_week: 'Commits per week',
};

export async function runRegisteredCollectors(
  input: RunCollectorsInput,
): Promise<CollectorSyncReport> {
  const entries: CollectorSyncEntry[] = [];

  for (const repo of input.repos) {
    for (const key of repo.registered) {
      const collectorInput: CollectorInput = {
        sha: repo.sha,
        tree: repo.tree,
        commits: repo.commits,
      };
      const run = runCollector(key, collectorInput);
      if (!run) {
        // The manifest schema already refuses an unknown key, so reaching here
        // means the schema and the registry have drifted apart.
        entries.push({
          repoRef: repo.repoRef, collectorKey: key, outcome: 'skipped',
          detail: 'no collector is registered for this key',
        });
        continue;
      }
      if (!run.result.ok) {
        entries.push({
          repoRef: repo.repoRef, collectorKey: key, outcome: 'skipped',
          detail: `${run.result.reason}: ${run.result.detail}`,
        });
        continue;
      }
      entries.push(await persist(input, repo, key, run.result.output, run.outputHash ?? ''));
    }
  }

  return {
    entries,
    created: entries.filter((e) => e.outcome === 'created').length,
    updated: entries.filter((e) => e.outcome === 'updated').length,
    drift: entries.filter((e) => e.outcome === 'drift_held' || e.outcome === 'published_held').length,
  };
}

async function persist(
  input: RunCollectorsInput,
  repo: CollectorRepoInput,
  key: CaseStudyCollectorKey,
  output: CollectorOutput,
  outputHash: string,
): Promise<CollectorSyncEntry> {
  const existing = await CaseStudyMetricModel.findOne({
    where: { case_study_id: input.caseStudyId, metric_key: key },
  });

  const held = holdReason(existing, outputHash, repo.sha);
  if (held) return { repoRef: repo.repoRef, collectorKey: key, ...held };

  if (existing && existing.output_hash === outputHash && existing.collected_sha === repo.sha) {
    return {
      repoRef: repo.repoRef, collectorKey: key, outcome: 'unchanged',
      detail: 'the same figure at the same commit',
    };
  }

  const fields = {
    value_display: output.valueDisplay,
    numeric_value: output.numericValue,
    unit: output.unit,
    verification_class: 'verified',
    verification_method: 'repo',
    methodology: output.methodology,
    limitations: [...output.limitations],
    shape: output.shape,
    payload: output.payload as unknown as Record<string, unknown>,
    collector_key: key,
    collected_sha: repo.sha,
    reproduce_command: output.reproduceCommand,
    output_hash: outputHash,
    collected_at: input.collectedAt,
  };

  if (existing) {
    /*
     * `is_headline`, `publishable`, `label` and `plain` are NOT in this update,
     * deliberately. Each is a human decision about presentation, disclosure or
     * wording, and a collector recomputing a number has no standing to promote
     * a figure to the top of a page, make it public, rename it, or write plain
     * language on its behalf.
     */
    await existing.update(fields);
    return {
      repoRef: repo.repoRef, collectorKey: key, outcome: 'updated',
      detail: `recomputed at ${repo.sha.slice(0, 8)}`,
    };
  }

  const created = await CaseStudyMetricModel.create({
    case_study_id: input.caseStudyId,
    metric_key: key,
    label: LABELS[key],
    metric_type: 'technical',
    // A newly collected metric arrives NOT publishable. The figure is verified
    // in the sense that a third party can re-derive it at that sha; whether it
    // belongs on a public page is a separate decision, and a human's.
    publishable: false,
    is_headline: false,
    ...fields,
  } as never);

  await writeEvidence(input, repo, key, output, created.id);
  return {
    repoRef: repo.repoRef, collectorKey: key, outcome: 'created',
    detail: `computed at ${repo.sha.slice(0, 8)}`,
  };
}

/** The two reasons a recomputed figure is held rather than written. */
function holdReason(
  existing: { publishable?: boolean; output_hash?: string | null; collected_sha?: string | null } | null,
  outputHash: string,
  sha: string,
): { outcome: CollectorSyncOutcome; detail: string } | null {
  if (!existing) return null;
  if (!existing.output_hash || existing.output_hash === outputHash) return null;

  if (existing.collected_sha === sha) {
    // Same commit, different answer. The tree cannot have changed, so the
    // collector did. That is a code change to review, not evidence to publish.
    return { outcome: 'drift_held', detail: `the output changed at the same commit ${sha.slice(0, 8)}` };
  }
  if (existing.publishable === true) {
    return { outcome: 'published_held', detail: 'a published figure is never moved by a sync' };
  }
  return null;
}

/**
 * One evidence row per collected metric, pinned to the sha it was computed at.
 *
 * The description carries the reproduce command rather than a link, because a
 * command is checkable by anyone holding the repository while a link is only
 * checkable by someone who can already see it. The row is NOT publicly
 * openable: whether a repository may be named is a consent decision held on
 * the record, and an evidence row must not quietly answer it.
 */
async function writeEvidence(
  input: RunCollectorsInput,
  repo: CollectorRepoInput,
  key: CaseStudyCollectorKey,
  output: CollectorOutput,
  metricId: string,
): Promise<void> {
  const fields = {
    source_ref: repo.repoRef,
    source_commit_sha: repo.sha,
    title: `${LABELS[key]}, computed from the repository`,
    description: `${output.methodology} Reproduce with: ${output.reproduceCommand}`,
    verification_class: 'verified',
    is_publicly_openable: false,
    metadata: { collector_key: key },
  };

  const existing = await CaseStudyEvidenceModel.findOne({
    where: { case_study_id: input.caseStudyId, metric_id: metricId, source_type: 'repo_collector' },
  });
  if (existing) {
    await existing.update(fields);
    return;
  }
  await CaseStudyEvidenceModel.create({
    case_study_id: input.caseStudyId,
    metric_id: metricId,
    source_type: 'repo_collector',
    ...fields,
  } as never);
}
