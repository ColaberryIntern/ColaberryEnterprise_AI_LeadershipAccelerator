/**
 * caseStudySyncService — ONE idempotent sync (spec §29, §30, §38; plan T011).
 *
 * THIS MODULE IS A CONDUCTOR. It owns order, classification and the audit
 * record, and it owns nothing else. Every rule it appears to apply is applied by
 * the module that already owned it:
 *   · repository facts        → `caseStudyRepoAnalyzer.analyzeRepositories()`
 *   · manifest parsing        → `caseStudyManifestReader.readCaseStudyManifest()`
 *   · platform facts          → `caseStudyProjectSource` + `caseStudySyncSources`
 *   · evidence / artifacts    → `caseStudyEvidenceSource` (links, never mutates)
 *   · source precedence       → `caseStudySnapshotSections` / `…Overrides`
 *   · the hash                → `caseStudySnapshotBuilder` → `utils/canonicalHash`
 *   · "did anything change?"  → `caseStudySnapshotStore.persistCaseStudySnapshot()`
 *   · readiness               → `caseStudyReadinessService` (ADVISORY only)
 *   · provenance coverage     → `caseStudyProvenance.findUnknownProvenanceFields()`
 * There is no second hasher here, no second merge policy, and no readiness logic.
 *
 * ── THE HEADLINE PROPERTY (spec §30) ────────────────────────────────────────
 *
 *     same repo set + same SHAs + same Project/Evidence facts
 *       = same normalized snapshot hash = outcome `unchanged`, NO new row
 *
 * Two things make it hold. Nothing volatile reaches the builder (`generatedAt`
 * sits outside the hashed envelope). And the sync reloads the FULL metric and
 * artifact sets after linking rather than the newly-created subset the link
 * functions return — a subset is empty on a re-run, which would make run 2
 * differ from run 1 by construction. `caseStudySyncSources.ts` has the detail.
 *
 * ── A COLLAPSED REPOSITORY READ DOES NOT OVERWRITE A GOOD SNAPSHOT ──────────
 *
 * If SOME repositories fail the run is `partial` and a snapshot is still built
 * from the ones that succeeded — spec §29: one bad repository must never destroy
 * the candidate. If EVERY attached repository fails, NO snapshot is built: a
 * GitHub outage would otherwise replace a rich snapshot with an empty one and
 * call it progress, which spec §6.5 forbids. The run is `failed`, the existing
 * snapshot stays pinned, and the next good sync restores the facts.
 *
 * STATUS PRECEDENCE: `failed` > `partial` > `unchanged` > `success`. A run where
 * a repository failed AND content did not move is `partial`, not `unchanged` —
 * the failure is the headline, and `snapshotOutcome` still reports the rest.
 *
 * ── FAILURE-FIRST (root CLAUDE.md, required in writing) ─────────────────────
 *
 * 1. ON FAILURE. Before the audit row exists — a malformed request or an unknown
 *    case study id — this THROWS `CaseStudySyncError` (400/404); there is
 *    nothing to audit against, and the table carries a real FK to `case_studies`.
 *    After the row exists it NEVER throws: every path classifies, finalizes and
 *    returns, as `services/artifacts/artifactRepoSync.ts` does, because a throw
 *    would leave an audit row stuck at `running`.
 * 2. RETRY: NONE HERE, DELIBERATELY. `githubRepoClient` already caps its
 *    attempts and `caseStudySnapshotStore` caps the version race at three. A
 *    second layer would multiply outbound calls during the very outage that
 *    caused the failure, and CLAUDE.md prohibits unbounded retry loops.
 * 3. RECOVERY: run it again. No state is held between calls and every write is
 *    idempotent, so a re-run produces what the failed run would have. Nothing
 *    needs unwinding; the failed run stays in the ledger as evidence.
 * 4. HANDLED: unknown case study; no repositories attached; some failing
 *    (`partial`); all failing (`failed`, no snapshot); a dangling `project_id`;
 *    no enrollment behind the record; evidence/artifact linking failing; an
 *    unsupported (YAML) or malformed manifest; readiness throwing; a second
 *    identical sync; two simultaneous syncs; a finalize finding the row already
 *    terminal. NOT HANDLED: the database being unavailable (the `startSyncRun`
 *    insert propagates, as everywhere else here); cross-PROCESS concurrency,
 *    guarded by `cs_snapshots_unique_case_version` inside the snapshot store;
 *    webhook-driven invalidation, T011's documented deferral.
 *
 * ── PRIVACY, AND WHAT A SYNC MAY NEVER DO ───────────────────────────────────
 *
 * No log line carries a student email, an enrollment id, a card id or a private
 * repository's owner/name. `enrollmentId` links evidence and never reaches a log
 * or the result. Log identity goes through `repoLogIdentity()`, which fails
 * closed to an opaque handle on `unknown` visibility; the per-repo error list on
 * the audit row carries the `case_study_repositories` row id (already in the
 * same database) plus that handle, so the admin UI knows which repository failed
 * without the ledger naming one.
 *
 * A sync may never publish, approve a snapshot, or mark a metric `verified`.
 * Snapshots persist with the store's default `draft` status, no publication
 * model is imported, and no metric is written. The suite asserts all three.
 */
