import CaseStudyRepositoryModel from '../../models/CaseStudyRepository';
import type { CaseStudyRepoFacts } from './caseStudyRepoAnalyzer';
import type { CaseStudyRepositoryRecord } from './caseStudyRepoRecord';

/**
 * caseStudyRepoProvenanceWriter — write back what the sync just learned about a
 * repository: the commit it read, when that commit landed, and the branch.
 *
 * WHY THIS EXISTS. `case_study_repositories.last_seen_sha`, `.last_synced_at` and
 * `.default_branch` were declared on the model, read by `toRecord`, and projected
 * to the public detail page as the repository's `lastCommitDate` — and NOTHING in
 * the backend ever wrote them. They were permanently null on every Case Study, so
 * the public page has always shown a repository with no last-seen commit and no
 * sync time, and evidence rows could not be pinned to a commit because there was
 * no commit recorded to pin them to.
 *
 * It surfaced from the other end: creating repository-backed evidence for a
 * published case study, the pin came back `(none recorded)` twice. The field a
 * reader would use to check a claim was empty because the writer was missing, not
 * because the sync did not know — `analyzeRepository` has carried
 * `metadata.latestCommitSha` and `latestCommitAt` all along.
 *
 * FAILURE-FIRST (root CLAUDE.md):
 *  1. On failure: the SYNC MUST NOT FAIL because provenance could not be stored.
 *     A sync that produced a good snapshot and then threw on a bookkeeping write
 *     would turn a complete run into a failed one. Errors are logged and swallowed
 *     here, deliberately, and the function reports how many rows it updated so a
 *     silent zero is visible in the sync log rather than inferred.
 *  2. Retry: none. The next sync writes the same fields again.
 *  3. Recovery: re-running the sync.
 *  4. Handled: a repo in the analysis that is no longer attached, a missing sha,
 *     an unparseable date. NOT handled: the database being unavailable, which is
 *     logged and skipped like any other write failure here.
 *
 * IDEMPOTENT: same analysis in, same row state out. `last_synced_at` moves because
 * it records when the read happened, which is the one field that SHOULD change on
 * a re-run.
 */

export interface RepoProvenanceResult {
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
}

const key = (owner: string, name: string): string => `${owner}/${name}`.toLowerCase();

export async function writeRepoProvenance(
  analyzed: readonly CaseStudyRepoFacts[],
  attached: readonly CaseStudyRepositoryRecord[],
  syncedAt: Date,
): Promise<RepoProvenanceResult> {
  const byKey = new Map(attached.map((r) => [key(r.repoOwner, r.repoName), r]));
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const facts of analyzed) {
    const row = byKey.get(key(facts.repoOwner, facts.repoName));
    if (!row) { skipped += 1; continue; }

    const meta = (facts.metadata ?? {}) as {
      latestCommitSha?: string | null;
      latestCommitAt?: string | null;
      defaultBranch?: string | null;
    };
    const sha = typeof meta.latestCommitSha === 'string' && meta.latestCommitSha ? meta.latestCommitSha : null;

    // `last_synced_at` is written even when the sha is unknown: the read DID
    // happen, and recording that separately from what it found is the honest
    // shape. A row with a sync time and no sha says "we looked and could not
    // establish a head", which is different from "we never looked".
    const patch: Record<string, unknown> = { last_synced_at: syncedAt };
    // A commit DATE with no sha is half a fact and is not stored: the sha is what
    // makes the date checkable, and a date alone would look like provenance
    // without being any.
    if (sha) patch.last_seen_sha = sha;
    if (typeof meta.defaultBranch === 'string' && meta.defaultBranch) {
      patch.default_branch = meta.defaultBranch;
    }

    try {
      await CaseStudyRepositoryModel.update(patch, { where: { id: row.id } });
      updated += 1;
    } catch (err) {
      failed += 1;
      // Swallowed on purpose — see the header. Logged so a persistent failure is
      // visible rather than a quietly empty column.
      console.warn(JSON.stringify({
        level: 'warn', service: 'case-study-sync', event: 'repo_provenance_write_failed',
        outcome: 'failure', repository_id: row.id,
        error_class: (err as { name?: string })?.name ?? 'Error',
      }));
    }
  }

  return { updated, skipped, failed };
}