import { z } from 'zod';
import { ensureTraceId } from '../../utils/requestContext';
import { listRepositories } from './caseStudyRepoCollection';
import { analyzeRepositories } from './caseStudyRepoAnalyzer';
import type { AnalyzeRepositoryInput, CaseStudyRepoFacts } from './caseStudyRepoAnalyzer';
import { repoLogIdentity, opaqueRepoRef } from './caseStudyRepoReader';
import { PARSEABLE_MANIFEST_FILENAME, pickManifestFilename, readCaseStudyManifest } from './caseStudyManifestReader';
import type { CaseStudyManifest } from './caseStudyManifestReader';
import { isCaseStudyProjectSourceError, loadCaseStudyProjectFacts, toPlatformFactsSeed } from './caseStudyProjectSource';
import { linkPortfolioArtifacts, linkProjectEvidence } from './caseStudyEvidenceSource';
import { buildCaseStudySnapshot } from './caseStudySnapshotBuilder';
import { persistCaseStudySnapshot } from './caseStudySnapshotStore';
import { scoreCaseStudyReadiness } from './caseStudyReadinessService';
import { findUnknownProvenanceFields } from './caseStudyProvenance';
import {
  CaseStudySyncError, MAX_RECORDED_REPO_ERRORS, ZERO_SYNC_COUNTS, classifySyncStatus,
  errorClassOf, finalizeSyncRun, messageOf, repoKey, startSyncRun, syncLog,
  withCaseStudySyncLock,
} from './caseStudySyncRunStore';
import type {
  CaseStudySyncCounts, CaseStudySyncResult, SyncCaseStudyInput, SyncRepoError,
  SyncRepoIssue, SyncSnapshotOutcome,
} from './caseStudySyncRunStore';
import {
  buildPlatformFacts, countExtractedFacts, loadCandidateMetrics, loadCaseStudyRecord,
  loadLatestSnapshot, loadLinkedArtifacts, overridesFromSnapshot,
} from './caseStudySyncSources';
import type { CaseStudyProjectPlatformSeed } from './caseStudyProjectSource';
import type { SnapshotRepoInput } from './caseStudySnapshotInput';
import type { CaseStudySyncStatus, CaseStudySyncTrigger } from '../../types/caseStudy';

// One import site for consumers: the admin route (T013) should not have to know
// which of the two files a symbol happens to live in.
export {
  CaseStudySyncError, isCaseStudySyncError, withCaseStudySyncLock,
} from './caseStudySyncRunStore';
export type {
  CaseStudySyncCounts, CaseStudySyncResult, SyncCaseStudyInput, SyncRepoError,
  SyncRepoIssue, SyncSnapshotOutcome,
} from './caseStudySyncRunStore';

const TRIGGERS = ['manual', 'webhook', 'reconciliation', 'project_update'] as const;

// Zod v4 (`error.issues`, never `.errors`), validated at the service boundary —
// the `workLedgerService.emitEvent()` pattern. Only the scalar surface is
// checked: `fetchImpl` and `now` are internal injections from trusted callers.
const inputSchema = z.object({
  caseStudyId: z.uuid(),
  trigger: z.enum(TRIGGERS).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});

const MAX_REPORTED_PROVENANCE_GAPS = 20;

/* ───────────────────────────────────────────────────────────── internals ──── */

/**
 * Which manifest, if any, this repository declares (spec §8).
 *
 * BODY PRECEDENCE — an explicit `manifestContents` override wins, then the
 * analyzer's own `facts.manifestFile`:
 *
 *   1. `manifestContents[owner/name]` — an explicit act by a caller (an admin
 *      pasting a manifest, or a test). It wins because someone chose it on
 *      purpose, and silently preferring the repository's copy would make that
 *      choice do nothing.
 *   2. `facts.manifestFile.contents` — read from the repository by the analyzer
 *      during this same sync. This is the normal production path.
 *
 * Until the analyzer carried the body, path 2 did not exist, and a real
 * repository shipping a valid `case-study.json` had it fetched and then
 * discarded — the §8 feature was reachable only by injection and inert for
 * every actual caller. It failed silently, returning "no manifest" rather than
 * erroring, which is why it survived a full test suite.
 *
 * An unsupported (YAML) filename is still reported rather than guessed at, and
 * "no manifest" remains the normal case and never an issue.
 */
function manifestFor(
  facts: CaseStudyRepoFacts,
  contents: Readonly<Record<string, string>> | undefined,
  correlationId: string,
  caseStudyId: string,
): { manifest: CaseStudyManifest | null; issue: SyncRepoIssue | null } {
  // Prefer the filename the analyzer actually resolved; fall back to scanning the
  // read-file list for the injection-only path. Both route through the reader's
  // own precedence, so .yml still beats a .json sitting beside it.
  const filename = facts.manifestFile?.filename ?? pickManifestFilename(facts.filesRead);
  if (!filename) return { manifest: null, issue: null };
  const identity = repoLogIdentity(facts.repoOwner, facts.repoName, facts.metadata.visibility);
  const repoRef = identity.repo_ref ?? repoKey(facts.repoOwner, facts.repoName);
  const override = contents?.[repoKey(facts.repoOwner, facts.repoName)];
  const body = override ?? facts.manifestFile?.contents;
  if (filename === PARSEABLE_MANIFEST_FILENAME && body === undefined) {
    return { manifest: null, issue: null };
  }
  const read = readCaseStudyManifest(filename, body ?? null, {
    correlationId, caseStudyId, repoOwner: facts.repoOwner, repoName: facts.repoName,
  });
  if (read.status === 'parsed') return { manifest: read.manifest, issue: null };
  if (read.status === 'malformed' || read.status === 'unsupported_format') {
    return { manifest: null, issue: { repoRef, errorClass: read.error_class, path: filename } };
  }
  return { manifest: null, issue: null };
}

/* ──────────────────────────────────────────────────────── public surface ──── */

/**
 * Sync one Case Study: read its repositories, merge what the platform already
 * knows, build a DRAFT snapshot, and record an auditable run.
 *
 * @throws CaseStudySyncError — only before the audit row exists: a malformed
 * request (400) or an unknown case study id (404). Every later failure is
 * classified and returned.
 */
export async function syncCaseStudy(input: SyncCaseStudyInput): Promise<CaseStudySyncResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new CaseStudySyncError(
      'CaseStudySyncValidationError', `Malformed sync request: ${detail}`,
      { issues: parsed.error.issues },
    );
  }
  const caseStudyId = parsed.data.caseStudyId;
  const trigger: CaseStudySyncTrigger = parsed.data.trigger ?? 'manual';
  const correlationId = ensureTraceId(parsed.data.correlationId);
  const clock = input.now ?? (() => new Date());

  return withCaseStudySyncLock(caseStudyId, async () => {
    // BEFORE the row: an unknown record throws. `case_study_sync_runs` has a
    // real FK to `case_studies`, so there is no row to audit against anyway.
    const record = await loadCaseStudyRecord(caseStudyId);
    const startedAt = clock();
    const syncRunId = await startSyncRun({ caseStudyId, trigger, correlationId, startedAt });
    syncLog('case_study.sync_started', 'running', correlationId, {
      case_study_id: caseStudyId, slug: record.slug, sync_run_id: syncRunId, trigger,
    });

    let counts: CaseStudySyncCounts = ZERO_SYNC_COUNTS;
    const repoErrors: SyncRepoError[] = [];
    const repoIssues: SyncRepoIssue[] = [];
    let snapshotOutcome: SyncSnapshotOutcome = 'skipped';
    let snapshotId: string | null = null;
    let snapshotVersion: number | null = null;
    let contentHash: string | null = null;
    let readiness: { score: number; band: string } | null = null;
    let unknownProvenance: readonly string[] = [];
    let errorClass: string | null = null;
    let errorSummary: string | null = null;
    let status: Exclude<CaseStudySyncStatus, 'running'> = 'failed';
    const linkCounts = { evidenceCreated: 0, artifactsCreated: 0 };

    try {
      /* 1 ─ repositories, analysed by the module that owns that ------------- */
      const records = await listRepositories({ caseStudyId, correlationId });
      const byKey = new Map(records.map((r) => [repoKey(r.repoOwner, r.repoName), r]));
      const inputs: AnalyzeRepositoryInput[] = records.map((r) => ({
        owner: r.repoOwner, repo: r.repoName, correlationId, fetchImpl: input.fetchImpl,
      }));
      const analysis = await analyzeRepositories(inputs, { correlationId });

      for (const failure of analysis.failures.slice(0, MAX_RECORDED_REPO_ERRORS)) {
        const attached = byKey.get(repoKey(failure.repoOwner, failure.repoName));
        repoErrors.push({
          repositoryId: attached?.id ?? null,
          repoRef: opaqueRepoRef(failure.repoOwner, failure.repoName),
          errorClass: failure.error.error_class,
          message: failure.error.message,
        });
      }
      for (const issue of analysis.issues) {
        repoIssues.push({
          repoRef: opaqueRepoRef(issue.repoOwner, issue.repoName),
          errorClass: issue.error_class,
          ...(issue.path ? { path: issue.path } : {}),
        });
      }

      /* 2 ─ repo inputs for the builder, manifests included where readable -- */
      const repos: SnapshotRepoInput[] = analysis.analyzed.map((facts) => {
        const attached = byKey.get(repoKey(facts.repoOwner, facts.repoName));
        const { manifest, issue } = manifestFor(facts, input.manifestContents, correlationId, caseStudyId);
        if (issue) repoIssues.push(issue);
        return {
          facts,
          role: attached?.role ?? 'other',
          allowPublicRepoLink: attached?.allowPublicRepoLink === true,
          manifest,
        };
      });

      /* 3 ─ platform facts: Project, evidence, artifacts, metrics ----------- */
      let projectSeed: CaseStudyProjectPlatformSeed | null = null;
      let enrollmentId: string | undefined;
      if (record.projectId) {
        try {
          const projectFacts = await loadCaseStudyProjectFacts({ projectId: record.projectId, correlationId });
          projectSeed = toPlatformFactsSeed(projectFacts);
          enrollmentId = projectFacts.enrollmentId;
        } catch (err) {
          // A dangling project id degrades the run; it does not end it.
          if (!isCaseStudyProjectSourceError(err)) throw err;
          repoIssues.push({ repoRef: 'project', errorClass: err.error_class });
        }
      }
      if (enrollmentId) {
        try {
          const evidence = await linkProjectEvidence({ caseStudyId, enrollmentId, correlationId });
          const artifacts = await linkPortfolioArtifacts({ caseStudyId, enrollmentId, correlationId });
          linkCounts.evidenceCreated = evidence.created;
          linkCounts.artifactsCreated = artifacts.created;
        } catch (err) {
          // Linking is additive. Losing it costs coverage, never the candidate.
          repoIssues.push({ repoRef: 'evidence', errorClass: errorClassOf(err) });
        }
      }
      // FULL sets, not the newly-created subsets — see the header on §30.
      const metrics = await loadCandidateMetrics(caseStudyId);
      const artifacts = await loadLinkedArtifacts(caseStudyId);

      counts = {
        reposAttempted: records.length,
        reposSucceeded: analysis.analyzed.length,
        reposFailed: analysis.failures.length,
        factsExtracted: analysis.analyzed.reduce((n, f) => n + countExtractedFacts(f), 0),
        candidateMetrics: metrics.length,
      };

      /* 4 ─ build + persist, unless the repository read collapsed ----------- */
      const collapsed = records.length > 0 && analysis.analyzed.length === 0;
      const degraded = repoErrors.length > 0 || repoIssues.length > 0;
      const latest = await loadLatestSnapshot(caseStudyId);

      if (collapsed) {
        // Keep the existing snapshot pinned (spec §6.5). Nothing is overwritten.
        snapshotId = latest?.id ?? null;
        snapshotVersion = latest?.version ?? null;
        contentHash = latest?.contentHash ?? null;
        errorClass = repoErrors[0]?.errorClass ?? 'Unknown';
        errorSummary = `every attached repository failed to analyse (${records.length} of ${records.length})`;
      } else {
        const draft = buildCaseStudySnapshot({
          caseStudyId,
          platform: buildPlatformFacts({ record, projectSeed, metrics, artifacts }),
          repos,
          overrides: overridesFromSnapshot(latest),
          correlationId,
          now: input.now,
        });
        // No `status` argument: the store defaults to `draft`. A sync never
        // approves, and approval is a separate human step (spec §17).
        const persisted = await persistCaseStudySnapshot({ caseStudyId, draft, correlationId });
        snapshotOutcome = persisted.outcome;
        snapshotId = persisted.snapshotId;
        snapshotVersion = persisted.version;
        contentHash = persisted.contentHash;
        unknownProvenance = findUnknownProvenanceFields(draft.content, draft.provenance)
          .slice(0, MAX_REPORTED_PROVENANCE_GAPS);
        try {
          const report = scoreCaseStudyReadiness({ content: draft.content, status: record.status });
          readiness = { score: report.score, band: report.band };
        } catch (err) {
          // Advisory. A rubric that cannot score must not fail a sync.
          repoIssues.push({ repoRef: 'readiness', errorClass: errorClassOf(err) });
        }
      }

      status = classifySyncStatus(collapsed, degraded, snapshotOutcome);
      if (degraded && !errorClass) {
        errorClass = repoErrors[0]?.errorClass ?? repoIssues[0]?.errorClass ?? null;
        errorSummary = `${repoErrors.length} repository failure(s), ${repoIssues.length} issue(s)`;
      }
    } catch (err) {
      // After the audit row exists this function does not throw. It classifies.
      status = 'failed';
      errorClass = errorClassOf(err);
      errorSummary = messageOf(err);
      snapshotOutcome = snapshotId ? snapshotOutcome : 'skipped';
    }

    const completedAt = clock();
    try {
      await finalizeSyncRun({
        syncRunId, status, counts, snapshotId, errorClass, errorSummary, completedAt,
        metadata: {
          repo_errors: repoErrors,
          repo_issues: repoIssues,
          snapshot_outcome: snapshotOutcome,
          snapshot_version: snapshotVersion,
          content_hash: contentHash,
          evidence_linked: linkCounts.evidenceCreated,
          artifacts_linked: linkCounts.artifactsCreated,
          unknown_provenance_fields: unknownProvenance,
          readiness,
        },
      });
    } catch (err) {
      // The row stays `running`, which reads as "started, never completed" —
      // the honest state. The result still reaches the caller.
      syncLog('case_study.sync_finalize_failed', 'failure', correlationId, {
        case_study_id: caseStudyId, sync_run_id: syncRunId, error_class: errorClassOf(err),
      });
    }

    syncLog('case_study.sync_completed', status === 'failed' ? 'failure' : status,
      correlationId, {
        case_study_id: caseStudyId, slug: record.slug, sync_run_id: syncRunId, trigger, status,
        snapshot_id: snapshotId, snapshot_outcome: snapshotOutcome,
        ...(contentHash ? { content_hash: contentHash } : {}),
        ...(snapshotVersion !== null ? { snapshot_version: snapshotVersion } : {}),
        repos_attempted: counts.reposAttempted, repos_succeeded: counts.reposSucceeded,
        repos_failed: counts.reposFailed, facts_extracted: counts.factsExtracted,
        candidate_metrics: counts.candidateMetrics,
        repo_refs: repoErrors.map((e) => e.repoRef).sort(),
        unknown_provenance_fields: unknownProvenance.length,
        ...(readiness ? { readiness_score: readiness.score } : {}),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        ...(errorClass ? { error_class: errorClass } : {}),
      });

    return {
      syncRunId, caseStudyId, status, trigger, correlationId, counts,
      snapshotId, snapshotVersion, snapshotOutcome, contentHash,
      repoErrors, repoIssues, errorClass, errorSummary, readiness,
      unknownProvenanceFields: unknownProvenance,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  });
}
